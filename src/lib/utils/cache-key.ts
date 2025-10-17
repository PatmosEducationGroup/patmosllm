/**
 * Cache Key Generation with xxHash64
 *
 * Stable, fast cache key generation for hybrid search with:
 * - Query normalization (Unicode NFKC, whitespace collapse, lowercase)
 * - xxHash64 for speed (10-100x faster than SHA256)
 * - Versioning for cache invalidation
 * - All search parameters included
 */

import { normalizeQuery } from './performance'
import { createHash } from 'crypto'

// Version constants for cache invalidation
const CACHE_VERSION = {
  promptV: '2.1',
  model: 'gpt-4o-mini',
  embedV: 'voyage-3-large',
  indexV: 'patmosllm-v1',
  searchV: '1.2'
}

interface SearchCacheParams {
  semanticWeight: number
  keywordWeight: number
  minSemanticScore: number
  minKeywordScore: number
  maxResults: number
  userId?: string
}

/**
 * Generate stable cache key with xxHash64
 * Falls back to SHA256 if xxHash fails to initialize
 */
export async function generateCacheKey(
  query: string,
  params: SearchCacheParams
): Promise<string> {
  // Normalize query for stability
  const normalizedQuery = normalizeQuery(query)

  // Build deterministic string with all versioning params
  // Sort object keys for stable stringification
  const keyParts = [
    `q:${normalizedQuery}`,
    `sem:${params.semanticWeight}`,
    `kw:${params.keywordWeight}`,
    `minsem:${params.minSemanticScore}`,
    `minkw:${params.minKeywordScore}`,
    `max:${params.maxResults}`,
    `user:${params.userId || 'anon'}`,
    `pv:${CACHE_VERSION.promptV}`,
    `m:${CACHE_VERSION.model}`,
    `ev:${CACHE_VERSION.embedV}`,
    `iv:${CACHE_VERSION.indexV}`,
    `sv:${CACHE_VERSION.searchV}`
  ]

  const keyString = keyParts.join('|')

  try {
    // Try xxHash64 (10-100x faster than SHA256)
    const xxhash = await import('xxhash-wasm')
    const hasher = await xxhash.default()
    const hash = hasher.h64ToString(keyString)
    return `search:${hash}`
  } catch (_error) {
    // Fallback to SHA256 if xxHash fails
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha256').update(keyString).digest('hex').substring(0, 16)
    return `search:${hash}`
  }
}

/**
 * Synchronous version using SHA256 only
 * Use this if you need immediate cache key without async/await
 */
export function generateCacheKeySync(
  query: string,
  params: SearchCacheParams
): string {
  const normalizedQuery = normalizeQuery(query)

  const keyParts = [
    `q:${normalizedQuery}`,
    `sem:${params.semanticWeight}`,
    `kw:${params.keywordWeight}`,
    `minsem:${params.minSemanticScore}`,
    `minkw:${params.minKeywordScore}`,
    `max:${params.maxResults}`,
    `user:${params.userId || 'anon'}`,
    `pv:${CACHE_VERSION.promptV}`,
    `m:${CACHE_VERSION.model}`,
    `ev:${CACHE_VERSION.embedV}`,
    `iv:${CACHE_VERSION.indexV}`,
    `sv:${CACHE_VERSION.searchV}`
  ]

  const keyString = keyParts.join('|')

  // SHA256 hash (Node.js crypto, works in serverless)
  const hash = createHash('sha256').update(keyString).digest('hex').substring(0, 16)
  return `search:${hash}`
}
