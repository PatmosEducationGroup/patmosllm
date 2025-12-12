/**
 * Auth Helpers - Supabase Auth only
 *
 * Provides utilities to get user information from Supabase Auth
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Get authenticated user ID from Supabase
 *
 * @returns User ID string or null if not authenticated
 */
export async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {}, // No-op for read-only operations
        remove() {} // No-op for read-only operations
      }
    }
  )

  const { data: { user: supabaseUser } } = await supabase.auth.getUser()

  return supabaseUser?.id || null
}

/**
 * Get user email from Supabase
 *
 * @returns User email string or null if not authenticated
 */
export async function getAuthUserEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {},
        remove() {}
      }
    }
  )

  const { data: { user: supabaseUser } } = await supabase.auth.getUser()

  return supabaseUser?.email || null
}

/**
 * Get user info from Supabase
 *
 * @returns Object with userId and email, or null if not authenticated
 */
export async function getAuthUser(): Promise<{ userId: string; email: string } | null> {
  const userId = await getAuthUserId()
  const email = await getAuthUserEmail()

  if (!userId || !email) {
    return null
  }

  return { userId, email }
}

/**
 * Require authentication - throws 401 if not authenticated
 * Use this at the start of protected API routes
 */
export async function requireAuth(): Promise<{ userId: string; email: string }> {
  const user = await getAuthUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}
