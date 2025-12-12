import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import {logger, loggers, logError} from '@/lib/logger'

export async function GET(_request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get documents with processing status
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select(`
        id,
        title,
        author,
        mime_type,
        file_size,
        word_count,
        page_count,
        created_at,
        processed_at,
        uploaded_by,
        ingest_jobs (
          id,
          status,
          chunks_created,
          error_message,
          created_at,
          completed_at
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    // Filter documents based on user role
    let filteredDocs = documents
    if (user.role === 'CONTRIBUTOR') {
      // Contributors can only see their own documents
      filteredDocs = documents.filter(doc => doc.uploaded_by === user.id)
    }
    // Admins and users can see all documents

    // Format the response
    const formattedDocs = filteredDocs.map(doc => ({
      id: doc.id,
      title: doc.title,
      author: doc.author,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      wordCount: doc.word_count,
      pageCount: doc.page_count,
      createdAt: doc.created_at,
      processedAt: doc.processed_at,
      uploadedBy: doc.uploaded_by,
      ingestStatus: doc.ingest_jobs?.[0]?.status || 'not_started',
      chunksCreated: doc.ingest_jobs?.[0]?.chunks_created || 0,
      ingestError: doc.ingest_jobs?.[0]?.error_message || null,
      ingestCompletedAt: doc.ingest_jobs?.[0]?.completed_at || null
    }))

    return NextResponse.json({
      success: true,
      documents: formattedDocs,
      total: formattedDocs.length
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API documents',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Internal server error'
    })
return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch documents' 
      },
      { status: 500 }
    )
  }
}

// Delete a document
export async function DELETE(_request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Only ADMIN, CONTRIBUTOR, and SUPER_ADMIN can delete documents
    if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to delete documents' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(_request.url)
    const documentId = searchParams.get('id')

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      )
    }

    // Get document details and check ownership
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, storage_path, uploaded_by, title')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check if user can delete this specific document
    if (user.role === 'CONTRIBUTOR' && document.uploaded_by !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Contributors can only delete their own documents' },
        { status: 403 }
      )
    }

    // ADMIN OVERRIDE: Mark as non-library asset before deletion to bypass trigger
    // This allows admins to delete any document, while the trigger still protects
    // library assets from accidental cascading deletes when users delete their accounts
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({ is_library_asset: false })
      .eq('id', documentId)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: 'Failed to prepare document for deletion' },
        { status: 500 }
      )
    }

    // Delete from storage if storage_path exists
    if (document.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(process.env.SUPABASE_BUCKET!)
        .remove([document.storage_path])

      if (storageError) {
        // Continue with database deletion even if storage deletion fails
      }
    }

    // Delete from database (cascades to chunks and ingest_jobs)
    const { error: deleteError } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete document from database' },
        { status: 500 }
      )
    }

    logger.info({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      documentId,
      documentTitle: document.title
    }, 'User deleted document')

   // Delete vectors from Pinecone
    try {
      const { deleteDocumentChunks } = await import('@/lib/pinecone')
      await deleteDocumentChunks(documentId)
      loggers.ai({ documentId, documentTitle: document.title, operation: 'delete_vectors', provider: 'pinecone' }, 'Deleted vectors from Pinecone')
    } catch (pineconeError) {
      loggers.ai({ documentId, error: pineconeError instanceof Error ? pineconeError.message : 'Unknown error', operation: 'delete_vectors', provider: 'pinecone' }, 'Failed to delete vectors from Pinecone')
      // Don't fail the entire operation if Pinecone deletion fails
      // The document is still deleted from the database
    }

    return NextResponse.json({
      success: true,
      message: `Document "${document.title}" deleted successfully`
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API documents',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Internal server error'
    })
return NextResponse.json(
      { 
        success: false, 
        error: 'Delete operation failed' 
      },
      { status: 500 }
    )
  }
}