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
import { cleanTitle } from '@/lib/titleCleaner'

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
  // Get current user
const user = await getCurrentUser()
console.log('Upload route - user data:', JSON.stringify(user, null, 2))

if (!user || !['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
  console.log('Upload route - role check failed. User role:', user?.role)
  return NextResponse.json(
    { success: false, error: 'Only administrators and contributors can upload files' },
    { status: 403 }
  )
}

    // Get request data
    const {
  storagePath,
  fileName,
  fileSize,
  mimeType,
  title,
  author,
  sourceType,
  sourceUrl,
  amazon_url,
  download_enabled,
  contact_person,
  contact_email
} = await _request.json()

    if (!storagePath || !fileName) {
      return NextResponse.json(
        { success: false, error: 'Storage path and filename required' },
        { status: 400 }
      )
    }

    // Validate file size
    if (fileSize > 50 * 1024 * 1024) { // 50MB
      return NextResponse.json(
        { success: false, error: 'File size exceeds 50MB limit' },
        { status: 400 }
      )
    }

    // Sanitize and clean inputs
    const rawTitle = title || fileName
    const sanitizedTitle = sanitizeInput(rawTitle)
    const cleanedTitle = cleanTitle(sanitizedTitle)
    const cleanAuthor = author ? sanitizeInput(author) : null
    const cleanAmazonUrl = amazon_url ? sanitizeInput(amazon_url) : null
    const cleanContactPerson = contact_person ? sanitizeInput(contact_person) : null
    const cleanContactEmail = contact_email ? sanitizeInput(contact_email) : null

    console.log(`Processing uploaded file: ${storagePath}`)

    // Download file from Supabase Storage for processing
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .download(storagePath)

    if (downloadError) {
      console.error('Error downloading file from storage:', downloadError)
      return NextResponse.json(
        { success: false, error: 'Failed to download file for processing' },
        { status: 500 }
      )
    }

    // Convert blob to buffer for processing
    const buffer = Buffer.from(await fileData.arrayBuffer())

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
      title: cleanedTitle,
      author: cleanAuthor,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size: fileSize,
      content: cleanedContent,
      word_count: extraction.wordCount,
      page_count: extraction.pageCount || null,
      uploaded_by: user.id,
      processed_at: new Date().toISOString(),
      source_type: sourceType || 'upload',
      source_url: sourceUrl || null,
      // Add metadata fields
      amazon_url: cleanAmazonUrl,
      download_enabled: download_enabled !== undefined ? Boolean(download_enabled) : true,
      contact_person: cleanContactPerson,
      contact_email: cleanContactEmail
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
      
      // Provide more specific error messages for common issues
      let errorMessage = 'Failed to save document record'
      
      if (dbError.code === '22P05') {
        errorMessage = 'Document contains unsupported characters'
      } else if (dbError.code === '23505') {
        errorMessage = 'A document with this name already exists'
      } else if (dbError.code === '23502') {
        errorMessage = 'Missing required document information'
      }
      
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      )
    }

    console.log(`Document saved with ID: ${document.id}`)

    // Start vector processing job
    try {
      await processDocumentVectors(document.id, user.id)
      console.log('Vector processing job started')
    } catch (ingestError) {
      console.error('Error starting ingest job:', ingestError)
      // Don't fail the upload if vector processing fails
    }

    // Track onboarding milestone AFTER successful upload
    try {
      await trackOnboardingMilestone({
        clerkUserId: userId, // userId is guaranteed to be string here
        milestone: 'first_document_upload',
        metadata: {
          document_name: fileName,
          document_title: cleanTitle,
          file_size: fileSize,
          mime_type: mimeType,
          word_count: extraction.wordCount,
          document_id: document.id
        }
      })
    } catch (milestoneError) {
      // Log but don't fail the upload
      console.error('Failed to track onboarding milestone:', milestoneError)
    }

    console.log(`Successfully processed: ${cleanTitle}`)

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
        error: 'Processing failed' 
      },
      { status: 500 }
    )
  }
}