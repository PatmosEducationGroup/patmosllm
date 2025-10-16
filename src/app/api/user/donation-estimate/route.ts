import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { formatDonationEstimate } from '@/lib/donation-cost-calculator'
import { getTrackingConsent } from '@/lib/donation-tracker'
import { logError } from '@/lib/logger'

/**
 * API Route: Donation Cost Estimate
 * GET /api/user/donation-estimate
 *
 * Returns the current month's donation cost estimate for the authenticated user.
 *
 * Response formats:
 *
 * When tracking is enabled:
 * {
 *   estimate: 3.47,              // Raw estimate in USD
 *   perDay: 0.12,                // Average cost per day this month
 *   formatted: "$3.47",          // Display-ready string (with $0.25 floor)
 *   perDayFormatted: "$0.12/day",
 *   valueFraming: "Less than a coffee ☕",
 *   lastUpdated: "2024-10-16T02:00:00Z",
 *   totalTokens: 125000,
 *   totalOperations: 45
 * }
 *
 * When tracking is disabled (user opted out):
 * {
 *   tracking: "disabled",
 *   message: "Usage transparency is disabled. Enable in Settings > Privacy."
 * }
 */
export async function GET(_request: NextRequest) {
  try {
    // Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user has enabled tracking
    const hasConsent = await getTrackingConsent(user.id)
    if (!hasConsent) {
      return NextResponse.json({
        tracking: 'disabled',
        message: 'Usage transparency is disabled. Enable in Settings > Privacy.'
      })
    }

    // Fetch donation estimate from database
    const result = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('daily_donation_estimates')
        .select('current_month_estimate_usd, total_tokens_used, total_operations, last_updated')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to fetch donation estimate: ${error.message}`)
      }

      return data
    })

    // If no estimate exists yet (new user or first usage), return zero estimate
    if (!result) {
      const formatted = formatDonationEstimate(0)
      return NextResponse.json({
        estimate: 0,
        perDay: 0,
        formatted: formatted.formatted,
        perDayFormatted: formatted.perDayFormatted,
        valueFraming: formatted.valueFraming,
        lastUpdated: null,
        totalTokens: 0,
        totalOperations: 0
      })
    }

    // Format estimate for display
    const estimate = Number(result.current_month_estimate_usd)
    const formatted = formatDonationEstimate(estimate)

    return NextResponse.json({
      estimate,
      perDay: formatted.perDay,
      formatted: formatted.formatted,
      perDayFormatted: formatted.perDayFormatted,
      valueFraming: formatted.valueFraming,
      lastUpdated: result.last_updated,
      totalTokens: result.total_tokens_used,
      totalOperations: result.total_operations
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'GET /api/user/donation-estimate',
      userId: 'unknown'
    })

    return NextResponse.json(
      { error: 'Failed to fetch donation estimate' },
      { status: 500 }
    )
  }
}
