import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from './supabase'
import { User } from './types'
import { logError, loggers } from './logger'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Get current user from database (server-side)
// PHASE 3: Dual-read pattern - checks Supabase Auth first, falls back to Clerk
export async function getCurrentUser(): Promise<User | null> {
  try {
    // STEP 1: Check for Supabase session (migrated users)
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {}, // Read-only in server components
          remove() {}
        }
      }
    )

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authUser && !authError) {
      // User has Supabase session - use auth_user_id
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .is('deleted_at', null)
        .single()

      if (!error && user) {
        loggers.auth({ userId: user.id, source: 'supabase', auth_user_id: authUser.id }, 'User authenticated via Supabase')
        return user
      }
    }

    // STEP 2: Fall back to Clerk (unmigrated users)
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return null
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clerk_id', clerkUserId)
      .is('deleted_at', null)
      .single()

    if (error || !user) {
      return null
    }

    loggers.auth({ userId: user.id, source: 'clerk', clerk_id: clerkUserId }, 'User authenticated via Clerk (not yet migrated)')
    return user
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to get current user'), {
      operation: 'getCurrentUser',
      phase: 'user_retrieval',
      severity: 'high',
      userId: 'unknown',
      errorContext: 'Failed to fetch user from database after auth check'
    })
    return null
  }
}

// Check if user has admin privileges
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'ADMIN'
}

// Check if user can upload (SUPER_ADMIN, ADMIN, or CONTRIBUTOR)
export async function canUpload(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'CONTRIBUTOR'
}

// Sync Clerk user with our database
export async function syncUserWithDatabase(clerkUser: {
  id: string
  emailAddresses: Array<{ emailAddress: string }>
  firstName?: string | null
  lastName?: string | null
}): Promise<User | null> {
  try {
    const email = clerkUser.emailAddresses[0]?.emailAddress
    const name = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(' ') || undefined

    // Check if user already exists by clerk_id
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clerk_id', clerkUser.id)
      .single()

    if (existingUser) {
      // Update existing user
      const { data: updatedUser, error } = await supabaseAdmin
        .from('users')
        .update({
          email,
          name,
          updated_at: new Date().toISOString()
        })
        .eq('clerk_id', clerkUser.id)
        .select()
        .single()

      if (error) throw error
      return updatedUser
    } else {
      // Check if user was pre-invited by email
      const { data: invitedUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email?.toLowerCase())
        .single()

      if (invitedUser && invitedUser.clerk_id.startsWith('invited_')) {
        // Update invited user with real Clerk ID
        const { data: activatedUser, error } = await supabaseAdmin
          .from('users')
          .update({
            clerk_id: clerkUser.id,
            name: name || invitedUser.name,
            updated_at: new Date().toISOString()
          })
          .eq('id', invitedUser.id)
          .select()
          .single()

        if (error) throw error
        loggers.auth({ email, userId: clerkUser.id, activated: true }, 'Activated invited user')
        return activatedUser
      }

      // Check if this is the first user (bootstrap case)
      const { count } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })

      if (count === 0) {
        // First user becomes admin
        const { data: newUser, error } = await supabaseAdmin
          .from('users')
          .insert({
            clerk_id: clerkUser.id,
            email,
            name,
            role: 'ADMIN'
          })
          .select()
          .single()

        if (error) throw error
        return newUser
      }

      // User not invited - reject
      loggers.auth({ email, userId: clerkUser.id, rejected: true, reason: 'not_invited' }, 'Rejected non-invited user')
      return null
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to sync user with database'), {
      operation: 'syncUserWithDatabase',
      phase: 'user_sync',
      severity: 'critical',
      clerkUserId: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress,
      errorContext: 'Failed to sync Clerk user with Supabase database - user may be unable to access system'
    })
    return null
  }
}