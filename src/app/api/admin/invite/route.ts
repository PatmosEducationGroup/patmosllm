import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sendInvitationEmail, generateInvitationToken } from '@/lib/email'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import { loggers, logError } from '@/lib/logger'

// =================================================================
// POST - Create new user invitation
// Updated: 2025-10-02 - Force rebuild to clear serverless cache
// =================================================================
export async function POST(_request: NextRequest) {
  try {
    // =================================================================
    // AUTHENTICATION - Check if user is logged in
    // =================================================================
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // =================================================================
    // AUTHORIZATION - Verify user has admin permissions
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
    const { email, name, role = 'USER', sendEmail = true } = await _request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email address required' },
        { status: 400 }
      )
    }

    if (!['USER', 'CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role. Must be USER, CONTRIBUTOR, ADMIN, or SUPER_ADMIN' },
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
    // INVITATION TOKEN GENERATION - Create secure invitation link
    // =================================================================
    const invitationToken = generateInvitationToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

    // =================================================================
    // DATABASE CREATION - Create invitation record in database
    // =================================================================
    const { data: invitedUser, error: inviteError } = await supabaseAdmin
      .from('users')
      .insert({
        email: email.toLowerCase(),
        name: name || null,
        role: role,
        invited_by: user.id,
        invitation_token: invitationToken,
        invitation_expires_at: expiresAt.toISOString(),
        clerk_id: `invited_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
      .select()
      .single()

    if (inviteError) {
      logError(inviteError, {
        operation: 'create_invitation',
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
    // ONBOARDING MILESTONE TRACKING - Track invitation milestone
    // =================================================================
    await trackOnboardingMilestone({
      clerkUserId: invitedUser.clerk_id,
      milestone: 'invited',
      metadata: {
        invited_by: user.id,
        invitation_method: 'admin_invite',
        invitation_token: invitationToken,
        inviter_email: user.email
      }
    })

    // =================================================================
    // CLERK INVITATION - Create Clerk invitation to allow signup in Restricted mode
    // =================================================================
    let clerkTicket: string | null = null
    try {
      const client = await clerkClient()
      const clerkInvitation = await client.invitations.createInvitation({
        emailAddress: email.toLowerCase(),
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitationToken}`,
        notify: false, // Don't send Clerk's email - we handle emails ourselves
        publicMetadata: {
          invitationToken: invitationToken,
          role: role,
          invitedBy: user.email
        }
      })

      // Extract the Clerk ticket from the invitation URL
      // Clerk returns a URL like: https://clerk.dev/v1/tickets/accept?ticket=JWT_TOKEN
      loggers.security({
        operation: 'clerk_invitation_created',
        adminUserId: user.id,
        inviteeEmail: email.toLowerCase(),
        hasUrl: !!clerkInvitation.url
      }, 'Processing Clerk invitation response')

      if (clerkInvitation.url) {
        loggers.security({
          operation: 'extract_clerk_ticket',
          inviteeEmail: email.toLowerCase()
        }, 'Extracting Clerk ticket from invitation URL')
        const clerkUrl = new URL(clerkInvitation.url)
        clerkTicket = clerkUrl.searchParams.get('ticket') // Changed from __clerk_ticket to ticket
      }

      if (clerkTicket) {
        // Store the Clerk ticket in the database
        await supabaseAdmin
          .from('users')
          .update({ clerk_ticket: clerkTicket })
          .eq('id', invitedUser.id)
        loggers.security({
          operation: 'store_clerk_ticket',
          inviteeEmail: email.toLowerCase(),
          ticketStored: true
        }, 'Clerk ticket stored in database')
      }

      loggers.security({
        operation: 'clerk_invitation_complete',
        adminUserId: user.id,
        adminEmail: user.email,
        inviteeEmail: email.toLowerCase(),
        hasTicket: !!clerkTicket
      }, 'Clerk invitation created successfully')
    } catch (clerkError) {
      logError(clerkError, {
        operation: 'create_clerk_invitation',
        adminUserId: user.id,
        inviteeEmail: email.toLowerCase()
      })
      // Don't fail the whole request - user can still use the custom invitation link
      // if Clerk is switched to a different mode
    }

    // =================================================================
    // EMAIL SENDING - Conditionally send invitation email to new user
    // =================================================================
    let emailResult = { success: false }
    if (sendEmail) {
      emailResult = await sendInvitationEmail(
        email.toLowerCase(),
        name || '',
        role,
        user.name || user.email,
        invitationToken,
        clerkTicket
      )
    }

    // Build invitation URL with Clerk ticket if available
    let invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitationToken}`
    if (clerkTicket) {
      invitationUrl += `?__clerk_ticket=${clerkTicket}`
    }

    loggers.security({
      operation: 'admin_invite_user',
      adminUserId: user.id,
      adminEmail: user.email,
      inviteeEmail: email,
      inviteeRole: role,
      invitationToken,
      emailSent: sendEmail
    }, 'Admin invited new user')

    // =================================================================
    // SUCCESS RESPONSE - Return invitation success details
    // =================================================================
    return NextResponse.json({
      success: true,
      message: sendEmail
        ? (emailResult.success
            ? `Invitation sent to ${email}. They will receive an email with a secure setup link.`
            : `User ${email} has been created but email delivery failed.`)
        : `Invitation created for ${email}. Copy the link below to share manually.`,
      emailSent: emailResult.success,
      invitationToken: invitationToken,
      invitationUrl: invitationUrl,
      user: {
        id: invitedUser.id,
        email: invitedUser.email,
        name: invitedUser.name,
        role: invitedUser.role,
        invitedBy: user.email
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invite',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
// =================================================================
    // ERROR HANDLING - Log errors and return user-friendly message
    // =================================================================
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
// GET - Retrieve all users for admin management
// =================================================================
export async function GET(_request: NextRequest) {
  try {
    // =================================================================
    // AUTHENTICATION - Check if user is logged in
    // =================================================================
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // =================================================================
    // AUTHORIZATION - Verify user has admin permissions
    // =================================================================
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // =================================================================
    // DATA RETRIEVAL - Get all users with invitation details (exclude deleted)
    // =================================================================
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        name,
        role,
        created_at,
        clerk_id,
        invited_by,
        invitation_token,
        clerk_ticket,
        inviter:invited_by(email, name)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    // =================================================================
    // DATA FORMATTING - Format user data for frontend display
    // =================================================================
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.created_at,
      isActive: !user.clerk_id.startsWith('invited_'), // Check if user has completed signup
      invitedBy: (user.inviter as { email?: string })?.email || 'System',
      invitation_token: user.invitation_token,
      clerk_ticket: user.clerk_ticket
    }))

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      total: users.length
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invite',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
// =================================================================
    // ERROR HANDLING - Log errors and return user-friendly message
    // =================================================================
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch users' 
      },
      { status: 500 }
    )
  }
}

// =================================================================
// DELETE - Remove pending invitation or delete active user
// =================================================================
export async function DELETE(_request: NextRequest) {
  try {
    // =================================================================
    // AUTHENTICATION - Check if user is logged in
    // =================================================================
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // =================================================================
    // AUTHORIZATION - Verify user has admin permissions
    // =================================================================
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // =================================================================
    // INPUT VALIDATION - Get target user ID from request
    // =================================================================
    const { userId: targetUserId } = await _request.json()

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      )
    }

    // =================================================================
    // SELF-DELETION PREVENTION - Prevent admin from deleting themselves
    // =================================================================
    if (targetUserId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // =================================================================
    // USER LOOKUP - Get target user info before deletion
    // =================================================================
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, clerk_id, role, invitation_token')
      .eq('id', targetUserId)
      .single()

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // =================================================================
    // USER STATUS CHECK - Determine if pending invitation vs active user
    // =================================================================
    const isPendingInvitation = targetUser.clerk_id.startsWith('invited_')

    // =================================================================
    // SOFT DELETE - Mark user as deleted (preserves data for audit trail)
    // =================================================================
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .update({
        deleted_at: new Date().toISOString(),
        // Anonymize email for privacy while keeping record
        email: `deleted_${targetUserId}@deleted.local`
      })
      .eq('id', targetUserId)

    if (deleteError) {
      logError(deleteError, {
        operation: 'delete_user',
        adminUserId: user.id,
        adminEmail: user.email,
        targetUserId,
        targetEmail: targetUser.email
      })
      return NextResponse.json(
        { success: false, error: 'Failed to delete user' },
        { status: 500 }
      )
    }

    // =================================================================
    // CLERK INVITATION REVOCATION - Revoke Clerk invitation if pending
    // =================================================================
    if (isPendingInvitation) {
      try {
        const client = await clerkClient()
        // List all pending invitations for this email
        const invitations = await client.invitations.getInvitationList({
          status: 'pending'
        })

        // Find the invitation for this email
        const invitation = invitations.data.find(
          inv => inv.emailAddress.toLowerCase() === targetUser.email.toLowerCase()
        )

        if (invitation) {
          await client.invitations.revokeInvitation(invitation.id)
          loggers.security({
            operation: 'revoke_clerk_invitation',
            adminUserId: user.id,
            adminEmail: user.email,
            targetEmail: targetUser.email,
            clerkInvitationId: invitation.id
          }, 'Clerk invitation revoked')
        }
      } catch (clerkError) {
        logError(clerkError, {
          operation: 'revoke_clerk_invitation',
          adminUserId: user.id,
          targetEmail: targetUser.email
        })
        // Don't fail the whole request - user is already deleted from database
      }
    }

    // =================================================================
    // LOGGING - Log admin action for audit trail
    // =================================================================
    const actionType = isPendingInvitation ? 'retracted invitation for' : 'deleted user'
    loggers.security({
      operation: isPendingInvitation ? 'admin_retract_invitation' : 'admin_delete_user',
      adminUserId: user.id,
      adminEmail: user.email,
      targetUserId,
      targetEmail: targetUser.email,
      wasPendingInvitation: isPendingInvitation
    }, `Admin ${actionType} user`)

    // =================================================================
    // SUCCESS RESPONSE - Return deletion confirmation
    // =================================================================
    return NextResponse.json({
      success: true,
      message: isPendingInvitation 
        ? `Invitation for ${targetUser.email} has been retracted`
        : `User ${targetUser.email} has been deleted`,
      deletedUser: {
        email: targetUser.email,
        id: targetUser.id,
        wasPendingInvitation: isPendingInvitation
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invite',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
// =================================================================
    // ERROR HANDLING - Log errors and return user-friendly message
    // =================================================================
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete user' 
      },
      { status: 500 }
    )
  }
}