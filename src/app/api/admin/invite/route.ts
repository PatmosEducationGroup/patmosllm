import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sendInvitationEmail, generateInvitationToken } from '@/lib/email'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'

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
      console.error('Error creating invitation:', inviteError)
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
      // Clerk returns a URL like: https://your-app.com/sign-up?__clerk_ticket=...
      console.log('🔍 Clerk invitation response:', JSON.stringify(clerkInvitation, null, 2))

      if (clerkInvitation.url) {
        console.log('📍 Clerk invitation URL:', clerkInvitation.url)
        const clerkUrl = new URL(clerkInvitation.url)
        clerkTicket = clerkUrl.searchParams.get('__clerk_ticket')
        console.log('🎫 Extracted ticket:', clerkTicket)
      } else {
        console.log('⚠️  No URL in Clerk invitation response')
      }

      if (clerkTicket) {
        // Store the Clerk ticket in the database
        await supabaseAdmin
          .from('users')
          .update({ clerk_ticket: clerkTicket })
          .eq('id', invitedUser.id)
        console.log(`✅ Clerk ticket stored in database for ${email}`)
      } else {
        console.log(`⚠️  No Clerk ticket to store for ${email}`)
      }

      console.log(`✅ Clerk invitation created for ${email}${clerkTicket ? ` with ticket: ${clerkTicket.substring(0, 16)}...` : ' (no ticket)'}`)
    } catch (clerkError) {
      console.error('❌ Failed to create Clerk invitation:', clerkError)
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
        invitationToken
      )
    }

    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitationToken}`

    console.log(`Admin ${user.email} invited ${email} as ${role} with token ${invitationToken} (email: ${sendEmail})`)

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

  } catch (_error) {
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
    // DATA RETRIEVAL - Get all users with invitation details
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

  } catch (_error) {
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
    // DATABASE DELETION - Remove user from database (cascades to related data)
    // =================================================================
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', targetUserId)

    if (deleteError) {
      console.error('Error deleting user:', deleteError)
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
          console.log(`✅ Clerk invitation revoked for ${targetUser.email}`)
        }
      } catch (clerkError) {
        console.error('❌ Failed to revoke Clerk invitation:', clerkError)
        // Don't fail the whole request - user is already deleted from database
      }
    }

    // =================================================================
    // LOGGING - Log admin action for audit trail
    // =================================================================
    const actionType = isPendingInvitation ? 'retracted invitation for' : 'deleted user'
    console.log(`Admin ${user.email} ${actionType} ${targetUser.email}`)

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

  } catch (_error) {
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