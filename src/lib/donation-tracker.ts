/**
 * Donation Cost Tracker
 *
 * Fire-and-forget usage logging for donation transparency
 *
 * Features:
 * - Consent checking (respects user opt-out)
 * - Idempotency (prevents duplicate logs on retries)
 * - Silent failure (never blocks UX)
 * - 1% sampled error logging (avoid spam)
 *
 * Usage:
 *   import { trackUsage } from '@/lib/donation-tracker'
 *
 *   // After OpenAI call
 *   trackUsage({
 *     userId,
 *     service: 'openai',
 *     totalTokens: 2500,
 *     operationCount: 1,
 *     requestId: crypto.randomUUID()
 *   })
 */

import { withSupabaseAdmin } from '@/lib/supabase'
import { estimateDonationCost } from '@/lib/donation-cost-calculator'
import { logError } from '@/lib/logger'

// ============================================================================
// Type Definitions
// ============================================================================

export type ServiceType = 'openai' | 'voyage' | 'pinecone' | 'resend' | 'supabase'

export interface TrackUsageParams {
  /** User ID (from users table) */
  userId: string

  /** Service identifier */
  service: ServiceType

  /** Total tokens consumed (0 for non-token operations) */
  totalTokens?: number

  /** Number of operations (default: 1) */
  operationCount?: number

  /** Request ID for idempotency (optional but recommended) */
  requestId?: string
}

// ============================================================================
// Consent Management
// ============================================================================

/**
 * Check if user has enabled donation tracking
 * Returns true if enabled (or unknown - opt-out system, default enabled)
 */
async function checkUserConsent(userId: string): Promise<boolean> {
  try {
    const consent = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('usage_tracking_consent')
        .select('tracking_enabled')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      return data
    })

    // If no consent record found, default to enabled (opt-out system)
    if (!consent) return true

    return consent.tracking_enabled
  } catch (error) {
    // On error, fail open (allow tracking) - conservative approach
    // This ensures system degradation doesn't break donation transparency
    if (Math.random() < 0.01) {
      // 1% sampled logging to avoid spam
      logError(error instanceof Error ? error : new Error('Unknown error'), {
        operation: 'checkUserConsent',
        userId
      })
    }
    return true
  }
}

// ============================================================================
// Usage Logging
// ============================================================================

/**
 * Log service usage for donation cost calculation
 *
 * This is a fire-and-forget operation - it never throws errors
 * If logging fails, it silently fails (UX is never blocked)
 *
 * @param params - Usage tracking parameters
 *
 * @example
 * // Track OpenAI chat completion
 * trackUsage({
 *   userId: 'uuid',
 *   service: 'openai',
 *   totalTokens: 2500,
 *   requestId: crypto.randomUUID()
 * })
 *
 * @example
 * // Track Pinecone query
 * trackUsage({
 *   userId: 'uuid',
 *   service: 'pinecone',
 *   operationCount: 1,
 *   requestId: crypto.randomUUID()
 * })
 */
export async function trackUsage(params: TrackUsageParams): Promise<void> {
  const {
    userId,
    service,
    totalTokens = 0,
    operationCount = 1,
    requestId
  } = params

  try {
    // Step 1: Check user consent (respects opt-out)
    const hasConsent = await checkUserConsent(userId)
    if (!hasConsent) {
      // User opted out - silently skip logging
      return
    }

    // Step 2: Calculate cost estimate
    const estimatedCost = estimateDonationCost({
      totalTokens,
      operationCount
    })

    // Step 3: Get auth_user_id for denormalized storage
    const _authUserId = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('users')
        .select('auth_user_id')
        .eq('id', userId)
        .single()

      if (error) throw error
      return data.auth_user_id
    })

    // Step 4: Insert usage log (with idempotency protection)
    await withSupabaseAdmin(async (supabase) => {
      const { error } = await supabase
        .from('api_usage_internal_log')
        .insert({
          user_id: userId,
          service,
          total_tokens: totalTokens,
          operation_count: operationCount,
          estimated_cost_usd: estimatedCost,
          request_id: requestId || null, // null if not provided
          // created_at and expires_at have defaults in DB
        })

      if (error) {
        // Check if error is due to duplicate request_id
        if (error.code === '23505' && error.message?.includes('uq_internal_request')) {
          // Duplicate request_id - this is expected for retries, silently skip
          return
        }
        throw error
      }
    })
  } catch (error) {
    // Silent failure - log error but NEVER throw
    // This ensures tracking never blocks the main request
    if (Math.random() < 0.01) {
      // 1% sampled logging to avoid spam
      logError(error instanceof Error ? error : new Error('Unknown error'), {
        operation: 'trackUsage',
        userId,
        service,
        totalTokens,
        operationCount,
        requestId
      })
    }
  }
}

