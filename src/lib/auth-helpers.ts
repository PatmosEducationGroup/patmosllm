/**
 * Auth Helpers - Dual auth support (Clerk + Supabase)
 *
 * Provides utilities to get user information from either Clerk or Supabase Auth
 */

import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

/**
 * Get authenticated user ID from either Clerk or Supabase
 *
 * Priority: Supabase (migrated users) → Clerk (unmigrated users)
 *
 * @returns User ID string or null if not authenticated
 */
export async function getAuthUserId(): Promise<string | null> {
  // Check Supabase first (migrated users)
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

  if (supabaseUser) {
    return supabaseUser.id
  }

  // Fall back to Clerk (unmigrated users)
  const { userId: clerkUserId } = await auth()
  return clerkUserId
}

/**
 * Get user email from either Clerk or Supabase
 *
 * @returns User email string or null if not authenticated
 */
export async function getAuthUserEmail(): Promise<string | null> {
  // Check Supabase first
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

  if (supabaseUser?.email) {
    return supabaseUser.email
  }

  // Fall back to Clerk
  const { userId: clerkUserId } = await auth()
  if (clerkUserId) {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)
    return clerkUser.primaryEmailAddress?.emailAddress || null
  }

  return null
}

/**
 * Get user info from either Clerk or Supabase
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
