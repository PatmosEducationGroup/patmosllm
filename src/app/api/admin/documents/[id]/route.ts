import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sanitizeInput } from '@/lib/input-sanitizer'

// GET - Get single document with metadata
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
// Then use resolvedParams.id instead of params.id
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

    const { data: document, error } = await supabaseAdmin
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
      .eq('id', resolvedParams.id)
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check permissions: ADMIN can only edit their own docs, SUPER_ADMIN can edit any
    if (user.role === 'ADMIN' && document.uploaded_by !== user.id) {
      return NextResponse.json(
        { success: false, error: 'You can only edit documents you uploaded' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      document
    })

  } catch (error) {
    console.error('Admin document GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load document' },
      { status: 500 }
    )
  }
}

// PUT - Update document metadata
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
  
) {
  try {
    const resolvedParams = await params
// Then use resolvedParams.id instead of params.id
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

    // First check if document exists and user has permission to edit it
    const { data: existingDoc, error: fetchError } = await supabaseAdmin
      .from('documents')
      .select('id, uploaded_by')
      .eq('id', resolvedParams.id)
      .single()

    if (fetchError || !existingDoc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check permissions: ADMIN can only edit their own docs, SUPER_ADMIN can edit any
    if (user.role === 'ADMIN' && existingDoc.uploaded_by !== user.id) {
      return NextResponse.json(
        { success: false, error: 'You can only edit documents you uploaded' },
        { status: 403 }
      )
    }

    // Get the update data
    const {
      title,
      author,
      amazon_url,
      resource_url,
      download_enabled,
      contact_person,
      contact_email
    } = await request.json()

    // Sanitize inputs
    const updates: {
  title?: string
  author?: string | null
  amazon_url?: string | null
  resource_url?: string | null
  download_enabled?: boolean
  contact_person?: string | null
  contact_email?: string | null
} = {}
    if (title !== undefined) updates.title = sanitizeInput(title)
    if (author !== undefined) updates.author = author ? sanitizeInput(author) : null
    if (amazon_url !== undefined) updates.amazon_url = amazon_url ? sanitizeInput(amazon_url) : null
    if (resource_url !== undefined) updates.resource_url = resource_url ? sanitizeInput(resource_url) : null
    if (download_enabled !== undefined) updates.download_enabled = Boolean(download_enabled)
    if (contact_person !== undefined) updates.contact_person = contact_person ? sanitizeInput(contact_person) : null
    if (contact_email !== undefined) updates.contact_email = contact_email ? sanitizeInput(contact_email) : null

    // Validate required fields
    if (updates.title && !updates.title.trim()) {
      return NextResponse.json(
        { success: false, error: 'Title cannot be empty' },
        { status: 400 }
      )
    }

    // Validate email format if provided
    if (updates.contact_email && updates.contact_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(updates.contact_email)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email format for contact email' },
          { status: 400 }
        )
      }
    }

    // Update the document
    const { data: updatedDoc, error: updateError } = await supabaseAdmin
      .from('documents')
      .update(updates)
     .eq('id', resolvedParams.id)
      .select(`
        id,
        title,
        author,
        amazon_url,
        resource_url,
        download_enabled,
        contact_person,
        contact_email,
        created_at
      `)
      .single()

    if (updateError) {
      console.error('Document update error:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update document' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Document updated successfully',
      document: updatedDoc
    })

  } catch (error) {
    console.error('Admin document PUT error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update document' },
      { status: 500 }
    )
  }
}