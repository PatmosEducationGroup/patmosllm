import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
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
if (!currentUser || !['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)) {
  return NextResponse.json(
    { success: false, error: 'Admin privileges required' },
    { status: 403 }
  )
}

// Get the userId from params and request body
const { userId } = await context.params
const { role } = await request.json()

// Validate role
if (!['ADMIN', 'CONTRIBUTOR', 'USER'].includes(role)) {
  return NextResponse.json(
    { success: false, error: 'Invalid role' },
    { status: 400 }
  )
}

// Prevent self-demotion from admin (both ADMIN and SUPER_ADMIN)
if (currentUser.id === userId && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
  return NextResponse.json(
    { success: false, error: 'Cannot demote yourself from admin role' },
    { status: 400 }
  )
}

// Only SUPER_ADMIN can modify other ADMINs or SUPER_ADMINs
if (currentUser.role === 'ADMIN') {
  // Get the target user to check their current role
  const targetUser = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()
    
  if (targetUser.data && ['ADMIN', 'SUPER_ADMIN'].includes(targetUser.data.role)) {
    return NextResponse.json(
      { success: false, error: 'Only super admins can modify admin users' },
      { status: 403 }
    )
  }
}

    // Update user role
    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update({ 
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
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
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update user role' 
      },
      { status: 500 }
    )
  }
}