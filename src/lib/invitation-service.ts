/**
 * User Invitation Service Layer
 *
 * Shared business logic for user invitation system.
 * Used by both admin and user invitation APIs.
 */

import { supabaseAdmin } from './supabase'
import { sendInvitationEmail } from './email'
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
  user: {
    id: string
    email: string
    name: string | null
    role: string
    invitation_token: string
    invitation_expires_at: string
  }
  token: string
  expiresAt: Date
}

/**
 * Create an invitation (admin or user)
 *
 * This function handles the core invitation creation logic:
 * 1. Validates email doesn't already exist
 * 2. Generates invitation token
 * 3. Creates user record with invitation_token
 * 4. Sends email if requested
 * 5. Logs invitation to user_sent_invitations_log
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

  // 1. Check for duplicate
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingUser) {
    throw new Error('User with this email already exists')
  }

  // 2. Generate token
  const invitationToken = generateInvitationToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // 3. Create user record with invitation_token (100% Supabase, no Clerk)
  const { data: invitedUser, error } = await supabaseAdmin
    .from('users')
    .insert({
      email: normalizedEmail,
      name: name || null,
      role: role,
      invited_by: invitedBy.id,
      invitation_token: invitationToken,
      invitation_expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create invitation: ${error.message}`)
  }

  // 4. Log to user_sent_invitations_log
  await supabaseAdmin
    .from('user_sent_invitations_log')
    .insert({
      sender_user_id: invitedBy.id,
      sender_auth_user_id: invitedBy.auth_user_id,
      invited_user_id: invitedUser.id,
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
    user: invitedUser,
    token: invitationToken,
    expiresAt
  }
}

/**
 * Generate a secure invitation token
 */
function generateInvitationToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
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
      invited_user:invited_user_id(invitation_token)
    `)
    .eq('sender_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch invitations: ${error.message}`)
  }

  // Format response to include token at top level
  const formattedInvitations = invitations?.map(inv => ({
    id: inv.id,
    invitee_email: inv.invitee_email,
    status: inv.status,
    expires_at: inv.expires_at,
    sent_at: inv.created_at,
    accepted_at: inv.accepted_at,
    revoked_at: inv.revoked_at,
    invitation_token: (inv.invited_user as { invitation_token?: string })?.invitation_token || null
  }))

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
