// File: src/lib/onboardingTracker.ts

import { supabaseAdmin } from '@/lib/supabase'

export type MilestoneType = 
  | 'invited'
  | 'first_login'
  | 'first_document_view'
  | 'first_document_upload'
  | 'first_chat'
  | 'first_successful_answer'
  | 'onboarding_complete'

interface TrackMilestoneParams {
  clerkUserId: string
  milestone: MilestoneType
  metadata?: Record<string, unknown>
}

/**
 * Track a user's onboarding milestone
 * This function can be called from anywhere in your app to record progress
 */
export async function trackOnboardingMilestone({
  clerkUserId,
  milestone,
  metadata = {}
}: TrackMilestoneParams): Promise<boolean> {
  try {
const supabase = supabaseAdmin

    // Get user from database using clerk_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkUserId)
      .single()

    if (userError || !user) {
      console.error('User not found for milestone tracking:', clerkUserId, userError)
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
      console.error('Error tracking milestone:', milestoneError)
      return false
    }

    console.log(`Milestone tracked: ${milestone} for user ${clerkUserId}`)
    return true

  } catch (error) {
    console.error('Error in trackOnboardingMilestone:', error)
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
    console.error('Error tracking milestone via API:', error)
    return false
  }
}

/**
 * Get user's current onboarding status
 */
export async function getUserOnboardingStatus(clerkUserId: string) {
  try {
   const supabase = supabaseAdmin

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkUserId)
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
      console.error('Error fetching onboarding status:', statusError)
      return null
    }

    return status
  } catch (error) {
    console.error('Error in getUserOnboardingStatus:', error)
    return null
  }
}

/**
 * Check if user has completed a specific milestone
 */
export async function hasCompletedMilestone(
  clerkUserId: string, 
  milestone: MilestoneType
): Promise<boolean> {
  try {
    const status = await getUserOnboardingStatus(clerkUserId)
    if (!status) return false

    const milestoneField = `${milestone}_at` as keyof typeof status
    return !!status[milestoneField]
  } catch (error) {
    console.error('Error checking milestone completion:', error)
    return false
  }
}

/**
 * Middleware function to automatically track first_login milestone
 * Call this in your middleware or auth check
 */
export async function trackFirstLogin(clerkUserId: string) {
  const hasLoggedIn = await hasCompletedMilestone(clerkUserId, 'first_login')
  
  if (!hasLoggedIn) {
    await trackOnboardingMilestone({
      clerkUserId,
      milestone: 'first_login',
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'automatic_detection'
      }
    })
  }
}