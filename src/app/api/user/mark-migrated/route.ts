/**
 * API Route: Mark User as Migrated
 *
 * Updates the user_migration table to mark a user as successfully migrated
 * Called after user sets their new Supabase password
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { loggers, logError } from '@/lib/logger'

export async function POST() {
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
          set() {},
          remove() {}
        }
      }
    )

    // Get current Supabase Auth user
    const {
      data: { user: authUser },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const email = authUser.email?.toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    // Mark as migrated in user_migration table
    const { error: migrationError } = await supabaseAdmin
      .from('user_migration')
      .update({
        migrated: true,
        migrated_at: new Date().toISOString()
      })
      .eq('supabase_id', authUser.id)

    if (migrationError) {
      logError(new Error('Failed to mark user as migrated'), {
        operation: 'markUserMigrated',
        phase: 'migration_update',
        severity: 'high',
        email,
        supabase_id: authUser.id,
        errorContext: 'Failed to update user_migration table',
        error: migrationError
      })
      return NextResponse.json({ error: 'Failed to update migration status' }, { status: 500 })
    }

    // Update users table with auth_user_id
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        auth_user_id: authUser.id,
        updated_at: new Date().toISOString()
      })
      .eq('email', email)

    if (userUpdateError) {
      logError(new Error('Failed to link auth_user_id in users table'), {
        operation: 'markUserMigrated',
        phase: 'users_table_update',
        severity: 'high',
        email,
        supabase_id: authUser.id,
        errorContext: 'Failed to update users table with auth_user_id',
        error: userUpdateError
      })
    }

    // Log successful migration
    await supabaseAdmin
      .from('migration_log')
      .insert({
        email,
        clerk_user_id: authUser.user_metadata?.clerk_id || 'unknown',
        supabase_user_id: authUser.id
      })
       // Don't fail if logging fails

    loggers.auth(
      { email, supabase_id: authUser.id, phase: 'migration_complete' },
      'User marked as migrated after password reset'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unexpected error'), {
      operation: 'markUserMigrated',
      phase: 'unexpected_error',
      severity: 'critical',
      errorContext: 'Unexpected error marking user as migrated'
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
