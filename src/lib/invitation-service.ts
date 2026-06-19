/**
 * User Invitation Service Layer
 *
 * Shared business logic for user invitation system.
 * Used by both admin and user invitation APIs.
 */

import { supabaseAdmin } from './supabase'
import { sendInvitationEmail, generateInvitationToken } from './email'
import type { User } from './types'

export interface CreateInvitationParams {
  email: string
  name?: string
  role: string
  invitedBy: User
  sendEmail: boolean
  sentByAdmin: boolean
}

export interface InvitationResult {
  invitation: {
    id: string
    email: string
    name: string | null
    role: string
    token: string
    expires_at: string
  }
  token: string
  expiresAt: Date
}

/**
 * Create an invitation (admin or user)
 *
 * This function handles the core invitation creation logic:
 * 1. Validates email doesn't already belong to a user or a pending invitation
 * 2. Generates invitation token
 * 3. Creates an invitation_tokens record (the single source of truth that the
 *    redemption flow — /api/auth/accept-invitation — actually reads)
 * 4. Logs invitation to user_sent_invitations_log, linked via invitation_token_id
 * 5. Sends email if requested
 *
 * NOTE: this intentionally does NOT create a placeholder `users` row. The real
 * `users` row is created on acceptance, which is also what fires the signup
 * quota trigger. Writing the token onto `users.invitation_token` was the bug
 * that left user-sent invitations unredeemable.
 */
export async function createInvitation({
  email,
  name,
  role,
  invitedBy,
  sendEmail,
  sentByAdmin
}: CreateInvitationParams): Promise<InvitationResult> {
  const normalizedEmail = email.toLowerCase().trim()

  // 1. Check for duplicate — an existing user blocks the invite outright.
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingUser) {
    throw new Error('User with this email already exists')
  }

  // invitation_tokens.email is UNIQUE: a live pending invite blocks a new one;
  // a stale (accepted or expired) row is cleared first so the insert can reuse
  // the email. Deleting it cascades to its user_sent_invitations_log rows.
  const { data: existingInvitation } = await supabaseAdmin
    .from('invitation_tokens')
    .select('id, expires_at, accepted_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingInvitation) {
    const isPending =
      !existingInvitation.accepted_at &&
      new Date(existingInvitation.expires_at) > new Date()

    if (isPending) {
      throw new Error('An active invitation already exists for this email')
    }

    await supabaseAdmin
      .from('invitation_tokens')
      .delete()
      .eq('id', existingInvitation.id)
  }

  // 2. Generate token
  const invitationToken = generateInvitationToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // 3. Create invitation_tokens record (mirrors the admin invitations path)
  const { data: invitation, error } = await supabaseAdmin
    .from('invitation_tokens')
    .insert({
      email: normalizedEmail,
      name: name || null,
      token: invitationToken,
      role: role,
      invited_by: invitedBy.id,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create invitation: ${error.message}`)
  }

  // 4. Log to user_sent_invitations_log, linked to the invitation token.
  //    invited_user_id stays NULL until the invite is accepted.
  await supabaseAdmin
    .from('user_sent_invitations_log')
    .insert({
      sender_user_id: invitedBy.id,
      sender_auth_user_id: invitedBy.auth_user_id,
      invitation_token_id: invitation.id,
      invited_user_id: null,
      invitee_email: normalizedEmail,
      status: 'pending',
      sent_by_admin: sentByAdmin,
      expires_at: expiresAt.toISOString()
    })

  // 5. Send email if requested
  if (sendEmail) {
    await sendInvitationEmail(
      normalizedEmail,
      name || normalizedEmail,
      role,
      invitedBy.name || invitedBy.email,
      invitationToken
    )
  }

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      token: invitation.token,
      expires_at: invitation.expires_at,
    },
    token: invitationToken,
    expiresAt
  }
}

/**
 * Get user's invitation quota
 * Admins get unlimited quota
 */
export async function getUserQuota(userId: string, isAdmin: boolean) {
  if (isAdmin) {
    return {
      total_invites_granted: 999999,
      invites_used: 0,
      invites_remaining: 999999,
      is_admin: true
    }
  }

  const { data: quota, error } = await supabaseAdmin
    .from('user_invitation_quotas')
    .select('total_invites_granted, invites_used, invites_remaining')
    .eq('user_id', userId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch quota: ${error.message}`)
  }

  return {
    ...quota,
    is_admin: false
  }
}

/**
 * Get user's sent invitations
 */
export async function getUserInvitations(userId: string) {
  const { data: invitations, error } = await supabaseAdmin
    .from('user_sent_invitations_log')
    .select(`
      id,
      invitee_email,
      status,
      expires_at,
      created_at,
      accepted_at,
      revoked_at,
      invitation:invitation_token_id(token, expires_at, accepted_at)
    `)
    .eq('sender_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch invitations: ${error.message}`)
  }

  // Format response to include token at top level. The token now lives in
  // invitation_tokens (joined via invitation_token_id); fall back to the log's
  // own columns for any legacy rows that predate the link.
  const formattedInvitations = invitations?.map(inv => {
    const invitation = inv.invitation as {
      token?: string
      expires_at?: string
      accepted_at?: string
    } | null

    return {
      id: inv.id,
      invitee_email: inv.invitee_email,
      status: inv.status,
      expires_at: invitation?.expires_at ?? inv.expires_at,
      sent_at: inv.created_at,
      accepted_at: invitation?.accepted_at ?? inv.accepted_at,
      revoked_at: inv.revoked_at,
      invitation_token: invitation?.token || null
    }
  })

  return formattedInvitations
}

/**
 * Revoke a pending invitation (does NOT refund quota)
 */
export async function revokeInvitation(invitationId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from('user_sent_invitations_log')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString()
    })
    .eq('id', invitationId)
    .eq('sender_user_id', userId)
    .eq('status', 'pending')

  if (error) {
    throw new Error(`Failed to revoke invitation: ${error.message}`)
  }

  return { success: true }
}

/**
 * Expire invitations and refund quotas
 * Called on every GET /api/user/invitations (no cron needed)
 */
export async function expireInvitationsAndRefund() {
  const { data, error } = await supabaseAdmin
    .rpc('expire_invitations_and_refund')

  if (error) {
    throw new Error(`Failed to expire invitations: ${error.message}`)
  }

  return {
    expired_count: data?.[0]?.expired_count || 0,
    refunded_count: data?.[0]?.refunded_count || 0
  }
}
