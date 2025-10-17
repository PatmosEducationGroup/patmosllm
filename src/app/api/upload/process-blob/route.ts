import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/fileProcessors'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
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
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    loggers.auth({
      operation: 'process_blob_auth_check',
      userId: user?.id,
      role: user?.role,
      hasUser: !!user
    }, 'Process blob authentication check')

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      loggers.security({
        operation: 'process_blob_permission_denied',
        userId: user.id,
        role: user.role,
        requiredRoles: ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN']
      }, 'Permission denied for blob processing')
      return NextResponse.json(
        { success: false, error: 'Only administrators and contributors can upload files' },
        { status: 403 }
      )
    }

    // RATE LIMITING - Role-based tiered limits (after auth)
    // Regular: 100/hour, Contributor: 500/hour, Admin: 5000/hour, Super Admin: 10000/hour
    const identifier = await getIdentifier(_request)
    const rateLimitResult = await uploadRateLimit(identifier, user.role)

    if (!rateLimitResult.success) {
      return NextResponse.json({
        success: false,
        error: rateLimitResult.message,
      }, { status: 429 })
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

    loggers.performance({
      operation: 'process_blob_start',
      blobUrl,
      filename: fileName.substring(0, 50),
      fileSize,
      userId: user.id
    }, 'Starting blob file processing')

    // Download file from Vercel Blob for processing with retry logic
    let response: Response | null = null
    let downloadError: string | null = null

    // Initial delay to allow Vercel Blob propagation (large files need more time)
    loggers.performance({
      operation: 'process_blob_propagation_wait',
      delayMs: 10000,
      filename: fileName.substring(0, 50),
      userId: user.id
    }, 'Waiting for Vercel Blob propagation')
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10 second initial delay

    // Try multiple times with longer delays for blob propagation
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        loggers.performance({
          operation: 'process_blob_download_attempt',
          attempt,
          totalAttempts: 5,
          blobUrl,
          filename: fileName.substring(0, 50),
      userId: user.id
        }, `Process blob download attempt ${attempt}/5`)
        response = await fetch(blobUrl)

        if (response.ok) {
          loggers.performance({
            operation: 'process_blob_download_success',
            attempt,
            filename: fileName.substring(0, 50),
      userId: user.id
          }, `Successfully downloaded blob on attempt ${attempt}`)
          break
        } else {
          loggers.performance({
            operation: 'process_blob_download_failed',
            attempt,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            filename: fileName.substring(0, 50),
      userId: user.id
          }, `Download attempt ${attempt} failed`)
          downloadError = `${response.status} ${response.statusText}`

          // Wait before retrying with longer delays
          if (attempt < 5) {
            const delay = Math.pow(2, attempt) * 3000 // 6s, 12s, 24s, 48s
            loggers.performance({
              operation: 'process_blob_retry_wait',
              delayMs: delay,
              attempt,
      userId: user.id
            }, `Waiting before retry`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Network error'
        downloadError = errorMessage

        logError(error instanceof Error ? error : new Error('Blob download network error'), {
          operation: 'process_blob_download_retry',
          blobUrl,
          fileName,
          fileSize,
          userId: user.id,
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
      logError(new Error('Process blob download failed after all retries'), {
        operation: 'process_blob_download_all_failed',
        downloadError,
        filename: fileName.substring(0, 50),
        blobUrl,
      userId: user.id
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
      operation: 'process_blob_text_extraction_start',
      filename: fileName.substring(0, 50),
      fileSize,
      mimeType,
      userId: user.id
    }, 'Starting text extraction from blob')
    const extraction = await extractTextFromFile(buffer, mimeType, fileName)

    if (!extraction.content) {
      logError(new Error('Text extraction produced no content'), {
        operation: 'process_blob_text_extraction_failed',
        filename: fileName.substring(0, 50),
        mimeType,
        fileSize,
      userId: user.id
      })
      return NextResponse.json(
        { success: false, error: 'Failed to extract text from file' },
        { status: 400 }
      )
    }

    loggers.performance({
      operation: 'process_blob_text_extraction_success',
      filename: fileName.substring(0, 50),
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount,
      userId: user.id
    }, `Extracted ${extraction.wordCount} words from file`)

    // Clean the extracted content to prevent database errors
    const cleanedContent = cleanTextContent(extraction.content)

    if (!cleanedContent) {
      logError(new Error('Content cleaning produced empty text'), {
        operation: 'process_blob_content_cleaning_failed',
        filename: fileName.substring(0, 50),
        originalContentLength: extraction.content.length,
      userId: user.id
      })
      return NextResponse.json(
        { success: false, error: 'Document content could not be processed (contains unsupported characters)' },
        { status: 400 }
      )
    }

    // Save document record to database with cleaned content
    loggers.database({
      operation: 'process_blob_document_save_start',
      filename: fileName.substring(0, 50),
      title: cleanTitle.substring(0, 50),
      wordCount: extraction.wordCount,
      fileSize,
      userId: user.id
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
      logError(new Error(`Database insert failed: ${dbError.message}`), {
        operation: 'process_blob_database_insert',
        fileName,
        fileSize,
        userId: user.id,
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
      operation: 'process_blob_document_save_success',
      documentId: document.id,
      title: cleanTitle.substring(0, 50),
      filename: fileName.substring(0, 50),
      userId: user.id
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
          fileSize: fileSize,
          mimeType: mimeType
        }
      })

      loggers.performance({
        operation: 'process_blob_complete',
        documentId: document.id,
        title: cleanTitle.substring(0, 50),
        filename: fileName.substring(0, 50),
        wordCount: extraction.wordCount,
        fileSize,
      userId: user.id
      }, 'Successfully processed blob upload')
    } catch (ingestionError) {
      // Don't fail the upload if ingestion fails - it can be retried later
      logError(ingestionError instanceof Error ? ingestionError : new Error('Vector processing failed'), {
        operation: 'process_blob_vector_processing',
        documentId: document.id,
        fileName,
        userId: user.id,
        phase: 'post_upload_processing',
        severity: 'medium'
      })
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

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Process blob route failed'), {
      operation: 'process_blob_route',
      phase: 'unknown',
      severity: 'critical'
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Processing failed'
      },
      { status: 500 }
    )
  }
}
