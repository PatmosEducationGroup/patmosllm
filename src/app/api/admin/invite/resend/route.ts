// src/app/api/admin/invite/resend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sendInvitationEmail } from '@/lib/email'

export async function POST(_request: NextRequest) {
  console.log('🔄 Resend invitation endpoint called')
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      console.log('❌ Authentication failed')
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    console.log('✅ Authentication passed:', userId)

    // Verify admin permissions
    const user = await getCurrentUser()
    console.log('Current user:', user?.email, 'Role:', user?.role)
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      console.log('❌ Admin access denied')
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }
    console.log('✅ Admin access granted')

    const { userId: targetUserId } = await _request.json()
    console.log('Target user ID:', targetUserId)

    if (!targetUserId) {
      console.log('❌ No user ID provided')
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      )
    }

    // Get the target user
    console.log('Fetching target user from database...')
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, clerk_id, invitation_token, invitation_expires_at, clerk_ticket')
      .eq('id', targetUserId)
      .single()

    if (fetchError || !targetUser) {
      console.error('❌ Error fetching user:', fetchError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }
    console.log('✅ Found user:', targetUser.email)

    // Check if this is a pending invitation
    const isPendingInvitation = targetUser.clerk_id.startsWith('invited_')
    console.log('Is pending invitation:', isPendingInvitation)

    if (!isPendingInvitation) {
      console.log('❌ User already activated')
      return NextResponse.json(
        { success: false, error: 'User has already activated their account' },
        { status: 400 }
      )
    }

    // Use existing invitation token, just extend the expiry
    const existingToken = targetUser.invitation_token
    console.log('Existing token:', existingToken ? 'Present' : 'Missing')

    if (!existingToken) {
      console.error('❌ Missing invitation token for user:', targetUser.email)
      return NextResponse.json(
        { success: false, error: 'No invitation token found for this user' },
        { status: 400 }
      )
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    console.log('Updating expiry to:', newExpiresAt.toISOString())

    // Only update the expiration date, keep the same token
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        invitation_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId)

    if (updateError) {
      console.error('❌ Error updating invitation expiry:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update invitation' },
        { status: 500 }
      )
    }
    console.log('✅ Expiry updated successfully')

    // Resend invitation email with the existing token and clerk ticket
    console.log('Sending invitation email...')
    const emailResult = await sendInvitationEmail(
      targetUser.email,
      targetUser.name || '',
      targetUser.role,
      user.name || user.email,
      existingToken,
      targetUser.clerk_ticket
    )
    console.log('Email result:', emailResult)

    if (!emailResult.success) {
      console.warn('⚠️ Email failed but invitation was extended:', emailResult.error)
    } else {
      console.log('✅ Email sent successfully')
    }

    let invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${existingToken}`
    if (targetUser.clerk_ticket) {
      invitationUrl += `?__clerk_ticket=${targetUser.clerk_ticket}`
    }

    console.log(`Admin ${user.email} resent invitation to ${targetUser.email} (extended expiry by 7 days, email: ${emailResult.success})`)

    return NextResponse.json({
      success: true,
      message: emailResult.success
        ? `Invitation resent to ${targetUser.email}. Invitation link extended for 7 more days.`
        : `Invitation extended for ${targetUser.email}, but email delivery failed. Copy the link below to share manually.`,
      emailSent: emailResult.success,
      invitationUrl: invitationUrl,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role
      }
    })

  } catch (_error) {
    console.error('Error in resend invitation:', _error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to resend invitation'
      },
      { status: 500 }
    )
  }
}