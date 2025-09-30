// src/app/api/admin/invite/resend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sendInvitationEmail, generateInvitationToken } from '@/lib/email'

export async function POST(_request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Verify admin permissions
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { userId: targetUserId } = await _request.json()

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      )
    }

    // Get the target user
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, clerk_id, invitation_token, invitation_expires_at')
      .eq('id', targetUserId)
      .single()

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if this is a pending invitation
    const isPendingInvitation = targetUser.clerk_id.startsWith('invited_')
    
    if (!isPendingInvitation) {
      return NextResponse.json(
        { success: false, error: 'User has already activated their account' },
        { status: 400 }
      )
    }

    // Generate new invitation token and extend expiry
    const newInvitationToken = generateInvitationToken()
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

    // Update the invitation token and expiry
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        invitation_token: newInvitationToken,
        invitation_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId)

    if (updateError) {
      console.error('Error updating invitation token:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate new invitation' },
        { status: 500 }
      )
    }

    // Send new invitation email
    const emailResult = await sendInvitationEmail(
      targetUser.email,
      targetUser.name || '',
      targetUser.role,
      user.name || user.email,
      newInvitationToken
    )

    if (!emailResult.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to send invitation email' },
        { status: 500 }
      )
    }

    console.log(`Admin ${user.email} resent invitation to ${targetUser.email}`)

    return NextResponse.json({
      success: true,
      message: `Invitation resent to ${targetUser.email}. New invitation expires in 7 days.`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role
      }
    })

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to resend invitation' 
      },
      { status: 500 }
    )
  }
}