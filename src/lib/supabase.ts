import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton pattern for database connections to handle 500+ concurrent users
class SupabaseManager {
  private static instance: SupabaseManager
  private _supabase: SupabaseClient | null = null
  private _supabaseAdmin: SupabaseClient | null = null
  private connectionPool: {
    maxConnections: number
    activeConnections: number
    connectionQueue: Array<() => void>
    lastCleanup: number
  }

  private constructor() {
    this.connectionPool = {
      maxConnections: 25, // Increased from 20 for better concurrency
      activeConnections: 0,
      connectionQueue: [],
      lastCleanup: Date.now()
    }

    // Cleanup idle connections every 3 minutes (was 5)
    setInterval(() => this.cleanupConnections(), 3 * 60 * 1000)
  }

  public static getInstance(): SupabaseManager {
    if (!SupabaseManager.instance) {
      SupabaseManager.instance = new SupabaseManager()
    }
    return SupabaseManager.instance
  }

  private cleanupConnections(): void {
    const now = Date.now()
    if (now - this.connectionPool.lastCleanup > 3 * 60 * 1000) { // Changed from 5 to 3 minutes
      // More aggressive cleanup for better performance
      this.connectionPool.activeConnections = Math.max(0, this.connectionPool.activeConnections - 2)
      this.connectionPool.lastCleanup = now

      // Clear stale queue items (older than 30 seconds)
      if (this.connectionPool.connectionQueue.length > 10) {
        this.connectionPool.connectionQueue.splice(0, 5)
        console.log('🧹 Database: Cleared stale connection queue items')
      }
    }
  }

  public get supabase(): SupabaseClient {
    if (!this._supabase) {
      this._supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          realtime: {
            params: {
              eventsPerSecond: 15 // Increased from 10
            }
          },
          db: {
            schema: 'public',
          },
          auth: {
            persistSession: true,
            storageKey: 'supabase.auth.token',
            autoRefreshToken: true,
            detectSessionInUrl: false // Slight performance improvement
          },
          global: {
            headers: {
              'x-application-name': 'PatmosLLM',
              'Connection': 'keep-alive'
            }
          }
        }
      )
    }
    return this._supabase
  }

  public get supabaseAdmin(): SupabaseClient {
    if (!this._supabaseAdmin) {
      this._supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          },
          db: {
            schema: 'public',
          },
          realtime: {
            params: {
              eventsPerSecond: 20 // Higher for admin operations
            }
          },
          global: {
            headers: {
              'x-application-name': 'PatmosLLM-Admin',
              'Connection': 'keep-alive',
              'Cache-Control': 'max-age=60'
            }
          }
        }
      )
    }
    return this._supabaseAdmin
  }

  // Connection pool management for high-concurrency scenarios
  public async withConnection<T>(operation: (client: SupabaseClient) => Promise<T>, useAdmin = false): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const executeOperation = async () => {
        try {
          this.connectionPool.activeConnections++
          const client = useAdmin ? this.supabaseAdmin : this.supabase
          const result = await operation(client)
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.connectionPool.activeConnections--
          
          // Process queue if connections available
          if (this.connectionPool.connectionQueue.length > 0 && 
              this.connectionPool.activeConnections < this.connectionPool.maxConnections) {
            const nextOperation = this.connectionPool.connectionQueue.shift()
            if (nextOperation) nextOperation()
          }
        }
      }

      // If under connection limit, execute immediately
      if (this.connectionPool.activeConnections < this.connectionPool.maxConnections) {
        executeOperation()
      } else {
        // Queue the operation
        this.connectionPool.connectionQueue.push(executeOperation)
      }
    })
  }

  // Health check for monitoring
  public getConnectionHealth() {
    return {
      activeConnections: this.connectionPool.activeConnections,
      maxConnections: this.connectionPool.maxConnections,
      queueLength: this.connectionPool.connectionQueue.length,
      lastCleanup: this.connectionPool.lastCleanup,
      utilization: (this.connectionPool.activeConnections / this.connectionPool.maxConnections) * 100
    }
  }

  // Optimized query helper with built-in connection management
  public async executeOptimizedQuery<T>(
    query: (client: SupabaseClient) => Promise<{ data: T[] | null; error: any }>,
    useAdmin = false,
    cacheKey?: string
  ): Promise<T[] | null> {
    return this.withConnection(async (client) => {
      const { data, error } = await query(client)

      if (error) {
        console.error('Database query error:', error)
        return null
      }

      return data
    }, useAdmin)
  }
}

// Export singleton instances
const supabaseManager = SupabaseManager.getInstance()

// Legacy exports for backward compatibility
export const supabase = supabaseManager.supabase
export const supabaseAdmin = supabaseManager.supabaseAdmin

// New optimized exports
export const withSupabase = <T>(operation: (client: SupabaseClient) => Promise<T>) => 
  supabaseManager.withConnection(operation, false)

export const withSupabaseAdmin = <T>(operation: (client: SupabaseClient) => Promise<T>) => 
  supabaseManager.withConnection(operation, true)

export const getSupabaseHealth = () => supabaseManager.getConnectionHealth()

// =================================================================
// OPTIMIZED DATABASE QUERIES - High-performance versions of common operations
// =================================================================

/**
 * Optimized session validation - frequently called in chat API
 */
export async function validateChatSession(sessionId: string, userId: string): Promise<boolean> {
  return supabaseManager.executeOptimizedQuery<{id: string}>(
    (client) => client
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .limit(1),
    true // Use admin client for speed
  ).then(data => data !== null && data.length > 0)
}

/**
 * Optimized conversation history fetching - with limited fields for performance
 */
export async function fetchConversationHistory(sessionId: string, userId: string, limit: number = 10): Promise<Array<{question: string; answer: string}> | null> {
  return supabaseManager.executeOptimizedQuery<{question: string; answer: string}>(
    (client) => client
      .from('conversations')
      .select('question, answer')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    true
  )
}

/**
 * Optimized conversation insertion - returns only ID for performance
 */
export async function insertConversation(data: {
  user_id: string
  session_id: string
  question: string
  answer: string
  sources: any
}): Promise<string | null> {
  const result = await supabaseManager.executeOptimizedQuery<{id: string}>(
    (client) => client
      .from('conversations')
      .insert(data)
      .select('id')
      .single(),
    true
  )
  return result?.[0]?.id || null
}

/**
 * Optimized session timestamp update - minimal data transfer
 */
export async function updateSessionTimestamp(sessionId: string): Promise<boolean> {
  return supabaseManager.executeOptimizedQuery<any>(
    (client) => client
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId),
    true
  ).then(data => data !== null)
}

export default supabaseManager