// ============================================================================
// Batch Tracking (for bulk operations)
// ============================================================================

/**
 * Track multiple usage events in a single transaction
 * Useful for document processing with multiple embeddings
 *
 * @param events - Array of usage tracking parameters
 *
 * @example
 * // Track document upload with 50 chunk embeddings
 * trackUsageBatch([
 *   { userId, service: 'voyage', totalTokens: 1000, requestId: id1 },
 *   { userId, service: 'voyage', totalTokens: 950, requestId: id2 },
 *   // ... 48 more events
 * ])
 */
export async function trackUsageBatch(events: TrackUsageParams[]): Promise<void> {
  if (events.length === 0) return

  // Get first user ID (assume all events are for same user)
  const userId = events[0]?.userId
  if (!userId) return

  try {
    // Step 1: Check consent once for all events
    const hasConsent = await checkUserConsent(userId)
    if (!hasConsent) return

    // Step 2: Get auth_user_id once
    const _authUserId = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('users')
        .select('auth_user_id')
        .eq('id', userId)
        .single()

      if (error) throw error
      return data.auth_user_id
    })

    // Step 3: Calculate costs and prepare batch insert
    const logs = events.map(event => ({
      user_id: event.userId,
      service: event.service,
      total_tokens: event.totalTokens || 0,
      operation_count: event.operationCount || 1,
      estimated_cost_usd: estimateDonationCost({
        totalTokens: event.totalTokens || 0,
        operationCount: event.operationCount || 1
      }),
      request_id: event.requestId || null
    }))

    // Step 4: Batch insert (Supabase handles duplicate request_id gracefully)
    await withSupabaseAdmin(async (supabase) => {
      const { error } = await supabase
        .from('api_usage_internal_log')
        .insert(logs)

      if (error && !error.message?.includes('uq_internal_request')) {
        throw error
      }
    })
  } catch (error) {
    // Silent failure with 1% sampled logging
    if (Math.random() < 0.01) {
      logError(error instanceof Error ? error : new Error('Unknown error'), {
        operation: 'trackUsageBatch',
        userId,
        eventCount: events.length
      })
    }
  }
}

// ============================================================================
// Consent Management API (for user settings)
// ============================================================================

/**
 * Update user's donation tracking consent
 * Used by /settings/privacy page
 *
 * @param userId - User ID
 * @param enabled - Whether to enable tracking
 */
export async function updateTrackingConsent(
  userId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get auth_user_id
    const authUserId = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('users')
        .select('auth_user_id')
        .eq('id', userId)
        .single()

      if (error) throw error
      return data.auth_user_id
    })

    // Upsert consent record
    await withSupabaseAdmin(async (supabase) => {
      const { error } = await supabase
        .from('usage_tracking_consent')
        .upsert({
          user_id: userId,
          auth_user_id: authUserId,
          tracking_enabled: enabled,
          consent_given_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) throw error
    })

    return { success: true }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'updateTrackingConsent',
      userId,
      enabled
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get user's current tracking consent status
 *
 * @param userId - User ID
 * @returns Consent status (default: true if no record exists)
 */
export async function getTrackingConsent(userId: string): Promise<boolean> {
  return checkUserConsent(userId)
}
