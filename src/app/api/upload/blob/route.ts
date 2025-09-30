import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { put } from '@vercel/blob'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS } from '@/lib/clientValidation'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/fileProcessors'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { processDocumentVectors } from '@/lib/ingest'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'

// Helper function to clean text content for database storage
function cleanTextContent(content: string): string {
  if (!content) return ''

  return content
    // Remove null bytes (main cause of PostgreSQL error)
    .replace(/\u0000/g, '')
    // Remove other problematic control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(_request: NextRequest) {
  try {
    // RATE LIMITING - Check this FIRST
    const identifier = getIdentifier(_request)
    const rateLimitResult = uploadRateLimit(identifier)
    
    if (!rateLimitResult.success) {
      return NextResponse.json({
        success: false,
        error: rateLimitResult.message,
      }, { status: 429 })
    }

    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current user and check permissions
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Only administrators and contributors can upload files' },
        { status: 403 }
      )
    }

    // Get the file and metadata from form data
    const formData = await _request.formData()
    const file = formData.get('file') as File

    // Extract document metadata from form data
    const title = formData.get('title') as string
    const author = formData.get('author') as string
    const sourceType = formData.get('sourceType') as string
    const sourceUrl = formData.get('sourceUrl') as string
    const amazon_url = formData.get('amazon_url') as string
    const resource_url = formData.get('resource_url') as string
    const download_enabled = formData.get('download_enabled') as string
    const contact_person = formData.get('contact_person') as string
    const contact_email = formData.get('contact_email') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size (allow up to 150MB for blob storage)
    const maxSize = 150 * 1024 * 1024 // 150MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 150MB limit' },
        { status: 400 }
      )
    }

    // Enhanced file type validation with extension fallback
    const getFileExtension = (filename: string): string => {
      return filename.toLowerCase().substring(filename.lastIndexOf('.'))
    }

    const fileExtension = getFileExtension(file.name)
    const isSupportedMimeType = SUPPORTED_MIME_TYPES.includes(file.type)
    const isSupportedExtension = SUPPORTED_EXTENSIONS.includes(fileExtension)

    if (!isSupportedMimeType && !isSupportedExtension) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.name} (${file.type}). Supported types: TXT, MD, PDF, DOCX, PPTX, Images, Audio, Video` },
        { status: 400 }
      )
    }

    console.log(`Uploading large file to Vercel Blob: ${file.name} (${file.size} bytes)`)

    // Check if Vercel Blob token is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'your_vercel_blob_token_here') {
      return NextResponse.json({
        success: false,
        error: 'Vercel Blob storage is not configured. Please set up BLOB_READ_WRITE_TOKEN in your environment variables. Visit https://vercel.com/dashboard → Storage → Blob to create a token.'
      }, { status: 503 })
    }

    // Check if file already exists in blob storage
    try {
      const { head } = await import('@vercel/blob')
      await head(file.name, { token: process.env.BLOB_READ_WRITE_TOKEN })

      // If we get here, the file exists
      return NextResponse.json({
        success: false,
        error: `File "${file.name}" has already been uploaded. Please rename the file or delete the existing one before uploading.`
      }, { status: 409 }) // 409 Conflict
    } catch (error) {
      // File doesn't exist (head() throws if not found), continue with upload
      console.log(`File ${file.name} does not exist in blob storage, proceeding with upload`)
    }

    // Upload to Vercel Blob storage without random suffix
    const blob = await put(file.name, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false, // Use original filename
    })

    console.log(`Successfully uploaded to Vercel Blob: ${blob.url}`)

    // Sanitize inputs
    const cleanTitle = sanitizeInput(title || file.name)
    const cleanAuthor = author ? sanitizeInput(author) : null
    const cleanAmazonUrl = amazon_url ? sanitizeInput(amazon_url) : null
    const cleanResourceUrl = resource_url ? sanitizeInput(resource_url) : null
    const cleanContactPerson = contact_person ? sanitizeInput(contact_person) : null
    const cleanContactEmail = contact_email ? sanitizeInput(contact_email) : null

    // Check if document with same title already exists
    const { data: existingDoc } = await supabaseAdmin
      .from('documents')
      .select('id, title')
      .eq('title', cleanTitle)
      .single()

    if (existingDoc) {
      return NextResponse.json({
        success: false,
        error: `A document with the title "${cleanTitle}" already exists in the database. Please use a different title or delete the existing document first.`
      }, { status: 409 }) // 409 Conflict
    }

    console.log(`Processing blob file: ${blob.url}`)

    // Initial delay to allow Vercel Blob propagation (large files need more time)
    console.log('Waiting for Vercel Blob propagation...')
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10 second initial delay

    // Try multiple times with longer delays for blob propagation
    let response: Response | null = null
    let downloadError: string | null = null

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`Download attempt ${attempt}/5 for ${blob.url}`)
        response = await fetch(blob.url)

        if (response.ok) {
          console.log(`Successfully downloaded blob on attempt ${attempt}`)
          break
        } else {
          console.warn(`Download attempt ${attempt} failed with status:`, response.status, response.statusText)
          downloadError = `${response.status} ${response.statusText}`

          // Wait before retrying with longer delays
          if (attempt < 5) {
            const delay = Math.pow(2, attempt) * 3000 // 6s, 12s, 24s, 48s
            console.log(`Waiting ${delay}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      } catch (error) {
        downloadError = 'Network error'

        if (attempt < 5) {
          const delay = Math.pow(2, attempt) * 3000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    if (!response || !response.ok) {
      console.error('Failed to download file from blob storage after all retries:', downloadError)
      return NextResponse.json(
        { success: false, error: `Failed to download file from blob storage: ${downloadError}. The file may need time to propagate or there may be a permissions issue.` },
        { status: 500 }
      )
    }

    // Convert to buffer for processing
    const buffer = Buffer.from(await response.arrayBuffer())

    // Extract text content
    console.log(`Extracting text from ${file.name}...`)
    const extraction = await extractTextFromFile(buffer, file.type, file.name)

    if (!extraction.content) {
      console.error('Text extraction failed: No content extracted')
      return NextResponse.json(
        { success: false, error: 'Failed to extract text from file' },
        { status: 400 }
      )
    }

    console.log(`Extracted ${extraction.wordCount} words from ${file.name}`)

    // Clean the extracted content to prevent database errors
    const cleanedContent = cleanTextContent(extraction.content)

    if (!cleanedContent) {
      console.error('Content cleaning resulted in empty text')
      return NextResponse.json(
        { success: false, error: 'Document content could not be processed (contains unsupported characters)' },
        { status: 400 }
      )
    }

    // Save document record to database with cleaned content
    console.log('Saving document record to database...')

    // Prepare document record with multimedia support
    const documentRecord: Record<string, unknown> = {
      title: cleanTitle,
      author: cleanAuthor,
      content: cleanedContent,
      source_type: sourceType || 'upload',
      source_url: sourceUrl || null,
      amazon_url: cleanAmazonUrl,
      resource_url: cleanResourceUrl,
      download_enabled: download_enabled !== undefined ? Boolean(download_enabled) : true,
      contact_person: cleanContactPerson,
      contact_email: cleanContactEmail,
      uploaded_by: user.id,
      file_size: file.size,
      mime_type: file.type,
      storage_path: blob.url, // Use storage_path to store blob URL
      word_count: extraction.wordCount,
      page_count: extraction.pageCount || null,
      processed_at: new Date().toISOString()
    }

    // Note: Multimedia metadata would be stored in a metadata column if it existed
    // For now, skip metadata storage until database schema is updated

    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert(documentRecord)
      .select()
      .single()

    if (dbError) {
      return NextResponse.json(
        { success: false, error: 'Failed to save document to database' },
        { status: 500 }
      )
    }

    console.log(`Document saved with ID: ${document.id}`)

    // Start vector processing in the background
    try {
      await processDocumentVectors(document.id, userId)

      // Track first document upload milestone
      await trackOnboardingMilestone({
        clerkUserId: userId,
        milestone: 'first_document_upload',
        metadata: {
          documentTitle: cleanTitle,
          fileSize: file.size,
          mimeType: file.type,
          document_id: document.id
        }
      })

      console.log(`Successfully processed: ${cleanTitle}`)
    } catch (ingestionError) {
      console.error('Error starting ingest job:', ingestionError)
      // Don't fail the upload if ingestion fails - it can be retried later
    }

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded and processed: ${cleanTitle}`,
      document: {
        id: document.id,
        title: document.title,
        author: document.author,
        wordCount: document.word_count,
        pageCount: document.page_count,
        fileSize: document.file_size,
        mimeType: document.mime_type,
        createdAt: document.created_at
      }
    })

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to upload to blob storage' 
      },
      { status: 500 }
    )
  }
}