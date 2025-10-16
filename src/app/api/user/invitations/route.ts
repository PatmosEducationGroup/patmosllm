/**
 * /api/user/invitations
 *
 * GET    - List user's sent invitations (with auto-expiration)
 * POST   - Send new invitation
 * DELETE - Revoke pending invitation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getUserInvitations,
  getUserQuota,
  createInvitation,
  revokeInvitation,
  expireInvitationsAndRefund
} from '@/lib/invitation-service'
import { logError, loggers } from '@/lib/logger'
import { supabaseAdmin } from '@/lib/supabase'

// In-memory rate limiting (TODO: Replace with Upstash Redis)
const invitationRateLimit = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 10

function checkRateLimit(userId: string): { allowed: boolean; resetIn?: number } {
  const now = Date.now()
  const userRequests = invitationRateLimit.get(userId) || []

  // Remove expired requests
  const validRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW)

  if (validRequests.length >= RATE_LIMIT_MAX) {
    const oldestRequest = Math.min(...validRequests)
    const resetIn = RATE_LIMIT_WINDOW - (now - oldestRequest)
    return { allowed: false, resetIn }
  }

  // Add current request
  validRequests.push(now)
  invitationRateLimit.set(userId, validRequests)

  return { allowed: true }
}

/**
 * GET /api/user/invitations
 * List user's sent invitations (auto-expires before returning)
 */
export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Auto-expire invitations and refund quotas (no cron needed)
    const { expired_count, refunded_count } = await expireInvitationsAndRefund()

    // Get user's invitations
    const invitations = await getUserInvitations(user.id)

    return NextResponse.json({
      invitations,
      expired_count,
      refunded_count
    })
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Failed to fetch invitations'),
      {
        operation: 'get_invitations',
        severity: 'medium'
      }
    )

    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user/invitations
 * Send new invitation
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    // Parse request body
    const body = await request.json()
    const { email } = body

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    // Admins bypass rate limit and quota checks
    if (!isAdmin) {
      // Check rate limit
      const rateLimit = checkRateLimit(user.id)
      if (!rateLimit.allowed) {
        const resetMinutes = Math.ceil((rateLimit.resetIn || 0) / 60000)
        return NextResponse.json(
          {
            error: `Rate limit exceeded. Try again in ${resetMinutes} minutes.`,
            resetIn: rateLimit.resetIn
          },
          { status: 429 }
        )
      }

      // Check quota
      const quota = await getUserQuota(user.id, false)
      if (quota.invites_remaining <= 0) {
        return NextResponse.json(
          { error: 'No invitations remaining. Contact an administrator for more.' },
          { status: 403 }
        )
      }
    }

    // Create invitation
    const invitation = await createInvitation({
      email,
      name: undefined,
      role: 'USER',
      invitedBy: user,
      sendEmail: true,
      sentByAdmin: isAdmin
    })

    // Increment quota (unless admin)
    if (!isAdmin) {
      // Use RPC to increment invites_used atomically
      await supabaseAdmin.rpc('increment_invites_used', { p_user_id: user.id })
    }

    loggers.auth(
      { user_id: user.id, invitee_email: email, sent_by_admin: isAdmin },
      'Invitation sent successfully'
    )

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.user.id,
        email: invitation.user.email,
        token: invitation.token,
        expires_at: invitation.expiresAt.toISOString()
      }
    })
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Failed to send invitation'),
      {
        operation: 'send_invitation',
        severity: 'high'
      }
    )

    const message = error instanceof Error ? error.message : 'Failed to send invitation'

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/user/invitations
 * Revoke pending invitation (does NOT refund quota)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get invitation ID from query params
    const { searchParams } = new URL(request.url)
    const invitationId = searchParams.get('id')

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID required' },
        { status: 400 }
      )
    }

    // Revoke invitation
    await revokeInvitation(invitationId, user.id)

    loggers.auth(
      { user_id: user.id, invitation_id: invitationId },
      'Invitation revoked (no quota refund)'
    )

    return NextResponse.json({
      success: true,
      message: 'Invitation revoked successfully'
    })
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Failed to revoke invitation'),
      {
        operation: 'revoke_invitation',
        severity: 'medium'
      }
    )

    return NextResponse.json(
      { error: 'Failed to revoke invitation' },
      { status: 500 }
    )
  }
}
