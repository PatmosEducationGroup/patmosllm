import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Generate a secure, temporary signed URL for document download
 *
 * Security:
 * - Requires authentication
 * - URL expires after 60 seconds
 * - Only accessible through this API endpoint
 * - Files never exposed via public URLs
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const { documentId } = resolvedParams

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      )
    }

    // Fetch document from database
    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents')
      .select('id, title, storage_path, mime_type')
      .eq('id', documentId)
      .single()

    if (dbError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check if document has storage path
    if (!document.storage_path) {
      return NextResponse.json(
        { error: 'Document has no file associated' },
        { status: 404 }
      )
    }

    // Generate signed URL (expires in 60 seconds)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET || 'documents')
      .createSignedUrl(document.storage_path, 60)

    if (signedUrlError || !signedUrlData) {
      console.error('Failed to generate signed URL:', signedUrlError)
      return NextResponse.json(
        { error: 'Failed to generate download URL' },
        { status: 500 }
      )
    }

    // Return signed URL and document info
    return NextResponse.json({
      url: signedUrlData.signedUrl,
      filename: document.title,
      mimeType: document.mime_type,
      expiresIn: 60 // seconds
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API documents/download/[documentId]',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Internal server error'
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
