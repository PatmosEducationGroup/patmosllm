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
import { loggers, logError } from '@/lib/logger'

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
    const identifier = await getIdentifier(_request)
    const rateLimitResult = uploadRateLimit(identifier)
    
    if (!rateLimitResult.success) {
      return NextResponse.json({
        success: false,
        error: rateLimitResult.message,
      }, { status: 429 })
    }

    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
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

    loggers.performance({
      operation: 'blob_upload_start',
      filename: file.name.substring(0, 50),
      fileSize: file.size,
      fileType: file.type,
      userId: user.id
    }, 'Starting Vercel Blob upload')

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
      // This is expected behavior - only log if it's an unexpected error
      if (error instanceof Error && !error.message.includes('not found') && !error.message.includes('404')) {
        logError(error, {
          operation: 'blob_file_existence_check',
          fileName: file.name,
          userId,
          phase: 'pre_upload_validation',
          severity: 'low'
        })
      }
      loggers.performance({
        operation: 'blob_check_not_found',
        filename: file.name.substring(0, 50),
        userId
      }, 'File not found in blob storage, proceeding with upload')
    }

    // Upload to Vercel Blob storage without random suffix
    const blob = await put(file.name, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false, // Use original filename
    })

    loggers.performance({
      operation: 'blob_upload_success',
      filename: file.name.substring(0, 50),
      fileSize: file.size,
      blobUrl: blob.url,
      userId
    }, 'Successfully uploaded to Vercel Blob')

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

    loggers.performance({
      operation: 'blob_process_start',
      filename: file.name.substring(0, 50),
      blobUrl: blob.url,
      userId
    }, 'Processing blob file')

    // Initial delay to allow Vercel Blob propagation (large files need more time)
    loggers.performance({
      operation: 'blob_propagation_wait',
      delayMs: 10000,
      filename: file.name.substring(0, 50),
      userId
    }, 'Waiting for Vercel Blob propagation')
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10 second initial delay

    // Try multiple times with longer delays for blob propagation
    let response: Response | null = null
    let downloadError: string | null = null

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        loggers.performance({
          operation: 'blob_download_attempt',
          attempt,
          totalAttempts: 5,
          blobUrl: blob.url,
          filename: file.name.substring(0, 50),
          userId
        }, `Blob download attempt ${attempt}/5`)
        response = await fetch(blob.url)

        if (response.ok) {
          loggers.performance({
            operation: 'blob_download_success',
            attempt,
            filename: file.name.substring(0, 50),
            userId
          }, `Successfully downloaded blob on attempt ${attempt}`)
          break
        } else {
          loggers.performance({
            operation: 'blob_download_failed',
            attempt,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            filename: file.name.substring(0, 50),
            userId
          }, `Download attempt ${attempt} failed`)
          downloadError = `${response.status} ${response.statusText}`

          // Wait before retrying with longer delays
          if (attempt < 5) {
            const delay = Math.pow(2, attempt) * 3000 // 6s, 12s, 24s, 48s
            loggers.performance({
              operation: 'blob_download_retry_wait',
              delayMs: delay,
              attempt,
              userId
            }, `Waiting before retry`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Network error'
        downloadError = errorMessage

        logError(error instanceof Error ? error : new Error('Blob download network error'), {
          operation: 'blob_download_retry',
          blobUrl: blob.url,
          fileName: file.name,
          fileSize: file.size,
          userId,
          attempt,
          phase: 'storage_download',
          severity: attempt === 5 ? 'critical' : 'medium'
        })

        if (attempt < 5) {
          const delay = Math.pow(2, attempt) * 3000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    if (!response || !response.ok) {
      logError(new Error('Blob download failed after all retries'), {
        operation: 'blob_download_all_attempts_failed',
        downloadError,
        filename: file.name.substring(0, 50),
        blobUrl: blob.url,
        userId
      })
      return NextResponse.json(
        { success: false, error: `Failed to download file from blob storage: ${downloadError}. The file may need time to propagate or there may be a permissions issue.` },
        { status: 500 }
      )
    }

    // Convert to buffer for processing
    const buffer = Buffer.from(await response.arrayBuffer())

    // Extract text content
    loggers.performance({
      operation: 'text_extraction_start',
      filename: file.name.substring(0, 50),
      fileSize: file.size,
      fileType: file.type,
      userId
    }, 'Starting text extraction')
    const extraction = await extractTextFromFile(buffer, file.type, file.name)

    if (!extraction.content) {
      logError(new Error('Text extraction produced no content'), {
        operation: 'text_extraction_failed',
        filename: file.name.substring(0, 50),
        fileType: file.type,
        fileSize: file.size,
        userId
      })
      return NextResponse.json(
        { success: false, error: 'Failed to extract text from file' },
        { status: 400 }
      )
    }

    loggers.performance({
      operation: 'text_extraction_success',
      filename: file.name.substring(0, 50),
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount,
      userId
    }, `Extracted ${extraction.wordCount} words from file`)

    // Clean the extracted content to prevent database errors
    const cleanedContent = cleanTextContent(extraction.content)

    if (!cleanedContent) {
      logError(new Error('Content cleaning produced empty text'), {
        operation: 'content_cleaning_failed',
        filename: file.name.substring(0, 50),
        originalContentLength: extraction.content.length,
        userId
      })
      return NextResponse.json(
        { success: false, error: 'Document content could not be processed (contains unsupported characters)' },
        { status: 400 }
      )
    }

    // Save document record to database with cleaned content
    loggers.database({
      operation: 'document_save_start',
      filename: file.name.substring(0, 50),
      title: cleanTitle.substring(0, 50),
      wordCount: extraction.wordCount,
      fileSize: file.size,
      userId
    }, 'Saving document record to database')

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
      logError(new Error(`Database insert failed: ${dbError.message}`), {
        operation: 'document_database_insert',
        fileName: file.name,
        fileSize: file.size,
        userId,
        dbErrorCode: dbError.code,
        dbErrorHint: dbError.hint,
        phase: 'database_write',
        severity: 'critical'
      })

      return NextResponse.json(
        { success: false, error: 'Failed to save document to database' },
        { status: 500 }
      )
    }

    loggers.database({
      operation: 'document_save_success',
      documentId: document.id,
      title: cleanTitle.substring(0, 50),
      filename: file.name.substring(0, 50),
      userId
    }, 'Document saved successfully')

    // Start vector processing in the background
    try {
      await processDocumentVectors(document.id, user.id)

      // Track first document upload milestone
      await trackOnboardingMilestone({
        clerkUserId: user.clerk_id,
        milestone: 'first_document_upload',
        metadata: {
          documentTitle: cleanTitle,
          fileSize: file.size,
          mimeType: file.type,
          document_id: document.id
        }
      })

      loggers.performance({
        operation: 'upload_complete',
        documentId: document.id,
        title: cleanTitle.substring(0, 50),
        filename: file.name.substring(0, 50),
        wordCount: extraction.wordCount,
        fileSize: file.size,
        userId
      }, 'Successfully processed document upload')
    } catch (ingestionError) {
      // Don't fail the upload if ingestion fails - it can be retried later
      logError(ingestionError instanceof Error ? ingestionError : new Error('Vector processing failed'), {
        operation: 'vector_processing',
        documentId: document.id,
        fileName: file.name,
        userId,
        phase: 'post_upload_processing',
        severity: 'medium' // Medium because upload succeeded, only background processing failed
      })
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
    logError(error instanceof Error ? error : new Error('Blob upload route failed'), {
      operation: 'blob_upload_route',
      phase: 'unknown', // Unknown because error could occur anywhere in the flow
      severity: 'critical'
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to upload to blob storage'
      },
      { status: 500 }
    )
  }
}