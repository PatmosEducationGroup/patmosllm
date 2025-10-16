/**
 * /api/admin/invitation-quotas
 *
 * GET  - List all users with their quota information (admins only)
 * POST - Grant invitations to users (admins only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logError, loggers } from '@/lib/logger'

interface QuotaWithUser {
  user_id: string
  total_invites_granted: number
  invites_used: number
  invites_remaining: number
  created_at: string
  updated_at: string
  users: {
    email: string
    name: string | null
    role: string
  }
}

/**
 * GET /api/admin/invitation-quotas
 * List all users with their quota information
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

    // Check admin permission
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Get all users with their quotas
    const { data: quotas, error } = await supabaseAdmin
      .from('user_invitation_quotas')
      .select(`
        user_id,
        total_invites_granted,
        invites_used,
        invites_remaining,
        created_at,
        updated_at,
        users!inner (
          email,
          name,
          role
        )
      `)
      .order('total_invites_granted', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch quotas: ${error.message}`)
    }

    // Format response
    const formattedQuotas = (quotas as unknown as QuotaWithUser[])?.map(q => ({
      user_id: q.user_id,
      email: q.users.email,
      name: q.users.name,
      role: q.users.role,
      total_invites_granted: q.total_invites_granted,
      invites_used: q.invites_used,
      invites_remaining: q.invites_remaining
    }))

    return NextResponse.json({
      quotas: formattedQuotas
    })
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Failed to fetch quotas'),
      {
        operation: 'admin_get_quotas',
        severity: 'medium'
      }
    )

    return NextResponse.json(
      { error: 'Failed to fetch invitation quotas' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/invitation-quotas
 * Grant invitations to users
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

    // Check admin permission
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { action, userId, addInvites, onlyRole } = body

    // Validate addInvites
    if (!addInvites || addInvites <= 0) {
      return NextResponse.json(
        { error: 'Must grant at least 1 invitation' },
        { status: 400 }
      )
    }

    let result

    if (action === 'grant-to-user') {
      // Grant to specific user
      if (!userId) {
        return NextResponse.json(
          { error: 'userId required for grant-to-user action' },
          { status: 400 }
        )
      }

      const { data, error } = await supabaseAdmin
        .rpc('grant_invites_to_user', {
          p_user_id: userId,
          p_add_invites: addInvites
        })

      if (error) {
        throw new Error(`Failed to grant invites: ${error.message}`)
      }

      result = data?.[0]

      loggers.auth(
        { admin_id: user.id, target_user_id: userId, invites_granted: addInvites },
        'Admin granted invitations to specific user'
      )
    } else if (action === 'grant-to-all') {
      // Grant to all users (with optional role filter)
      const { data, error } = await supabaseAdmin
        .rpc('grant_invites_to_all', {
          p_add_invites: addInvites,
          p_only_role: onlyRole || null
        })

      if (error) {
        throw new Error(`Failed to grant invites to all: ${error.message}`)
      }

      result = data?.[0]

      loggers.auth(
        {
          admin_id: user.id,
          invites_granted: addInvites,
          role_filter: onlyRole || 'all',
          users_updated: result?.users_updated
        },
        'Admin granted invitations to all users'
      )
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "grant-to-user" or "grant-to-all"' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: result?.success !== false,
      message: result?.message || 'Invitations granted successfully',
      users_updated: result?.users_updated
    })
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Failed to grant invitations'),
      {
        operation: 'admin_grant_invitations',
        severity: 'high'
      }
    )

    const message = error instanceof Error ? error.message : 'Failed to grant invitations'

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
