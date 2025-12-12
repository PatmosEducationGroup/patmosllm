// File: src/lib/onboardingTracker.ts

import { supabaseAdmin } from '@/lib/supabase'
import { logError, loggers } from '@/lib/logger'

export type MilestoneType =
  | 'invited'
  | 'first_login'
  | 'first_document_view'
  | 'first_document_upload'
  | 'first_chat'
  | 'first_successful_answer'
  | 'onboarding_complete'

interface TrackMilestoneParams {
  authUserId: string
  milestone: MilestoneType
  metadata?: Record<string, unknown>
}

/**
 * Track a user's onboarding milestone
 * This function can be called from anywhere in your app to record progress
 */
export async function trackOnboardingMilestone({
  authUserId,
  milestone,
  metadata = {}
}: TrackMilestoneParams): Promise<boolean> {
  try {
const supabase = supabaseAdmin

    // Get user from database using auth_user_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single()

    if (userError || !user) {
      loggers.database({ authUserId, error: userError?.message, operation: 'find_user' }, 'User not found for milestone tracking')
      return false
    }

    // Call the database function to track the milestone
    const { error: milestoneError } = await supabase
      .rpc('track_onboarding_milestone', {
        p_user_id: user.id,
        p_milestone_type: milestone,
        p_metadata: metadata
      })

    if (milestoneError) {
      loggers.database({ milestone, authUserId, userId: user.id, error: milestoneError.message }, 'Error tracking milestone')
      return false
    }

    loggers.database({ milestone, authUserId, userId: user.id, success: true }, 'Milestone tracked successfully')
    return true

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Onboarding milestone tracking failed'), {
      operation: 'trackOnboardingMilestone',
      phase: 'milestone_save',
      severity: 'low',
      authUserId,
      milestone,
      errorContext: 'Failed to track user onboarding milestone in database'
    })
    return false
  }
}

/**
 * Track milestone via API endpoint (for client-side calls)
 */
export async function trackMilestoneAPI(milestone: MilestoneType, metadata?: Record<string, unknown>) {
  try {
    const response = await fetch('/api/onboarding/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        milestone,
        metadata
      }),
    })

    return response.ok
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Milestone API tracking failed'), {
      operation: 'trackMilestoneAPI',
      phase: 'api_request',
      severity: 'low',
      milestone,
      errorContext: 'Failed to track milestone via API endpoint (client-side)'
    })
    return false
  }
}

/**
 * Get user's current onboarding status
 */
export async function getUserOnboardingStatus(authUserId: string) {
  try {
   const supabase = supabaseAdmin

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single()

    if (userError || !user) {
      return null
    }

    const { data: status, error: statusError } = await supabase
      .from('user_onboarding_status')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (statusError) {
      loggers.database({ authUserId, userId: user.id, error: statusError.message }, 'Error fetching onboarding status')
      return null
    }

    return status
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to fetch onboarding status'), {
      operation: 'getUserOnboardingStatus',
      phase: 'status_retrieval',
      severity: 'low',
      authUserId,
      errorContext: 'Failed to retrieve user onboarding status from database'
    })
    return null
  }
}

/**
 * Check if user has completed a specific milestone
 */
export async function hasCompletedMilestone(
  authUserId: string,
  milestone: MilestoneType
): Promise<boolean> {
  try {
    const status = await getUserOnboardingStatus(authUserId)
    if (!status) return false

    const milestoneField = `${milestone}_at` as keyof typeof status
    return !!status[milestoneField]
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to check milestone completion'), {
      operation: 'hasCompletedMilestone',
      phase: 'milestone_check',
      severity: 'low',
      authUserId,
      milestone,
      errorContext: 'Failed to check if user completed specific milestone'
    })
    return false
  }
}

/**
 * Middleware function to automatically track first_login milestone
 * Call this in your middleware or auth check
 */
export async function trackFirstLogin(authUserId: string) {
  const hasLoggedIn = await hasCompletedMilestone(authUserId, 'first_login')

  if (!hasLoggedIn) {
    await trackOnboardingMilestone({
      authUserId,
      milestone: 'first_login',
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'automatic_detection'
      }
    })
  }
}
