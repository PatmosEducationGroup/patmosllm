/**
 * Donation Cost Calculator
 *
 * Purpose: Calculate unified donation cost estimate for transparency (NOT billing)
 * Design: Single blended LLM rate + token-equivalent heuristics for operations
 * Privacy: No prompt storage, costs calculated from token counts only
 *
 * Pricing Model:
 * - LLM tokens: $0.005 per 10k tokens (blended OpenAI + Voyage rate)
 * - Operations: 100 token-equivalents per operation (Pinecone query, email send)
 * - Infrastructure overhead: 1.10x multiplier (10% for hosting, storage, bandwidth)
 *
 * All pricing constants are environment-tunable for easy updates.
 *
 * Display guardrails (applied at UI layer, NOT here):
 * - Floor: $0.25 minimum shown to users (but $0.00 stored if actual cost < $0.25)
 * - Cap: None at calculation level (UI may cap per-request display at $0.50)
 */

// ============================================================================
// Environment-Tunable Pricing Constants
// ============================================================================

/**
 * Get pricing constant from environment with fallback default
 * All defaults chosen to be psychologically accurate over financially precise
 */
const env = (key: string, defaultValue: number): number => {
  const value = process.env[key]
  if (!value) return defaultValue

  const parsed = Number(value)
  if (isNaN(parsed)) {
    console.warn(`[donation-calculator] Invalid ${key}=${value}, using default ${defaultValue}`)
    return defaultValue
  }

  return parsed
}

/**
 * Pricing configuration (all env-tunable)
 *
 * To override pricing, set environment variables:
 * - LLM_PER_10K_TOKENS: Cost per 10,000 LLM tokens (default: $0.005)
 * - OP_EQUIV_TOKENS: Token-equivalent per operation (default: 100)
 * - INFRA_OVERHEAD: Infrastructure overhead multiplier (default: 1.10 = 10%)
 */
export const PRICING = {
  /** Cost per 10,000 LLM tokens (blended OpenAI GPT-4o-mini + Voyage-3-large) */
  llm_per_10k_tokens: env('LLM_PER_10K_TOKENS', 0.005),

  /** Token-equivalents per non-token operation (Pinecone query, email send, etc.) */
  op_equiv_tokens: env('OP_EQUIV_TOKENS', 100),

  /** Infrastructure overhead multiplier (1.10 = 10% for hosting, storage, bandwidth) */
  infrastructure_overhead: env('INFRA_OVERHEAD', 1.10),
} as const

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Calculate donation cost estimate for a single request or aggregation
 *
 * Formula:
 * 1. Convert operations to token-equivalents: op_count * op_equiv_tokens
 * 2. Calculate base cost: (total_tokens + equivalent_tokens) / 10k * rate
 * 3. Apply infrastructure overhead: base_cost * overhead_multiplier
 *
 * @param totalTokens - LLM tokens consumed (input + output from OpenAI/Voyage)
 * @param operationCount - Number of non-token operations (Pinecone queries, emails, etc.)
 * @returns Estimated cost in USD (raw value, no floor/cap applied)
 *
 * @example
 * // Chat request: 2,500 tokens + 1 Pinecone query
 * estimateDonationCost({ totalTokens: 2500, operationCount: 1 })
 * // Returns: ~$0.0014 (2,500 tokens + 100 equiv = 2,600 total * $0.005/10k * 1.10)
 *
 * @example
 * // Document upload: 0 tokens + 50 chunk embeddings
 * estimateDonationCost({ totalTokens: 0, operationCount: 50 })
 * // Returns: ~$0.0275 (5,000 equiv tokens * $0.005/10k * 1.10)
 *
 * @example
 * // Monthly aggregation: 1.5M tokens + 300 operations
 * estimateDonationCost({ totalTokens: 1_500_000, operationCount: 300 })
 * // Returns: ~$0.84 ((1.5M + 30k equiv) * $0.005/10k * 1.10)
 */
export function estimateDonationCost({
  totalTokens = 0,
  operationCount = 0
}: {
  totalTokens?: number
  operationCount?: number
}): number {
  // Step 1: Convert operations to token-equivalents
  // Example: 5 Pinecone queries = 5 * 100 = 500 token-equivalents
  const equivalentTokens = operationCount * PRICING.op_equiv_tokens

  // Step 2: Calculate base cost from total tokens
  // Example: (2,500 tokens + 500 equiv) / 10,000 * $0.005 = $0.0015
  const totalEffectiveTokens = totalTokens + equivalentTokens
  const baseCost = (totalEffectiveTokens / 10_000) * PRICING.llm_per_10k_tokens

  // Step 3: Apply infrastructure overhead (hosting, storage, bandwidth)
  // Example: $0.0015 * 1.10 = $0.00165
  const withOverhead = baseCost * PRICING.infrastructure_overhead

  // Return raw cost (no floor/cap at this layer)
  // Floor/cap applied at display layer only to avoid aggregation distortion
  return Math.max(0.00, withOverhead)
}

// ============================================================================
// Display Formatting Utilities
// ============================================================================

