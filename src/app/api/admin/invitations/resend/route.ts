import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { loggers, logError } from '@/lib/logger'

// =================================================================
// POST - Resend Supabase invitation email
// =================================================================
export async function POST(request: NextRequest) {
  try {
    // =================================================================
    // AUTH CHECK - Verify admin access
    // =================================================================
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // =================================================================
    // INPUT VALIDATION - Get invitation details
    // =================================================================
    const { invitationId, email, role } = await request.json()

    if (!invitationId || !email) {
      return NextResponse.json(
        { success: false, error: 'Invitation ID and email required' },
        { status: 400 }
      )
    }

    // =================================================================
    // VERIFY INVITATION - Check invitation exists and is pending
    // =================================================================
    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from('invitation_tokens')
      .select('id, email, token, role, expires_at, accepted_at')
      .eq('id', invitationId)
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      )
    }

    // Check if invitation is still pending
    if (invitation.accepted_at) {
      return NextResponse.json(
        { success: false, error: 'Invitation has already been accepted' },
        { status: 400 }
      )
    }

    // =================================================================
    // RESEND EMAIL - Call Supabase Auth inviteUserByEmail again
    // =================================================================
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}/accept`

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: redirectUrl,
        data: {
          invitation_token: invitation.token,
          role: role || invitation.role,
          invited_by_email: user.email,
          invited_by_name: user.name || user.email
        }
      }
    )

    if (inviteError) {
      logError(inviteError, {
        operation: 'resend_supabase_invitation',
        adminUserId: user.id,
        invitationId,
        inviteeEmail: email.toLowerCase()
      })

      return NextResponse.json(
        { success: false, error: 'Failed to resend invitation email' },
        { status: 500 }
      )
    }

    loggers.security({
      operation: 'supabase_invitation_resent',
      adminUserId: user.id,
      adminEmail: user.email,
      inviteeEmail: email.toLowerCase(),
      invitationId
    }, 'Supabase invitation email resent successfully')

    // =================================================================
    // SUCCESS RESPONSE - Return confirmation
    // =================================================================
    return NextResponse.json({
      success: true,
      message: `Invitation email resent to ${email}`
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invitations/resend',
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
