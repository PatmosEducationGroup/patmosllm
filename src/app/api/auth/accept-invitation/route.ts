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
    // LOOKUP INVITATION - Validate invitation token in invitation_tokens table
    // =================================================================
    const { data: invitation, error: lookupError } = await supabaseAdmin
      .from('invitation_tokens')
      .select('id, email, name, role, token, expires_at, accepted_at, invited_by')
      .eq('token', token)
      .single()

    if (lookupError || !invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    // =================================================================
    // VALIDATE INVITATION STATUS
    // =================================================================
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)

    if (expiresAt < now) {
      return NextResponse.json(
        { success: false, error: 'Invitation has expired' },
        { status: 400 }
      )
    }

    if (invitation.accepted_at) {
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
      u => u.email?.toLowerCase() === invitation.email.toLowerCase()
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
            role: invitation.role,
            invited_by: invitation.invited_by,
            invitation_accepted_at: new Date().toISOString()
          }
        }
      )

      if (updateError) {
        logError(updateError, {
          operation: 'update_auth_user_password',
          email: invitation.email,
          authUserId
        })
        return NextResponse.json(
          { success: false, error: 'Failed to set password. Please try again.' },
          { status: 500 }
        )
      }

      loggers.security({
        operation: 'auth_user_password_set',
        email: invitation.email,
        authUserId
      }, 'Password set for existing auth user')

    } else {
      // User doesn't exist yet - create new auth user
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: invitation.email.toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: {
          role: invitation.role,
          invited_by: invitation.invited_by,
          invitation_accepted_at: new Date().toISOString()
        }
      })

      if (authError || !authUser.user) {
        logError(authError || new Error('Failed to create auth user'), {
          operation: 'create_supabase_auth_user',
          email: invitation.email,
          role: invitation.role
        })
        return NextResponse.json(
          { success: false, error: 'Failed to create account. Please try again.' },
          { status: 500 }
        )
      }

      authUserId = authUser.user.id

      loggers.security({
        operation: 'supabase_auth_user_created',
        email: invitation.email,
        role: invitation.role,
        authUserId
      }, 'Supabase Auth user created successfully')
    }

    // =================================================================
    // CREATE USER RECORD - Create new user in users table with GDPR consent
    // =================================================================
    // Create a new user record linked to the Supabase Auth account
    const { data: createdUser, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_user_id: authUserId, // CRITICAL: Link to auth.users
        email: invitation.email.toLowerCase(),
        name: invitation.name || null,
        role: invitation.role,
        invited_by: invitation.invited_by,

        // GDPR Phase 7: Store consent capture at signup
        age_confirmed: consents.age_confirmed,
        terms_accepted_at: consents.terms_accepted ? consents.consent_timestamp : null,
        privacy_accepted_at: consents.privacy_accepted ? consents.consent_timestamp : null,
        cookies_accepted_at: consents.cookies_accepted ? consents.consent_timestamp : null,
        consent_version: '1.0' // Track which version of T&C/Privacy they agreed to
      })
      .select()
      .single()

    if (userError || !createdUser) {
      // Rollback: Delete auth user if database insert fails (only if we just created them)
      if (!existingAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId)
      }

      logError(userError || new Error('Failed to create user record'), {
        operation: 'create_user_record',
        email: invitation.email,
        authUserId
      })

      return NextResponse.json(
        { success: false, error: 'Failed to create user account' },
        { status: 500 }
      )
    }

    // =================================================================
    // MARK INVITATION ACCEPTED - Update invitation_tokens table
    // =================================================================
    const { error: updateError } = await supabaseAdmin
      .from('invitation_tokens')
      .update({
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id)

    if (updateError) {
      logError(updateError, {
        operation: 'mark_invitation_accepted',
        invitationId: invitation.id,
        userId: createdUser.id
      })
      // Don't fail the request - user was created successfully
    }

    // =================================================================
    // ONBOARDING MILESTONE - Track invitation acceptance
    // =================================================================
    await trackOnboardingMilestone({
      clerkUserId: createdUser.id,
      milestone: 'invited', // Use existing milestone type
      metadata: {
        invitation_token: token,
        role: createdUser.role,
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
      userId: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
      invitedBy: createdUser.invited_by,
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
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role
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
