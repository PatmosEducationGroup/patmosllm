import { NextRequest, NextResponse } from 'next/server'
import { logError, logger } from '@/lib/logger'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/admin/deletion-stats
 * Returns statistics about accounts scheduled for deletion
 *
 * Access: ADMIN, SUPER_ADMIN only
 */
export async function GET(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Query for accounts scheduled for deletion
    const stats = await withSupabaseAdmin(async (supabase) => {
      const { data: scheduledDeletions, error: deletionError } = await supabase
        .from('users')
        .select('id, deleted_at')
        .not('deleted_at', 'is', null)

      if (deletionError) {
        logError(deletionError, { context: 'deletion-stats-api' })
        throw deletionError
      }

      const now = new Date()
      const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000))

      // Count accounts that will be deleted within 3 days
      const upcomingDeletions = (scheduledDeletions || []).filter(u => {
        if (!u.deleted_at) return false
        const deletionDate = new Date(new Date(u.deleted_at).getTime() + (30 * 24 * 60 * 60 * 1000))
        return deletionDate <= threeDaysFromNow
      }).length

      return {
        scheduledDeletions: scheduledDeletions?.length || 0,
        upcomingDeletions
      }
    })

    logger.info(
      {
        scheduledDeletions: stats.scheduledDeletions,
        upcomingDeletions: stats.upcomingDeletions,
        adminUserId: user.id
      },
      'Deletion stats fetched'
    )

    return NextResponse.json(stats)

  } catch (error) {
    logError(error, { context: 'deletion-stats-api' })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
