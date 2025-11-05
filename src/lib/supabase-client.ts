/**
 * Client-Side Supabase Configuration
 *
 * This file provides the browser-side Supabase client with proper session persistence.
 * Unlike the server-side client in supabase.ts (which has persistSession: false),
 * this client enables session persistence and automatic token refresh for the browser.
 */

'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

/**
 * Creates or returns a singleton Supabase browser client
 *
 * Features:
 * - Session persistence in cookies (1 year expiration)
 * - Automatic token refresh before JWT expiry
 * - OAuth callback detection
 */
export function createClient() {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }

  // Create new browser client with persistent session
  supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // ✅ CRITICAL: Enable session persistence in browser cookies
        persistSession: true,

        // ✅ CRITICAL: Auto-refresh JWT before 1-hour expiry
        autoRefreshToken: true,

        // ✅ Enable OAuth callback detection (for future OAuth support)
        detectSessionInUrl: true,

        // Set storage to cookie-based (default for @supabase/ssr)
        storage: undefined, // Uses default cookie storage

        // Flow type for PKCE (more secure than implicit flow)
        flowType: 'pkce'
      },
      cookieOptions: {
        // ✅ Long session duration (1 year = 31,536,000 seconds)
        maxAge: 60 * 60 * 24 * 365,

        // ✅ SameSite=Lax prevents CSRF on navigation
        sameSite: 'lax',

        // ✅ Secure only in production (HTTPS required)
        secure: process.env.NODE_ENV === 'production',

        // ✅ Path applies to entire app
        path: '/',

        // Domain not set (defaults to current domain)
        domain: undefined
      }
    }
  )

  return supabaseClient
}

/**
 * Hook for React components to access Supabase client
 *
 * Example usage:
 * ```tsx
 * 'use client'
 * import { useSupabase } from '@/lib/supabase-client'
 *
 * function MyComponent() {
 *   const supabase = useSupabase()
 *   // Use supabase.auth.getUser(), etc.
 * }
 * ```
 */
export function useSupabase() {
  return createClient()
}
