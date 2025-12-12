import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/fileProcessors'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { processDocumentVectors } from '@/lib/ingest'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import { cleanTitle } from '@/lib/titleCleaner'
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
    // getCurrentUser() handles Supabase auth
    const user = await getCurrentUser()
    loggers.auth({
      operation: 'upload_process_auth_check',
      userId: user?.id,
      role: user?.role,
      hasUser: !!user
    }, 'Upload process authentication check')

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      loggers.security({
        operation: 'upload_process_permission_denied',
        userId: user.id,
        role: user.role,
        requiredRoles: ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN']
      }, 'Permission denied for upload processing')
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

    loggers.performance({
      operation: 'upload_process_start',
      storagePath,
      filename: fileName.substring(0, 50),
      fileSize,
      userId: user.id
    }, 'Starting upload file processing')

    // Download file from Supabase Storage for processing
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .download(storagePath)

    if (downloadError) {
      logError(new Error(`File download failed: ${downloadError.message}`), {
        operation: 'supabase_storage_download',
        storagePath,
        fileName,
        userId: user.id,
        errorMessage: downloadError.message,
        phase: 'storage_download',
        severity: 'critical'
      })

      return NextResponse.json(
        { success: false, error: 'Failed to download file for processing' },
        { status: 500 }
      )
    }

    // Convert blob to buffer for processing
    const buffer = Buffer.from(await fileData.arrayBuffer())

    // Extract text content
    loggers.performance({
      operation: 'upload_process_text_extraction_start',
      filename: fileName.substring(0, 50),
      fileSize,
      mimeType,
      userId: user.id
    }, 'Starting text extraction from upload')
    const extraction = await extractTextFromFile(buffer, mimeType, fileName)

    if (!extraction.content) {
      logError(new Error('Text extraction produced no content'), {
        operation: 'upload_process_text_extraction_failed',
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
      operation: 'upload_process_text_extraction_success',
      filename: fileName.substring(0, 50),
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount,
      userId: user.id
    }, `Extracted ${extraction.wordCount} words from file`)

    // Clean the extracted content to prevent database errors
    const cleanedContent = cleanTextContent(extraction.content)

    if (!cleanedContent) {
      logError(new Error('Content cleaning produced empty text'), {
        operation: 'upload_process_content_cleaning_failed',
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
      operation: 'upload_process_document_save_start',
      filename: fileName.substring(0, 50),
      title: cleanedTitle.substring(0, 50),
      wordCount: extraction.wordCount,
      fileSize,
      userId: user.id
    }, 'Saving document record to database')

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

      logError(new Error(`Database insert failed: ${dbError.message}`), {
        operation: 'upload_process_database_insert',
        fileName,
        fileSize,
        userId: user.id,
        dbErrorCode: dbError.code,
        dbErrorHint: dbError.hint,
        dbErrorDetail: dbError.details,
        phase: 'database_write',
        severity: 'critical'
      })

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      )
    }

    loggers.database({
      operation: 'upload_process_document_save_success',
      documentId: document.id,
      title: cleanedTitle.substring(0, 50),
      filename: fileName.substring(0, 50),
      userId: user.id
    }, 'Document saved successfully')

    // Start vector processing job
    try {
      await processDocumentVectors(document.id, user.id)
      loggers.performance({
        operation: 'upload_process_vector_processing_started',
        documentId: document.id,
        filename: fileName.substring(0, 50),
      userId: user.id
      }, 'Vector processing job started')
    } catch (ingestError) {
      // Don't fail the upload if vector processing fails
      logError(ingestError instanceof Error ? ingestError : new Error('Vector processing failed'), {
        operation: 'upload_process_vector_processing',
        documentId: document.id,
        fileName,
        userId: user.id,
        phase: 'post_upload_processing',
        severity: 'medium'
      })
    }

    // Track onboarding milestone AFTER successful upload
    try {
      await trackOnboardingMilestone({
        authUserId: user.auth_user_id,
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
      logError(milestoneError instanceof Error ? milestoneError : new Error('Onboarding milestone tracking failed'), {
        operation: 'onboarding_milestone_tracking',
        documentId: document.id,
        userId: user.id,
        phase: 'post_upload_processing',
        severity: 'low' // Low because it's just tracking, doesn't affect core functionality
      })
    }

    loggers.performance({
      operation: 'upload_process_complete',
      documentId: document.id,
      title: cleanedTitle.substring(0, 50),
      filename: fileName.substring(0, 50),
      wordCount: extraction.wordCount,
      fileSize,
      userId: user.id
    }, 'Successfully processed upload')

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
    logError(error instanceof Error ? error : new Error('Upload process route failed'), {
      operation: 'upload_process_route',
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
