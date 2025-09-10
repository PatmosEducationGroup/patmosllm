// Advanced multi-layered caching system for PatmosLLM
// Implements in-memory + Redis-like caching patterns for optimal performance

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  accessCount: number
  lastAccessed: number
}

interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  totalEntries: number
  memoryUsage: number
  evictions: number
}

class AdvancedCache {
  private static instance: AdvancedCache
  private cache = new Map<string, CacheEntry<unknown>>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalEntries: 0,
    memoryUsage: 0,
    evictions: 0
  }
  
  // Cache configuration
  private config = {
    maxEntries: 1000,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    cleanupInterval: 2 * 60 * 1000, // 2 minutes
    maxMemoryMB: 50 // 50MB memory limit
  }

  private constructor() {
    // Automatic cleanup of expired entries
    setInterval(() => this.cleanup(), this.config.cleanupInterval)
  }

  public static getInstance(): AdvancedCache {
    if (!AdvancedCache.instance) {
      AdvancedCache.instance = new AdvancedCache()
    }
    return AdvancedCache.instance
  }

  // Intelligent cache key generation
  private generateKey(namespace: string, key: string, params?: Record<string, unknown>): string {
    const paramHash = params ? JSON.stringify(params).replace(/[{}",\s]/g, '') : ''
    return `${namespace}:${key}:${paramHash}`
  }

  // Set cache entry with automatic TTL and LRU eviction
  public set<T>(namespace: string, key: string, data: T, ttl?: number, params?: Record<string, unknown>): void {
    const cacheKey = this.generateKey(namespace, key, params)
    const actualTTL = ttl || this.config.defaultTTL
    
    // Evict if cache is full
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU()
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: actualTTL,
      accessCount: 1,
      lastAccessed: Date.now()
    }

    this.cache.set(cacheKey, entry)
    this.updateStats()
  }

  // Get cache entry with automatic expiry check
  public get<T>(namespace: string, key: string, params?: Record<string, unknown>): T | null {
    const cacheKey = this.generateKey(namespace, key, params)
    const entry = this.cache.get(cacheKey)

    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey)
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Update access metrics
    entry.accessCount++
    entry.lastAccessed = Date.now()
    this.stats.hits++
    this.updateHitRate()

    return entry.data as T
  }

  // Check if key exists and is not expired
  public has(namespace: string, key: string, params?: Record<string, unknown>): boolean {
    return this.get(namespace, key, params) !== null
  }

  // Delete specific cache entry
  public delete(namespace: string, key: string, params?: Record<string, unknown>): boolean {
    const cacheKey = this.generateKey(namespace, key, params)
    return this.cache.delete(cacheKey)
  }

  // Clear entire namespace
  public clearNamespace(namespace: string): number {
    let cleared = 0
    for (const [key] of this.cache) {
      if (key.startsWith(`${namespace}:`)) {
        this.cache.delete(key)
        cleared++
      }
    }
    this.updateStats()
    return cleared
  }

  // Clear all cache
  public clear(): void {
    this.cache.clear()
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalEntries: 0,
      memoryUsage: 0,
      evictions: 0
    }
  }

  // LRU eviction strategy
  private evictLRU(): void {
    let oldestTime = Date.now()
    let oldestKey = ''

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++
    }
  }

  // Cleanup expired entries
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.updateStats()
      console.log(`Cache cleanup: removed ${cleaned} expired entries`)
    }
  }

  // Update cache statistics
  private updateStats(): void {
    this.stats.totalEntries = this.cache.size
    this.stats.memoryUsage = this.estimateMemoryUsage()
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
  }

  // Estimate memory usage (rough calculation)
  private estimateMemoryUsage(): number {
    let size = 0
    for (const [key, entry] of this.cache) {
      size += key.length * 2 // string is 2 bytes per char
      size += JSON.stringify(entry.data).length * 2
      size += 64 // entry metadata overhead
    }
    return size / (1024 * 1024) // Convert to MB
  }

  // Get cache statistics
  public getStats(): CacheStats {
    this.updateStats()
    return { ...this.stats }
  }

  // Cache wrapper for functions with automatic memoization
  public async memoize<T>(
    namespace: string,
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
    params?: Record<string, unknown>
  ): Promise<T> {
    const cached = this.get<T>(namespace, key, params)
    if (cached !== null) {
      return cached
    }

    const result = await fn()
    this.set(namespace, key, result, ttl, params)
    return result
  }

  // Batch operations for better performance
  public setBatch<T>(entries: Array<{
    namespace: string
    key: string
    data: T
    ttl?: number
    params?: Record<string, unknown>
  }>): void {
    entries.forEach(entry => {
      this.set(entry.namespace, entry.key, entry.data, entry.ttl, entry.params)
    })
  }

  public getBatch<T>(keys: Array<{
    namespace: string
    key: string
    params?: Record<string, unknown>
  }>): Array<{ key: string; data: T | null }> {
    return keys.map(item => ({
      key: `${item.namespace}:${item.key}`,
      data: this.get<T>(item.namespace, item.key, item.params)
    }))
  }
}

// Predefined cache namespaces for different data types
export const CACHE_NAMESPACES = {
  USER_SESSIONS: 'user_sessions',
  CHAT_HISTORY: 'chat_history', 
  DOCUMENTS: 'documents',
  SEARCH_RESULTS: 'search_results',
  EMBEDDINGS: 'embeddings',
  SYSTEM_HEALTH: 'system_health',
  ANALYTICS: 'analytics'
}

// Cache TTL presets (in milliseconds)
export const CACHE_TTL = {
  VERY_SHORT: 30 * 1000,      // 30 seconds
  SHORT: 5 * 60 * 1000,       // 5 minutes  
  MEDIUM: 30 * 60 * 1000,     // 30 minutes
  LONG: 2 * 60 * 60 * 1000,   // 2 hours
  VERY_LONG: 24 * 60 * 60 * 1000 // 24 hours
}

// Export singleton instance
export const advancedCache = AdvancedCache.getInstance()

// Helper functions for common caching patterns
export const cacheUserSession = (userId: string, sessionData: Record<string, unknown>) => {
  advancedCache.set(CACHE_NAMESPACES.USER_SESSIONS, userId, sessionData, CACHE_TTL.SHORT)
}

export const getCachedUserSession = (userId: string) => {
  return advancedCache.get(CACHE_NAMESPACES.USER_SESSIONS, userId)
}

export const cacheConversationHistory = (sessionId: string, conversations: Array<Record<string, unknown>>) => {
  advancedCache.set(CACHE_NAMESPACES.CHAT_HISTORY, sessionId, conversations, CACHE_TTL.MEDIUM)
}

export const getCachedConversationHistory = (sessionId: string) => {
  return advancedCache.get<Array<Record<string, unknown>>>(CACHE_NAMESPACES.CHAT_HISTORY, sessionId)
}

export const cacheSearchResults = (query: string, results: Array<Record<string, unknown>>, userId?: string) => {
  const params = userId ? { userId } : undefined
  advancedCache.set(CACHE_NAMESPACES.SEARCH_RESULTS, query, results, CACHE_TTL.SHORT, params)
}

export const getCachedSearchResults = (query: string, userId?: string) => {
  const params = userId ? { userId } : undefined  
  return advancedCache.get<Array<Record<string, unknown>>>(CACHE_NAMESPACES.SEARCH_RESULTS, query, params)
}

export default advancedCache