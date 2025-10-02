import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

// GET - List documents based on user role
export async function GET(_request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin or contributor access required' },
        { status: 403 }
      )
    }

    let query = supabaseAdmin
      .from('documents')
      .select(`
        id,
        title,
        author,
        storage_path,
        mime_type,
        file_size,
        word_count,
        page_count,
        amazon_url,
        resource_url,
        download_enabled,
        contact_person,
        contact_email,
        uploaded_by,
        created_at,
        source_type,
        source_url,
        users!documents_uploaded_by_fkey(email, name),
        chunks(count)
      `)
      .order('created_at', { ascending: false })

    // If CONTRIBUTOR, only show their own documents
    // If ADMIN or SUPER_ADMIN, show all documents
    if (user.role === 'CONTRIBUTOR') {
      query = query.eq('uploaded_by', user.id)
    }

    const { data: documents, error } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to load documents' },
        { status: 500 }
      )
    }


    // Transform snake_case to camelCase for frontend compatibility
    const transformedDocuments = documents?.map(doc => {
      // Supabase returns chunks as an array with a single object containing {count: number}
      const chunkCount = Array.isArray(doc.chunks) && doc.chunks.length > 0
        ? (doc.chunks[0] as { count: number }).count
        : 0

      return {
        id: doc.id,
        title: doc.title,
        author: doc.author,
        wordCount: doc.word_count,
        pageCount: doc.page_count,
        fileSize: doc.file_size,
        mimeType: doc.mime_type,
        createdAt: doc.created_at,
        amazon_url: doc.amazon_url,
        resource_url: doc.resource_url,
        download_enabled: doc.download_enabled,
        contact_person: doc.contact_person,
        contact_email: doc.contact_email,
        uploaded_by: doc.uploaded_by,
        source_type: doc.source_type,
        source_url: doc.source_url,
        users: doc.users,
        chunkCount
      }
    }) || []

    return NextResponse.json({
      success: true,
      documents: transformedDocuments,
      userRole: user.role
    })

  } catch (_error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load documents' 
      },
      { status: 500 }
    )
  }
}