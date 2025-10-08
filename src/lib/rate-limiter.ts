// lib/rate-limiter.ts

/**
 * Rate Limiter with in-memory storage
 *
 * WARNING: This uses in-memory Map() which doesn't work properly in serverless
 * environments where each invocation may get a different instance.
 *
 * TODO: Migrate to Upstash Redis or Vercel KV for production use
 * See: https://vercel.com/docs/storage/vercel-kv
 */

// Store rate limit data in memory (for development)
// In production, you'd want to use Redis for this
const rateLimitMap = new Map<string, number[]>();

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  exemptUsers?: string[];
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  message?: string;
  resetTime?: string;
}

/**
 * Get exempt users from environment variable
 * Format: RATE_LIMIT_EXEMPT_USERS=userId1,userId2,userId3
 */
function getExemptUsersFromEnv(): string[] {
  const envValue = process.env.RATE_LIMIT_EXEMPT_USERS;
  if (!envValue) return [];

  return envValue
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

export function createRateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later.',
    exemptUsers = [] // Array of exempt user identifiers
  } = options;

  // Merge provided exempt users with environment variable users
  const allExemptUsers = [...exemptUsers, ...getExemptUsersFromEnv()];

  return function rateLimit(identifier: string): RateLimitResult {
    // Check if user is exempt from rate limiting
    if (allExemptUsers.includes(identifier)) {
      return {
        success: true,
        remaining: max // Show full limit for exempt users
      };
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing requests for this identifier (IP address or user ID)
    let requests = rateLimitMap.get(identifier) || [];

    // Remove old requests outside the current window
    requests = requests.filter(timestamp => timestamp > windowStart);

    // Check if we've exceeded the limit
    if (requests.length >= max) {
      // Calculate when the limit will reset
      const oldestRequest = requests[0];
      const resetTime = new Date(oldestRequest + windowMs);

      return {
        success: false,
        message,
        resetTime: resetTime.toISOString(),
        remaining: 0
      };
    }

    // Add the current request
    requests.push(now);
    rateLimitMap.set(identifier, requests);

    return {
      success: true,
      remaining: max - requests.length
    };
  };
}

// Create specific rate limiters for different actions
export const chatRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 chat messages per 5 minutes
  message: 'Too many chat requests. Please wait a few minutes before asking another question.'
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 uploads per hour for bulk uploads
  message: 'Upload limit exceeded. You can upload up to 100 files per hour.'
  // SECURITY FIX: Removed hardcoded user IDs - now loaded from RATE_LIMIT_EXEMPT_USERS env var
});

export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests. Please slow down.'
});
