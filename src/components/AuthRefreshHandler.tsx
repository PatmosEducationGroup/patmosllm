/**
 * Auth Refresh Handler Component
 *
 * Monitors authentication state changes and handles token refresh events.
 * This ensures users stay logged in across browser sessions by:
 * - Listening for TOKEN_REFRESHED events
 * - Handling automatic token refresh failures
 * - Redirecting on logout events
 * - Refreshing server components when auth state changes
 */

'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export function AuthRefreshHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Listen for auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const timestamp = new Date().toISOString()

      // Log auth events for debugging (will be removed in production by next.config.ts)
      console.log(`[Auth Event ${timestamp}]`, event, session?.user?.email)

      // Handle different auth events
      switch (event) {
        case 'TOKEN_REFRESHED':
          console.log(
            '[Auth] Token refreshed successfully. New expiry:',
            session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'unknown'
          )
          // Refresh server components to update with new token
          router.refresh()
          break

        case 'SIGNED_OUT':
          console.log('[Auth] User signed out')
          // Redirect to login page
          router.push('/login')
          break

        case 'SIGNED_IN':
          console.log('[Auth] User signed in')
          // Refresh server components to update auth state
          router.refresh()
          break

        case 'USER_UPDATED':
          console.log('[Auth] User data updated')
          router.refresh()
          break

        case 'PASSWORD_RECOVERY':
          console.log('[Auth] Password recovery initiated')
          break

        default:
          console.log('[Auth] Unknown event:', event)
      }
    })

    // Set up periodic session check (backup for auto-refresh)
    // This ensures we detect session issues even if auto-refresh fails silently
    const intervalId = setInterval(async () => {
      const {
        data: { session },
        error
      } = await supabase.auth.getSession()

      if (error) {
        console.error('[Auth] Session check failed:', error.message)
      }

      if (!session) {
        console.warn('[Auth] No active session detected')
      } else {
        // Calculate time until expiry
        const expiresAt = new Date(session.expires_at! * 1000)
        const now = new Date()
        const minutesUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60)

        // Log warning if token is expiring soon (< 5 minutes)
        if (minutesUntilExpiry < 5 && minutesUntilExpiry > 0) {
          console.warn(`[Auth] Token expiring in ${minutesUntilExpiry} minutes`)
        }
      }
    }, 60000) // Check every minute

    // Cleanup subscriptions on unmount
    return () => {
      subscription.unsubscribe()
      clearInterval(intervalId)
    }
  }, [router, supabase])

  return <>{children}</>
}
