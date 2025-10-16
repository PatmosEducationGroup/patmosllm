/**
 * GET /api/user/invitations/quota
 *
 * Returns current user's invitation quota.
 * Admins get unlimited quota (999999).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getUserQuota } from '@/lib/invitation-service'
import { logError } from '@/lib/logger'

export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    const quota = await getUserQuota(user.id, isAdmin)

    return NextResponse.json(quota)
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Failed to fetch quota'),
      {
        operation: 'get_invitation_quota',
        severity: 'medium'
      }
    )

    return NextResponse.json(
      { error: 'Failed to fetch invitation quota' },
      { status: 500 }
    )
  }
}
