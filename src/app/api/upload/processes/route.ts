import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/fileProcessors'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { loggers, logError } from '@/lib/logger'

export async function POST(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
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
    const { storagePath, fileName, fileSize, mimeType, title, author } = await _request.json()

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

    // Sanitize inputs
    const cleanTitle = sanitizeInput(title || fileName)
    const cleanAuthor = author ? sanitizeInput(author) : null

    loggers.performance({
      operation: 'processes_upload_start',
      storagePath,
      filename: fileName.substring(0, 50),
      fileSize,
      userId: user.id
    }, 'Starting file processing')

    // Download file from Supabase Storage for processing
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .download(storagePath)

    if (downloadError) {
      logError(new Error(`File download failed: ${downloadError.message}`), {
        operation: 'processes_supabase_storage_download',
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
      operation: 'processes_text_extraction_start',
      filename: fileName.substring(0, 50),
      fileSize,
      mimeType,
      userId: user.id
    }, 'Starting text extraction')
    const extraction = await extractTextFromFile(buffer, mimeType, fileName)

    if (!extraction.content) {
      logError(new Error('Text extraction produced no content'), {
        operation: 'processes_text_extraction_failed',
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
      operation: 'processes_text_extraction_success',
      filename: fileName.substring(0, 50),
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount,
      userId: user.id
    }, `Extracted ${extraction.wordCount} words from file`)

    // Save document record to database
    loggers.database({
      operation: 'processes_document_save_start',
      filename: fileName.substring(0, 50),
      title: cleanTitle.substring(0, 50),
      wordCount: extraction.wordCount,
      fileSize,
      userId: user.id
    }, 'Saving document record to database')

    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        title: cleanTitle,
        author: cleanAuthor,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: fileSize,
        content: extraction.content,
        word_count: extraction.wordCount,
        page_count: extraction.pageCount || null,
        uploaded_by: user.id,
        processed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      logError(new Error(`Database insert failed: ${dbError.message}`), {
        operation: 'processes_database_insert',
        fileName,
        fileSize,
        userId: user.id,
        dbErrorCode: dbError.code,
        dbErrorHint: dbError.hint,
        phase: 'database_write',
        severity: 'critical'
      })

      return NextResponse.json(
        { success: false, error: 'Failed to save document record' },
        { status: 500 }
      )
    }

    loggers.database({
      operation: 'processes_document_save_success',
      documentId: document.id,
      title: cleanTitle.substring(0, 50),
      filename: fileName.substring(0, 50),
      userId: user.id
    }, 'Document saved successfully')

    // Start vector processing job
    try {
      const ingestResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: document.id })
      })

      if (!ingestResponse.ok) {
        const errorText = await ingestResponse.text()
        logError(new Error(`Ingest API call failed: ${ingestResponse.status} ${errorText}`), {
          operation: 'processes_ingest_api_call',
          documentId: document.id,
          fileName,
          userId: user.id,
          httpStatus: ingestResponse.status,
          phase: 'post_upload_processing',
          severity: 'medium'
        })
      } else {
        loggers.performance({
          operation: 'processes_vector_processing_started',
          documentId: document.id,
          filename: fileName.substring(0, 50),
          userId: user.id
        }, 'Vector processing job started')
      }
    } catch (ingestError) {
      // Don't fail the upload if vector processing fails
      logError(ingestError instanceof Error ? ingestError : new Error('Vector processing failed'), {
        operation: 'processes_vector_processing',
        documentId: document.id,
        fileName,
        userId: user.id,
        phase: 'post_upload_processing',
        severity: 'medium'
      })
    }

    loggers.performance({
      operation: 'processes_upload_complete',
      documentId: document.id,
      title: cleanTitle.substring(0, 50),
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
    logError(error instanceof Error ? error : new Error('Upload processes route failed'), {
      operation: 'upload_processes_route',
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
