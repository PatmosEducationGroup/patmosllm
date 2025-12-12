import { NextRequest, NextResponse } from 'next/server'
import { logError, logger } from '@/lib/logger'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/admin/invitation-stats
 * Returns statistics about invitations
 *
 * Access: ADMIN, SUPER_ADMIN only
 */
export async function GET(_request: NextRequest) {
  try {
    // getCurrentUser() handles Supabase auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Query for pending invitations (users with is_active = false)
    const stats = await withSupabaseAdmin(async (supabase) => {
      const { data: pendingInvitations, error: pendingError } = await supabase
        .from('users')
        .select('id')
        .eq('is_active', false)

      if (pendingError) {
        logError(pendingError, { context: 'invitation-stats-api' })
      }

      // Query for total invitations count
      const { count: totalInvitations, error: totalError } = await supabase
        .from('users')
        .select('id', { count: 'exact' })

      if (totalError) {
        logError(totalError, { context: 'invitation-stats-api' })
      }

      return {
        pendingInvitations: pendingInvitations?.length || 0,
        totalInvitations: totalInvitations || 0
      }
    })

    logger.info(
      {
        pendingInvitations: stats.pendingInvitations,
        totalInvitations: stats.totalInvitations,
        adminUserId: user.id
      },
      'Invitation stats fetched'
    )

    return NextResponse.json(stats)

  } catch (error) {
    logError(error, { context: 'invitation-stats-api' })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
