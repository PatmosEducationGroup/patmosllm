import crypto from 'crypto'

interface CachedResponse {
  answer: string
  sources: any[]
  timestamp: number
  questionHash: string
}

// In-memory cache - in production you might want Redis
const responseCache = new Map<string, CachedResponse>()

// Cache TTL: 1 hour
const CACHE_TTL = 60 * 60 * 1000 

export function hashQuestion(question: string): string {
  // Normalize the question for better cache hits
  const normalized = question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
  
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16)
}

export function getCachedResponse(questionHash: string): CachedResponse | null {
  const cached = responseCache.get(questionHash)
  
  if (!cached) {
    return null
  }
  
  // Check if cache is expired
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    responseCache.delete(questionHash)
    return null
  }
  
  return cached
}

export function setCachedResponse(
  questionHash: string, 
  answer: string, 
  sources: any[]
): void {
  responseCache.set(questionHash, {
    answer,
    sources,
    timestamp: Date.now(),
    questionHash
  })
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: responseCache.size,
    keys: Array.from(responseCache.keys())
  }
}

export function clearExpiredCache(): number {
  const now = Date.now()
  let cleared = 0
  
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      responseCache.delete(key)
      cleared++
    }
  }
  
  return cleared

}

