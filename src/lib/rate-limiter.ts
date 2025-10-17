// lib/rate-limiter.ts

/**
 * Rate Limiter with Upstash Redis for serverless environments
 *
 * Uses Upstash Redis for distributed rate limiting across serverless function instances.
 * Falls back to in-memory storage for local development if Upstash is not configured.
 *
 * Supports role-based tiered limits:
 * - Regular users: Base limit (1x)
 * - CONTRIBUTOR: 5x base limit
 * - ADMIN: 50x base limit
 * - SUPER_ADMIN: 100x base limit
 *
 * Environment Variables Required:
 * - UPSTASH_REDIS_REST_URL: Your Upstash Redis REST URL
 * - UPSTASH_REDIS_REST_TOKEN: Your Upstash Redis REST token
 * - RATE_LIMIT_EXEMPT_USERS: Comma-separated list of user IDs exempt from rate limiting
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// In-memory fallback for development
const rateLimitMap = new Map<string, number[]>()

// User roles (matching your database schema)
type UserRole = 'USER' | 'CONTRIBUTOR' | 'ADMIN' | 'SUPER_ADMIN'

// Role-based rate limit multipliers
const ROLE_MULTIPLIERS: Record<UserRole, number> = {
  USER: 1,           // Base rate limit
  CONTRIBUTOR: 5,    // 5x higher limits
  ADMIN: 50,         // 50x higher limits
  SUPER_ADMIN: 100   // 100x higher limits (effectively unlimited for most use cases)
}

interface RateLimitOptions {
  windowMs?: number
  max?: number
  message?: string
  exemptUsers?: string[]
}

interface RateLimitResult {
  success: boolean
  remaining: number
  message?: string
  resetTime?: string
}

/**
 * Get exempt users from environment variable
 * Format: RATE_LIMIT_EXEMPT_USERS=userId1,userId2,userId3
 */
function getExemptUsersFromEnv(): string[] {
  const envValue = process.env.RATE_LIMIT_EXEMPT_USERS
  if (!envValue) return []

  return envValue
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
}

/**
 * Check if Upstash Redis is configured
 */
function isUpstashConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  )
}

/**
 * Create a Redis client for Upstash
 */
let redisClient: Redis | null = null
function getRedisClient(): Redis | null {
  if (!isUpstashConfigured()) return null

  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    })
  }

  return redisClient
}

/**
 * Cache of Upstash Ratelimit instances per role tier
 * Key format: `${windowMs}:${max}:${role}`
 */
const upstashLimiterCache = new Map<string, Ratelimit>()

/**
 * Create an Upstash Ratelimit instance (with caching for role tiers)
 */
function createUpstashRateLimit(windowMs: number, max: number, role: UserRole = 'USER') {
  const redis = getRedisClient()
  if (!redis) return null

  // Apply role multiplier
  const adjustedMax = max * ROLE_MULTIPLIERS[role]

  // Check cache first
  const cacheKey = `${windowMs}:${max}:${role}`
  const cached = upstashLimiterCache.get(cacheKey)
  if (cached) return cached

  // Convert windowMs to seconds for Upstash
  const windowSeconds = Math.ceil(windowMs / 1000)

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(adjustedMax, `${windowSeconds} s`),
    analytics: true,
    prefix: `ratelimit:${role.toLowerCase()}`
  })

  // Cache for future use
  upstashLimiterCache.set(cacheKey, limiter)

  return limiter
}

/**
 * In-memory rate limiting fallback (for development)
 */
function inMemoryRateLimit(
  identifier: string,
  windowMs: number,
  max: number,
  message: string,
  role: UserRole = 'USER'
): RateLimitResult {
  const now = Date.now()
  const windowStart = now - windowMs

  // Apply role multiplier
  const adjustedMax = max * ROLE_MULTIPLIERS[role]

  // Get existing requests for this identifier
  let requests = rateLimitMap.get(identifier) || []

  // Remove old requests outside the current window
  requests = requests.filter(timestamp => timestamp > windowStart)

  // Check if we've exceeded the limit
  if (requests.length >= adjustedMax) {
    const oldestRequest = requests[0]
    const resetTime = new Date(oldestRequest + windowMs)

    return {
      success: false,
      message,
      resetTime: resetTime.toISOString(),
      remaining: 0
    }
  }

  // Add the current request
  requests.push(now)
  rateLimitMap.set(identifier, requests)

  return {
    success: true,
    remaining: adjustedMax - requests.length
  }
}

/**
 * Create a rate limiter with Upstash Redis (or in-memory fallback)
 * Supports role-based tiered limits
 */
export function createRateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later.',
    exemptUsers = []
  } = options

  // Merge provided exempt users with environment variable users
  const allExemptUsers = [...exemptUsers, ...getExemptUsersFromEnv()]

  const usingUpstash = isUpstashConfigured()

  if (!usingUpstash) {
    console.warn(
      '[RATE LIMITER] Upstash Redis not configured. Using in-memory fallback. ' +
      'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production.'
    )
  }

  return async function rateLimit(identifier: string, role: UserRole = 'USER'): Promise<RateLimitResult> {
    // Check if user is exempt from rate limiting
    if (allExemptUsers.includes(identifier)) {
      return {
        success: true,
        remaining: max * ROLE_MULTIPLIERS[role]
      }
    }

    // Use Upstash if available
    if (usingUpstash) {
      try {
        // Get or create limiter for this role tier
        const limiter = createUpstashRateLimit(windowMs, max, role)
        if (limiter) {
          const { success, remaining, reset } = await limiter.limit(identifier)

          if (!success) {
            return {
              success: false,
              message,
              resetTime: new Date(reset).toISOString(),
              remaining: 0
            }
          }

          return {
            success: true,
            remaining
          }
        }
      } catch (error) {
        console.error('[RATE LIMITER] Upstash error, falling back to in-memory:', error)
        // Fall through to in-memory on error
      }
    }

    // Fall back to in-memory rate limiting
    return inMemoryRateLimit(identifier, windowMs, max, message, role)
  }
}

// Create specific rate limiters for different actions
export const chatRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 chat messages per 5 minutes
  message: 'Too many chat requests. Please wait a few minutes before asking another question.'
})

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 uploads per hour
  message: 'Upload limit exceeded. You can upload up to 100 files per hour.'
})

export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests. Please slow down.'
})

export const exportRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1, // 1 export per hour (GDPR compliance)
  message: 'You can only request a data export once per hour.'
})
