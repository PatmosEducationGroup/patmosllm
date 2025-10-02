import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/fileProcessors'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
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

    // Get current user
    const user = await getCurrentUser()
    console.log('Blob process route - user data:', JSON.stringify(user, null, 2))

    if (!user || !['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      console.log('Blob process route - role check failed. User role:', user?.role)
      return NextResponse.json(
        { success: false, error: 'Only administrators and contributors can upload files' },
        { status: 403 }
      )
    }

    // Get request data
    const { 
      blobUrl, 
      fileName, 
      fileSize, 
      mimeType, 
      title, 
      author, 
      sourceType, 
      sourceUrl,
      amazon_url,
      resource_url,
      download_enabled,
      contact_person,
      contact_email
    } = await _request.json()

    if (!blobUrl || !fileName) {
      return NextResponse.json(
        { success: false, error: 'Blob URL and filename required' },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const cleanTitle = sanitizeInput(title || fileName)
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

    console.log(`Processing blob file: ${blobUrl}`)

    // Download file from Vercel Blob for processing with retry logic
    let response: Response | null = null
    let downloadError: string | null = null

    // Initial delay to allow Vercel Blob propagation (large files need more time)
    console.log('Waiting for Vercel Blob propagation...')
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10 second initial delay

    // Try multiple times with longer delays for blob propagation
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`Download attempt ${attempt}/5 for ${blobUrl}`)
        response = await fetch(blobUrl)

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
      } catch (_error) {
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
    console.log(`Extracting text from ${fileName}...`)
    const extraction = await extractTextFromFile(buffer, mimeType, fileName)

    if (!extraction.content) {
      console.error('Text extraction failed: No content extracted')
      return NextResponse.json(
        { success: false, error: 'Failed to extract text from file' },
        { status: 400 }
      )
    }

    console.log(`Extracted ${extraction.wordCount} words from ${fileName}`)

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
      download_enabled: download_enabled || false,
      contact_person: cleanContactPerson,
      contact_email: cleanContactEmail,
      uploaded_by: user.id,
      file_size: fileSize,
      mime_type: mimeType,
      storage_path: blobUrl, // Use storage_path to store blob URL for now
      word_count: extraction.wordCount,
      page_count: extraction.pageCount || null,
      processed_at: new Date().toISOString()
    }

    // Add multimedia-specific metadata if available
    if (extraction.metadata) {
      documentRecord.metadata = extraction.metadata
    }
    // Note: duration is stored in metadata.duration for multimedia files

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
          fileSize: fileSize,
          mimeType: mimeType
        }
      })
      
      console.log(`Successfully processed: ${cleanTitle}`)
    } catch (ingestionError) {
      console.error('Error starting ingest job:', ingestionError)
      // Don't fail the upload if ingestion fails - it can be retried later
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        author: document.author,
        wordCount: extraction.wordCount
      }
    })

  } catch (_error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Processing failed' 
      },
      { status: 500 }
    )
  }
}