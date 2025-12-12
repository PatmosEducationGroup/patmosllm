import { supabaseAdmin } from './supabase'
import { User } from './types'
import { logError, loggers } from './logger'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Get current user from database (server-side)
// Uses Supabase Auth only
export async function getCurrentUser(): Promise<User | null> {
  try {
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

    if (!authUser || authError) {
      return null
    }

    // User has Supabase session - use auth_user_id
    // Allow users with scheduled deletion (deleted_at set) to log in to cancel
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .single()

    if (error || !user) {
      return null
    }

    loggers.auth({ userId: user.id, source: 'supabase', auth_user_id: authUser.id, has_deletion: !!user.deleted_at }, 'User authenticated via Supabase')
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
  return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
}

// Check if user can upload (SUPER_ADMIN, ADMIN, or CONTRIBUTOR)
export async function canUpload(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'CONTRIBUTOR'
}
