import { createClient, SupabaseClient } from '@supabase/supabase-js'

// =================================================================
// SERVERLESS-OPTIMIZED SUPABASE CLIENTS
// =================================================================
// Supabase JS client automatically uses connection pooling via PostgREST
// No need for manual connection pool management in serverless environments
// Vercel functions are stateless - each request gets a fresh container

// Shared configuration for optimal serverless performance
const createSupabaseConfig = (appName: string) => ({
  db: {
    schema: 'public' as const,
  },
  auth: {
    persistSession: false, // Serverless doesn't persist sessions
    autoRefreshToken: false, // Not needed for API-only clients
    detectSessionInUrl: false, // Server-side only
  },
  global: {
    headers: {
      'x-application-name': appName,
    },
    // Enable HTTP keep-alive for connection reuse within same container
    fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
      return fetch(url, {
        ...options,
        keepalive: true,
      })
    }
  }
})

// Client-side Supabase client (anon key)
let _supabase: SupabaseClient | null = null
function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      createSupabaseConfig('PatmosLLM')
    )
  }
  return _supabase
}

// Admin Supabase client (service role key)
let _supabaseAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      createSupabaseConfig('PatmosLLM-Admin')
    )
  }
  return _supabaseAdmin
}

// Export clients
export const supabase = getSupabaseClient()
export const supabaseAdmin = getSupabaseAdmin()

// =================================================================
// CONVENIENCE WRAPPERS FOR CLEANER CODE
// =================================================================

/**
 * Execute operation with regular Supabase client
 * Useful for wrapping queries in try-catch with proper typing
 */
export const withSupabase = async <T>(
  operation: (client: SupabaseClient) => Promise<T>
): Promise<T> => {
  return operation(supabase)
}

/**
 * Execute operation with admin Supabase client
 * Useful for server-side operations requiring elevated permissions
 */
export const withSupabaseAdmin = async <T>(
  operation: (client: SupabaseClient) => Promise<T>
): Promise<T> => {
  return operation(supabaseAdmin)
}

// =================================================================
// OPTIMIZED DATABASE QUERIES - High-performance versions of common operations
// =================================================================

/**
 * Optimized session validation - frequently called in chat API
 * Uses the new composite index: idx_chat_sessions_id_user
 */
export async function validateChatSession(sessionId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .limit(1)
    .single()

  return !error && data !== null
}

/**
 * Optimized conversation history fetching - with limited fields for performance
 * Uses the new composite index: idx_conversations_session_user_created
 */
export async function fetchConversationHistory(
  sessionId: string,
  userId: string,
  limit: number = 10
): Promise<Array<{question: string; answer: string}> | null> {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('question, answer')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return null
  return data
}

/**
 * Optimized conversation insertion - returns only ID for performance
 */
export async function insertConversation(data: {
  user_id: string
  session_id: string
  question: string
  answer: string
  sources: Array<{title: string; author?: string; chunk_id: string}>
}): Promise<string | null> {
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .insert(data)
    .select('id')
    .single()

  if (error || !conversation) return null
  return conversation.id
}

/**
 * Optimized session timestamp update - minimal data transfer
 */
export async function updateSessionTimestamp(sessionId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  return !error
}