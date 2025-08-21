import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check authentication
    const { userId: currentUserId } = await auth()
    if (!currentUserId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current user and verify admin privileges
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Admin privileges required' },
        { status: 403 }
      )
    }

    const { role } = await request.json()
    
    // Validate role
    if (!['ADMIN', 'CONTRIBUTOR', 'USER'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      )
    }

    // Prevent self-demotion from admin
    if (currentUser.id === params.userId && role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Cannot change your own admin role' },
        { status: 400 }
      )
    }

    // Update user role
    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update({ 
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating user role:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update user role' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user: updatedUser
    })

  } catch (error) {
    console.error('Update user role error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update user role' 
      },
      { status: 500 }
    )
  }
}