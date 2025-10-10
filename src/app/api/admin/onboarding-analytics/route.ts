import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { logError } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  try {
    // =================================================================
    // AUTHENTICATION - getCurrentUser() handles both Supabase and Clerk auth
    // =================================================================
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    // =================================================================
    // DATA RETRIEVAL - Get onboarding status for all users from database view
    // =================================================================
    const { data: onboardingStatus, error: statusError } = await supabaseAdmin
      .from('user_onboarding_status')
      .select('*')
      .order('user_created_at', { ascending: false })

    if (statusError) {
      logError(statusError, {
        operation: 'fetch_onboarding_status',
        adminUserId: user.id,
        adminEmail: user.email,
        table: 'user_onboarding_status'
      })
      return NextResponse.json({ success: false, error: 'Failed to fetch onboarding data' }, { status: 500 })
    }

    // =================================================================
    // FUNNEL METRICS CALCULATION - Count users at each onboarding stage
    // =================================================================
    const funnelMetrics = {
      total_invited: onboardingStatus.length,
      first_login: onboardingStatus.filter(u => u.first_login_at).length,
      first_chat: onboardingStatus.filter(u => u.first_chat_at).length,
      first_successful_answer: onboardingStatus.filter(u => u.first_successful_answer_at).length,
      onboarding_complete: onboardingStatus.filter(u => u.onboarding_complete_at).length,
    }

    // =================================================================
    // CONVERSION RATES CALCULATION - Calculate % conversion between stages
    // =================================================================
    const conversionRates = {
      invited_to_login: funnelMetrics.total_invited > 0 ? 
        (funnelMetrics.first_login / funnelMetrics.total_invited * 100).toFixed(1) : '0',
      login_to_chat: funnelMetrics.first_login > 0 ? 
        (funnelMetrics.first_chat / funnelMetrics.first_login * 100).toFixed(1) : '0',
      chat_to_success: funnelMetrics.first_chat > 0 ? 
        (funnelMetrics.first_successful_answer / funnelMetrics.first_chat * 100).toFixed(1) : '0',
      overall_completion: funnelMetrics.total_invited > 0 ? 
        (funnelMetrics.onboarding_complete / funnelMetrics.total_invited * 100).toFixed(1) : '0',
    }

    // =================================================================
    // USERS BY STAGE GROUPING - Group users by their current onboarding stage
    // =================================================================
    const usersByStage = onboardingStatus.reduce((acc, user) => {
      if (!acc[user.current_stage]) {
        acc[user.current_stage] = []
      }
      acc[user.current_stage].push(user)
      return acc
    }, {} as Record<string, typeof onboardingStatus>)

    // =================================================================
    // STUCK USERS IDENTIFICATION - Find users stuck > 3 days at current stage
    // =================================================================
    const stuckUsers = onboardingStatus.filter(user => 
      user.days_stuck > 3 && user.current_stage !== 'completed'
    )

    // =================================================================
    // RECENT ACTIVITY ANALYSIS - Calculate activity in last 30 days
    // =================================================================
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentActivity = onboardingStatus.filter(user => 
      new Date(user.user_created_at) >= thirtyDaysAgo
    )

    // =================================================================
    // AVERAGE ONBOARDING TIME - Calculate average days to complete onboarding
    // =================================================================
    const completedUsers = onboardingStatus.filter(u => u.onboarding_complete_at)
    let averageOnboardingTime = 0

    if (completedUsers.length > 0) {
      const totalDays = completedUsers.reduce((sum, user) => {
        const invitedDate = new Date(user.invited_at || user.user_created_at)
        const completedDate = new Date(user.onboarding_complete_at)
        const daysDiff = (completedDate.getTime() - invitedDate.getTime()) / (1000 * 60 * 60 * 24)
        return sum + daysDiff
      }, 0)
      averageOnboardingTime = totalDays / completedUsers.length
    }

    // =================================================================
    // RESPONSE CONSTRUCTION - Return comprehensive analytics data
    // =================================================================
    return NextResponse.json({
      success: true,
      
      // High-level overview metrics
      overview: {
        total_users: onboardingStatus.length,
        completed_onboarding: funnelMetrics.onboarding_complete,
        completion_rate: conversionRates.overall_completion,
        average_onboarding_time: averageOnboardingTime,
        users_stuck: stuckUsers.length,
      },
      
      // Funnel progression counts
      funnel_metrics: funnelMetrics,
      
      // Stage-to-stage conversion percentages
      conversion_rates: conversionRates,
      
      // Users grouped by their current onboarding stage
      users_by_stage: usersByStage,
      
      // Users who are stuck (> 3 days at current stage)
      stuck_users: stuckUsers.map(user => ({
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        current_stage: user.current_stage,
        days_stuck: Math.round(user.days_stuck),
        progress_percentage: user.progress_percentage,
        created_at: user.user_created_at,
      })),
      
      // Recent activity trends (last 30 days)
      recent_activity: {
        new_users_30_days: recentActivity.length,
        completed_30_days: recentActivity.filter(u => u.onboarding_complete_at).length,
        completion_rate_30_days: recentActivity.length > 0 ? 
          (recentActivity.filter(u => u.onboarding_complete_at).length / recentActivity.length * 100).toFixed(1) : '0',
      },
      
      // Detailed user data for further analysis
      detailed_users: onboardingStatus.map(user => ({
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
        current_stage: user.current_stage,
        progress_percentage: user.progress_percentage,
        days_stuck: Math.round(user.days_stuck),
        created_at: user.user_created_at,
        milestones: {
          invited_at: user.invited_at,
          first_login_at: user.first_login_at,
          first_chat_at: user.first_chat_at,
          first_successful_answer_at: user.first_successful_answer_at,
          onboarding_complete_at: user.onboarding_complete_at,
        }
      }))
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/onboarding-analytics',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Internal server error'
    })
// =================================================================
    // ERROR HANDLING - Log errors and return user-friendly message
    // =================================================================
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}