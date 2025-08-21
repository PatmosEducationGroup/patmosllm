import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
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
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in database' },
        { status: 403 }
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
      console.error('Error fetching documents:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    // Format the response
    const formattedDocs = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      author: doc.author,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      wordCount: doc.word_count,
      pageCount: doc.page_count,
      createdAt: doc.created_at,
      processedAt: doc.processed_at,
      ingestStatus: doc.ingest_jobs?.[0]?.status || 'not_started',
      chunksCreated: doc.ingest_jobs?.[0]?.chunks_created || 0,
      ingestError: doc.ingest_jobs?.[0]?.error_message || null,
      ingestCompletedAt: doc.ingest_jobs?.[0]?.completed_at || null
    }))

    return NextResponse.json({
      success: true,
      documents: formattedDocs,
      total: documents.length
    })

  } catch (error) {
    console.error('Documents API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch documents' 
      },
      { status: 500 }
    )
  }
}

// Delete a document (admin only)
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current user and check admin permissions
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('id')

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      )
    }

    // Get document details
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .remove([document.storage_path])

    if (storageError) {
      console.error('Storage deletion error:', storageError)
    }

    // Delete from database (cascades to chunks and ingest_jobs)
    const { error: deleteError } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete document' },
        { status: 500 }
      )
    }

    // TODO: Delete from Pinecone (implement later)
    // await deleteDocumentChunks(documentId)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })

  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Delete failed' 
      },
      { status: 500 }
    )
  }
}