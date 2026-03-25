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
    } = supabase.auth.onAuthStateChange(async (event) => {
      // Handle different auth events
      switch (event) {
        case 'TOKEN_REFRESHED':
          // Refresh server components to update with new token
          router.refresh()
          break

        case 'SIGNED_OUT':
          // Redirect to login page
          router.push('/login')
          break

        case 'SIGNED_IN':
          // Refresh server components to update auth state
          router.refresh()
          break

        case 'USER_UPDATED':
          router.refresh()
          break

        case 'PASSWORD_RECOVERY':
          break

        default:
          break
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
