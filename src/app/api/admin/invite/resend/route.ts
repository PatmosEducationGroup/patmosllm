// src/app/api/admin/invite/resend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sendInvitationEmail } from '@/lib/email'
import { loggers, logError } from '@/lib/logger'

export async function POST(_request: NextRequest) {
  loggers.security({
    operation: 'resend_invitation_request',
    endpoint: '/api/admin/invite/resend'
  }, 'Resend invitation endpoint called')

  try {
    // getCurrentUser() handles Supabase auth
    const user = await getCurrentUser()
    if (!user) {
      loggers.security({
        operation: 'resend_invitation_auth_failed',
        reason: 'no_user'
      }, 'Authentication failed')
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Verify admin permissions
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      loggers.security({
        operation: 'resend_invitation_auth_failed',
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        reason: 'insufficient_permissions'
      }, 'Admin access denied')
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { userId: targetUserId } = await _request.json()

    if (!targetUserId) {
      loggers.security({
        operation: 'resend_invitation_validation_failed',
        adminUserId: user.id,
        adminEmail: user.email,
        reason: 'missing_target_user_id'
      }, 'No user ID provided')
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      )
    }

    // Get the target user
    loggers.database({
      operation: 'fetch_target_user',
      adminUserId: user.id,
      targetUserId
    }, 'Fetching target user from database')

    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, auth_user_id, invitation_token, invitation_expires_at')
      .eq('id', targetUserId)
      .single()

    if (fetchError || !targetUser) {
      logError(fetchError || new Error('User not found'), {
        operation: 'fetch_target_user',
        adminUserId: user.id,
        targetUserId
      })
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    loggers.database({
      operation: 'target_user_found',
      adminUserId: user.id,
      targetUserId,
      targetEmail: targetUser.email
    }, 'Target user found')

    // Check if this is a pending invitation (Supabase Auth only)
    const isPendingInvitation = !targetUser.auth_user_id && !!targetUser.invitation_token

    if (!isPendingInvitation) {
      loggers.security({
        operation: 'resend_invitation_failed',
        adminUserId: user.id,
        targetUserId,
        targetEmail: targetUser.email,
        reason: 'user_already_activated'
      }, 'Cannot resend - user already activated')
      return NextResponse.json(
        { success: false, error: 'User has already activated their account' },
        { status: 400 }
      )
    }

    // Use existing invitation token, just extend the expiry
    const existingToken = targetUser.invitation_token

    if (!existingToken) {
      loggers.security({
        operation: 'resend_invitation_failed',
        adminUserId: user.id,
        targetUserId,
        targetEmail: targetUser.email,
        reason: 'missing_invitation_token'
      }, 'Missing invitation token')
      return NextResponse.json(
        { success: false, error: 'No invitation token found for this user' },
        { status: 400 }
      )
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

    // Only update the expiration date, keep the same token
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        invitation_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId)

    if (updateError) {
      logError(updateError, {
        operation: 'update_invitation_expiry',
        adminUserId: user.id,
        targetUserId,
        targetEmail: targetUser.email
      })
      return NextResponse.json(
        { success: false, error: 'Failed to update invitation' },
        { status: 500 }
      )
    }

    loggers.database({
      operation: 'update_invitation_expiry',
      adminUserId: user.id,
      targetUserId,
      targetEmail: targetUser.email,
      newExpiresAt: newExpiresAt.toISOString()
    }, 'Invitation expiry updated successfully')

    // Resend invitation email with the existing token (Supabase Auth only)
    const emailResult = await sendInvitationEmail(
      targetUser.email,
      targetUser.name || '',
      targetUser.role,
      user.name || user.email,
      existingToken
    )

    if (!emailResult.success) {
      loggers.security({
        operation: 'resend_invitation_email_failed',
        adminUserId: user.id,
        targetUserId,
        targetEmail: targetUser.email,
        error: emailResult.error
      }, 'Email failed but invitation was extended')
    } else {
      loggers.security({
        operation: 'resend_invitation_email_sent',
        adminUserId: user.id,
        targetUserId,
        targetEmail: targetUser.email
      }, 'Invitation email sent successfully')
    }

    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${existingToken}`

    loggers.security({
      operation: 'admin_resend_invitation',
      adminUserId: user.id,
      adminEmail: user.email,
      targetUserId,
      targetEmail: targetUser.email,
      emailSent: emailResult.success,
      expiryExtendedDays: 7
    }, 'Admin resent invitation')

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

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invite/resend',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to resend invitation'
      },
      { status: 500 }
    )
  }
}