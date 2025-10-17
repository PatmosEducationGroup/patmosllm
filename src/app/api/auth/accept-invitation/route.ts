import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loggers, logError } from '@/lib/logger'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'

// =================================================================
// POST - Accept invitation and create Supabase Auth user (Phase 7)
// =================================================================
export async function POST(request: NextRequest) {
  try {
    // =================================================================
    // INPUT VALIDATION - Get request body
    // =================================================================
    const { token, password, consents } = await request.json()

    if (!token || !password || !consents) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Validate required consents
    if (!consents.age_confirmed || !consents.terms_accepted || !consents.privacy_accepted) {
      return NextResponse.json(
        { success: false, error: 'Required consents must be accepted' },
        { status: 400 }
      )
    }

    // =================================================================
    // LOOKUP INVITATION - Validate invitation token in users table
    // =================================================================
    const { data: invitedUser, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, invitation_token, invitation_expires_at, auth_user_id, invited_by')
      .eq('invitation_token', token)
      .single()

    if (lookupError || !invitedUser) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    // =================================================================
    // VALIDATE INVITATION STATUS
    // =================================================================
    const now = new Date()
    const expiresAt = new Date(invitedUser.invitation_expires_at)

    if (expiresAt < now) {
      return NextResponse.json(
        { success: false, error: 'Invitation has expired' },
        { status: 400 }
      )
    }

    if (invitedUser.auth_user_id) {
      return NextResponse.json(
        { success: false, error: 'Invitation has already been accepted' },
        { status: 400 }
      )
    }

    // =================================================================
    // CHECK IF AUTH USER EXISTS - Handle Supabase email invitation flow
    // =================================================================
    // When admin sends invitation via admin.inviteUserByEmail(), clicking the
    // email link automatically creates the user in auth.users. We need to handle
    // both cases: user already exists (clicked email) or doesn't exist (direct token)

    let authUserId: string

    // Try to find existing auth user by email
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = existingAuthUsers?.users?.find(
      u => u.email?.toLowerCase() === invitedUser.email.toLowerCase()
    )

    if (existingAuthUser) {
      // User already exists in auth.users (clicked email invitation link)
      // Just update their password
      authUserId = existingAuthUser.id

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        authUserId,
        {
          password: password,
          email_confirm: true,
          user_metadata: {
            role: invitedUser.role,
            invited_by: invitedUser.invited_by,
            invitation_accepted_at: new Date().toISOString()
          }
        }
      )

      if (updateError) {
        logError(updateError, {
          operation: 'update_auth_user_password',
          email: invitedUser.email,
          authUserId
        })
        return NextResponse.json(
          { success: false, error: 'Failed to set password. Please try again.' },
          { status: 500 }
        )
      }

      loggers.security({
        operation: 'auth_user_password_set',
        email: invitedUser.email,
        authUserId
      }, 'Password set for existing auth user')

    } else {
      // User doesn't exist yet - create new auth user
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: invitedUser.email.toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: {
          role: invitedUser.role,
          invited_by: invitedUser.invited_by,
          invitation_accepted_at: new Date().toISOString()
        }
      })

      if (authError || !authUser.user) {
        logError(authError || new Error('Failed to create auth user'), {
          operation: 'create_supabase_auth_user',
          email: invitedUser.email,
          role: invitedUser.role
        })
        return NextResponse.json(
          { success: false, error: 'Failed to create account. Please try again.' },
          { status: 500 }
        )
      }

      authUserId = authUser.user.id

      loggers.security({
        operation: 'supabase_auth_user_created',
        email: invitedUser.email,
        role: invitedUser.role,
        authUserId
      }, 'Supabase Auth user created successfully')
    }

    // =================================================================
    // UPDATE USER RECORD - Link auth user and store GDPR consent
    // =================================================================
    // The user record already exists (created when invitation was sent)
    // We just need to link it to the Supabase Auth account
    const { data: updatedUser, error: userError } = await supabaseAdmin
      .from('users')
      .update({
        auth_user_id: authUserId, // CRITICAL: Link to auth.users

        // GDPR Phase 7: Store consent capture at signup
        age_confirmed: consents.age_confirmed,
        terms_accepted_at: consents.terms_accepted ? consents.consent_timestamp : null,
        privacy_accepted_at: consents.privacy_accepted ? consents.consent_timestamp : null,
        cookies_accepted_at: consents.cookies_accepted ? consents.consent_timestamp : null,
        consent_version: '1.0' // Track which version of T&C/Privacy they agreed to
      })
      .eq('id', invitedUser.id)
      .select()
      .single()

    if (userError || !updatedUser) {
      // Rollback: Delete auth user if database update fails (only if we just created them)
      if (!existingAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId)
      }

      logError(userError || new Error('Failed to update user record'), {
        operation: 'update_user_record',
        email: invitedUser.email,
        authUserId,
        userId: invitedUser.id
      })

      return NextResponse.json(
        { success: false, error: 'Failed to create user account' },
        { status: 500 }
      )
    }

    // =================================================================
    // MARK INVITATION ACCEPTED - Update user_sent_invitations_log
    // =================================================================
    const { error: updateError } = await supabaseAdmin
      .from('user_sent_invitations_log')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('invited_user_id', invitedUser.id)
      .eq('status', 'pending')

    if (updateError) {
      logError(updateError, {
        operation: 'mark_invitation_accepted',
        userId: updatedUser.id
      })
      // Don't fail the request - user was created successfully
    }

    // =================================================================
    // ONBOARDING MILESTONE - Track invitation acceptance
    // =================================================================
    await trackOnboardingMilestone({
      clerkUserId: updatedUser.id,
      milestone: 'invited', // Use existing milestone type
      metadata: {
        invitation_token: token,
        role: updatedUser.role,
        invitation_accepted: true,
        acceptance_timestamp: new Date().toISOString(),
        consents_captured: {
          age_confirmed: consents.age_confirmed,
          terms_accepted: consents.terms_accepted,
          privacy_accepted: consents.privacy_accepted,
          cookies_accepted: consents.cookies_accepted
        }
      }
    })

    loggers.security({
      operation: 'invitation_accepted',
      userId: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      invitedBy: updatedUser.invited_by,
      consents: {
        age_confirmed: consents.age_confirmed,
        terms_accepted: consents.terms_accepted,
        privacy_accepted: consents.privacy_accepted,
        cookies_accepted: consents.cookies_accepted
      }
    }, 'User accepted invitation and account created')

    // =================================================================
    // SUCCESS RESPONSE - Return success
    // =================================================================
    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Please sign in.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API auth/accept-invitation',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Failed to accept invitation'
    })
    return NextResponse.json(
      { success: false, error: 'Failed to create account' },
      { status: 500 }
    )
  }
}
