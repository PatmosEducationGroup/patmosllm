// lib/rate-limiter.js

// Store rate limit data in memory (for development)
// In production, you'd want to use Redis for this
const rateLimitMap = new Map();

export function createRateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later.',
    exemptUsers = [] // Array of exempt user identifiers
  } = options;

  return function rateLimit(identifier) {
    // Check if user is exempt from rate limiting
    if (exemptUsers.includes(identifier)) {
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
  max: 20, // 20 uploads per hour
  message: 'Upload limit exceeded. You can upload up to 20 files per hour.',
  exemptUsers: ['user_31cRURPn0EXFUf1JwtWzN5S7rKG'] // Your specific user ID
});

export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests. Please slow down.'
});