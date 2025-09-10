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
      maxConnections: 20, // Optimize for concurrent users
      activeConnections: 0,
      connectionQueue: [],
      lastCleanup: Date.now()
    }
    
    // Cleanup idle connections every 5 minutes
    setInterval(() => this.cleanupConnections(), 5 * 60 * 1000)
  }

  public static getInstance(): SupabaseManager {
    if (!SupabaseManager.instance) {
      SupabaseManager.instance = new SupabaseManager()
    }
    return SupabaseManager.instance
  }

  private cleanupConnections(): void {
    const now = Date.now()
    if (now - this.connectionPool.lastCleanup > 5 * 60 * 1000) {
      // Reset connection count periodically to prevent leaks
      this.connectionPool.activeConnections = Math.max(0, this.connectionPool.activeConnections - 1)
      this.connectionPool.lastCleanup = now
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
              eventsPerSecond: 10 // Optimize for performance
            }
          },
          db: {
            schema: 'public',
          },
          auth: {
            persistSession: true,
            storageKey: 'supabase.auth.token',
          },
          global: {
            headers: {
              'x-application-name': 'PatmosLLM'
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
          global: {
            headers: {
              'x-application-name': 'PatmosLLM-Admin'
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

export default supabaseManager