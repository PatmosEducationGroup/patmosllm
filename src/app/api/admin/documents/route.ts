import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

// GET - List documents based on user role
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
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
        users!documents_uploaded_by_fkey(email, name)
      `)
      .order('created_at', { ascending: false })

    // If regular ADMIN, only show their own documents
    // If SUPER_ADMIN, show all documents
    if (user.role === 'ADMIN') {
      query = query.eq('uploaded_by', user.id)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to load documents' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      documents: documents || [],
      userRole: user.role
    })

  } catch (error) {
    console.error('Admin documents GET error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to load documents' 
      },
      { status: 500 }
    )
  }
}