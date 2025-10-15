import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { generateInvitationToken } from '@/lib/email'
import { loggers, logError } from '@/lib/logger'

// =================================================================
// POST - Create new Supabase invitation (Phase 7)
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
    // INPUT VALIDATION - Get and validate invitation details
    // =================================================================
    const { email, role = 'USER' } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email address required' },
        { status: 400 }
      )
    }

    if (!['USER', 'CONTRIBUTOR', 'ADMIN'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role. Must be USER, CONTRIBUTOR, or ADMIN' },
        { status: 400 }
      )
    }

    // =================================================================
    // DUPLICATE CHECK - Ensure user doesn't already exist
    // =================================================================
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // =================================================================
    // CHECK PENDING INVITATION - Ensure no pending invitation exists
    // =================================================================
    const { data: existingInvitation } = await supabaseAdmin
      .from('invitation_tokens')
      .select('id, email, expires_at, accepted_at')
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingInvitation) {
      return NextResponse.json(
        { success: false, error: 'An active invitation already exists for this email' },
        { status: 400 }
      )
    }

    // =================================================================
    // GENERATE TOKEN - Create secure invitation token
    // =================================================================
    const invitationToken = generateInvitationToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // =================================================================
    // STORE INVITATION - Save to invitation_tokens table
    // =================================================================
    const { data: invitation, error: insertError } = await supabaseAdmin
      .from('invitation_tokens')
      .insert({
        email: email.toLowerCase(),
        token: invitationToken,
        role: role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (insertError) {
      logError(insertError, {
        operation: 'create_supabase_invitation',
        adminUserId: user.id,
        adminEmail: user.email,
        inviteeEmail: email.toLowerCase(),
        inviteeRole: role
      })
      return NextResponse.json(
        { success: false, error: 'Failed to create invitation' },
        { status: 500 }
      )
    }

    // =================================================================
    // SUPABASE AUTH INVITATION - Send invitation email via Supabase
    // =================================================================
    try {
      const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitationToken}/accept`

      const { data: authInvite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email.toLowerCase(),
        {
          redirectTo: redirectUrl,
          data: {
            invitation_token: invitationToken,
            role: role,
            invited_by_email: user.email,
            invited_by_name: user.name || user.email
          }
        }
      )

      if (inviteError) {
        // Clean up invitation token if Supabase invite fails
        await supabaseAdmin
          .from('invitation_tokens')
          .delete()
          .eq('id', invitation.id)

        logError(inviteError, {
          operation: 'supabase_invite_user',
          adminUserId: user.id,
          inviteeEmail: email.toLowerCase()
        })

        return NextResponse.json(
          { success: false, error: 'Failed to send invitation email' },
          { status: 500 }
        )
      }

      loggers.security({
        operation: 'supabase_invitation_sent',
        adminUserId: user.id,
        adminEmail: user.email,
        inviteeEmail: email.toLowerCase(),
        inviteeRole: role,
        invitationToken,
        authUserId: authInvite.user?.id
      }, 'Supabase invitation sent successfully')

    } catch (supabaseError) {
      // Clean up invitation token if there's an error
      await supabaseAdmin
        .from('invitation_tokens')
        .delete()
        .eq('id', invitation.id)

      logError(supabaseError instanceof Error ? supabaseError : new Error('Supabase invite failed'), {
        operation: 'supabase_invite_user',
        adminUserId: user.id,
        inviteeEmail: email.toLowerCase()
      })

      return NextResponse.json(
        { success: false, error: 'Failed to send invitation' },
        { status: 500 }
      )
    }

    // =================================================================
    // SUCCESS RESPONSE - Return invitation details
    // =================================================================
    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitationToken}/accept`

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}. They will receive an email with a secure setup link.`,
      invitationToken: invitationToken,
      invitationUrl: invitationUrl,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        invitedBy: user.email
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invitations',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Invitation failed'
      },
      { status: 500 }
    )
  }
}

// =================================================================
// GET - Retrieve all pending invitations
// =================================================================
export async function GET(_request: NextRequest) {
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
    // DATA RETRIEVAL - Get all invitations with inviter details
    // =================================================================
    const { data: invitations, error } = await supabaseAdmin
      .from('invitation_tokens')
      .select(`
        id,
        email,
        role,
        expires_at,
        accepted_at,
        created_at,
        invited_by,
        inviter:invited_by(email, name)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch invitations' },
        { status: 500 }
      )
    }

    // =================================================================
    // DATA FORMATTING - Format invitation data for frontend
    // =================================================================
    const now = new Date()
    const formattedInvitations = invitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at,
      acceptedAt: inv.accepted_at,
      createdAt: inv.created_at,
      isExpired: new Date(inv.expires_at) < now,
      isAccepted: !!inv.accepted_at,
      invitedBy: (inv.inviter as { email?: string; name?: string })?.email || 'Unknown'
    }))

    return NextResponse.json({
      success: true,
      invitations: formattedInvitations,
      total: invitations.length
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invitations GET',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch invitations'
      },
      { status: 500 }
    )
  }
}

// =================================================================
// DELETE - Revoke pending invitation
// =================================================================
export async function DELETE(request: NextRequest) {
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
    // INPUT VALIDATION - Get invitation ID from request
    // =================================================================
    const { invitationId } = await request.json()

    if (!invitationId) {
      return NextResponse.json(
        { success: false, error: 'Invitation ID required' },
        { status: 400 }
      )
    }

    // =================================================================
    // DELETE INVITATION - Remove from database
    // =================================================================
    const { data: deletedInvitation, error: deleteError } = await supabaseAdmin
      .from('invitation_tokens')
      .delete()
      .eq('id', invitationId)
      .select()
      .single()

    if (deleteError || !deletedInvitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      )
    }

    loggers.security({
      operation: 'admin_revoke_invitation',
      adminUserId: user.id,
      adminEmail: user.email,
      invitationId,
      inviteeEmail: deletedInvitation.email
    }, 'Admin revoked invitation')

    // =================================================================
    // SUCCESS RESPONSE - Return revocation confirmation
    // =================================================================
    return NextResponse.json({
      success: true,
      message: `Invitation for ${deletedInvitation.email} has been revoked`,
      deletedInvitation: {
        email: deletedInvitation.email,
        id: deletedInvitation.id
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invitations DELETE',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to revoke invitation'
      },
      { status: 500 }
    )
  }
}