/**
 * Format donation estimate for user display with psychological framing
 * Applies display-only floor (not stored in database)
 *
 * @param estimate - Raw monthly estimate in USD
 * @returns Formatted display object with value framing
 *
 * @example
 * formatDonationEstimate(3.47)
 * // Returns: {
 * //   formatted: "$3.47",
 * //   valueFraming: "Less than a coffee ☕",
 * //   perDay: 0.12,
 * //   perDayFormatted: "$0.12/day"
 * // }
 *
 * @example
 * formatDonationEstimate(0.08) // Below $0.25 floor
 * // Returns: {
 * //   formatted: "$0.25", // Display floor applied
 * //   valueFraming: "Less than a stamp 📬",
 * //   perDay: 0.00,
 * //   perDayFormatted: "$0.00/day"
 * // }
 */
export function formatDonationEstimate(estimate: number): {
  formatted: string
  valueFraming: string
  perDay: number
  perDayFormatted: string
} {
  // Calculate per-day average (guard against division by zero on month start)
  const today = new Date()
  const daysElapsed = Math.max(1, today.getDate())
  const perDay = estimate / daysElapsed // Use raw estimate, not floored

  // Format estimate with smart handling of very small amounts
  let formatted: string
  if (estimate < 0.01) {
    formatted = "Less than 1¢"
  } else if (estimate < 0.25) {
    // Show cents for amounts between 1¢ and 25¢
    formatted = `${Math.round(estimate * 100)}¢`
  } else {
    // Show dollars for amounts 25¢ and above
    formatted = `$${estimate.toFixed(2)}`
  }

  // Format per-day with similar logic
  let perDayFormatted: string
  if (perDay < 0.01) {
    perDayFormatted = "Less than 1¢/day"
  } else if (perDay < 0.25) {
    perDayFormatted = `${Math.round(perDay * 100)}¢/day`
  } else {
    perDayFormatted = `$${perDay.toFixed(2)}/day`
  }

  // Value framing for psychological context
  const valueFraming =
    estimate < 1 ? "Less than a stamp 📬" :
    estimate < 5 ? "Less than a coffee ☕" :
    estimate < 10 ? "Less than lunch 🍔" :
    estimate < 20 ? "Less than a movie ticket 🎬" :
    "Powering your learning 📚"

  return {
    formatted,
    valueFraming,
    perDay: Math.max(0, perDay),
    perDayFormatted
  }
}

// ============================================================================
// Service-Specific Helpers
// ============================================================================

/**
 * Helper: Calculate cost for OpenAI chat completion
 *
 * @param inputTokens - Prompt tokens
 * @param outputTokens - Completion tokens
 * @returns Estimated cost in USD
 *
 * @example
 * estimateOpenAIChatCost(500, 1500) // $0.0011 (2,000 tokens * $0.005/10k * 1.10)
 */
export function estimateOpenAIChatCost(inputTokens: number, outputTokens: number): number {
  return estimateDonationCost({ totalTokens: inputTokens + outputTokens })
}

/**
 * Helper: Calculate cost for Voyage embedding
 *
 * @param tokens - Embedding input tokens
 * @returns Estimated cost in USD
 *
 * @example
 * estimateVoyageEmbeddingCost(1000) // $0.00055 (1,000 tokens * $0.005/10k * 1.10)
 */
export function estimateVoyageEmbeddingCost(tokens: number): number {
  return estimateDonationCost({ totalTokens: tokens })
}

/**
 * Helper: Calculate cost for Pinecone query (operation-based)
 *
 * @param queryCount - Number of queries executed
 * @returns Estimated cost in USD
 *
 * @example
 * estimatePineconeCost(5) // $0.00275 (5 queries * 100 equiv * $0.005/10k * 1.10)
 */
export function estimatePineconeCost(queryCount: number = 1): number {
  return estimateDonationCost({ operationCount: queryCount })
}

/**
 * Helper: Calculate cost for email send (operation-based)
 *
 * @param emailCount - Number of emails sent
 * @returns Estimated cost in USD
 *
 * @example
 * estimateEmailCost(1) // $0.00055 (1 email * 100 equiv * $0.005/10k * 1.10)
 */
export function estimateEmailCost(emailCount: number = 1): number {
  return estimateDonationCost({ operationCount: emailCount })
}

/**
 * Helper: Calculate cost for Supabase operation (operation-based)
 *
 * @param operationCount - Number of DB operations
 * @returns Estimated cost in USD
 *
 * @example
 * estimateSupabaseCost(10) // $0.0055 (10 ops * 100 equiv * $0.005/10k * 1.10)
 */
export function estimateSupabaseCost(operationCount: number = 1): number {
  return estimateDonationCost({ operationCount })
}

// ============================================================================
// Environment Validation (for debugging)
// ============================================================================

/**
 * Log current pricing configuration (useful for debugging env overrides)
 * Call this in app initialization to verify pricing constants
 *
 * @example
 * logPricingConfig()
 * // Console output:
 * // [donation-calculator] Pricing configuration:
 * //   - LLM rate: $0.005 per 10k tokens
 * //   - Operation equiv: 100 tokens
 * //   - Infrastructure overhead: 1.10x (10%)
 */
export function logPricingConfig(): void {
  console.log('[donation-calculator] Pricing configuration:')
  console.log(`  - LLM rate: $${PRICING.llm_per_10k_tokens} per 10k tokens`)
  console.log(`  - Operation equiv: ${PRICING.op_equiv_tokens} tokens`)
  console.log(`  - Infrastructure overhead: ${PRICING.infrastructure_overhead}x (${((PRICING.infrastructure_overhead - 1) * 100).toFixed(0)}%)`)
}
