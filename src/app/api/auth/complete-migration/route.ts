/**
 * API Route: Complete Migration
 *
 * Called when user sets their new password after Clerk login
 * Updates Supabase Auth password and marks user as migrated
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loggers, logError } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { clerkUserId, password } = await request.json()

    if (!clerkUserId || !password) {
      return NextResponse.json(
        { error: 'Clerk user ID and password required' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain an uppercase letter' },
        { status: 400 }
      )
    }

    if (!/[a-z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain a lowercase letter' },
        { status: 400 }
      )
    }

    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain a number' },
        { status: 400 }
      )
    }

    loggers.auth(
      { clerk_user_id: clerkUserId },
      'Completing migration - setting new password'
    )

    // Get user from Clerk to get email
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const user = await client.users.getUser(clerkUserId)

    if (!user.primaryEmailAddress?.emailAddress) {
      return NextResponse.json(
        { error: 'User has no primary email' },
        { status: 400 }
      )
    }

    const email = user.primaryEmailAddress.emailAddress.toLowerCase().trim()

    // Get migration record
    const { data: migrationRecord } = await supabaseAdmin
      .from('user_migration')
      .select('supabase_id, migrated')
      .eq('clerk_id', clerkUserId)
      .maybeSingle()

    if (!migrationRecord) {
      logError(new Error('Migration record not found'), {
        operation: 'complete_migration',
        phase: 'record_lookup',
        severity: 'high',
        clerk_user_id: clerkUserId,
        errorContext: 'User not in migration table'
      })
      return NextResponse.json(
        { error: 'Migration record not found. Please contact support.' },
        { status: 404 }
      )
    }

    if (migrationRecord.migrated) {
      // Already migrated, just return success
      loggers.auth({ clerk_user_id: clerkUserId }, 'User already migrated')
      return NextResponse.json({ success: true })
    }

    // Update Supabase Auth password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      migrationRecord.supabase_id,
      {
        password,
        user_metadata: {
          ...user,
          migrated: true,
          migration_completed_at: new Date().toISOString()
        }
      }
    )

    if (updateError) {
      logError(new Error('Failed to update Supabase password'), {
        operation: 'complete_migration',
        phase: 'password_update',
        severity: 'high',
        clerk_user_id: clerkUserId,
        supabase_id: migrationRecord.supabase_id,
        errorContext: 'Could not update Supabase Auth password',
        error: updateError
      })
      return NextResponse.json(
        { error: 'Failed to update password. Please try again.' },
        { status: 500 }
      )
    }

    // Mark as migrated in migration table
    const { error: migrationUpdateError } = await supabaseAdmin
      .from('user_migration')
      .update({
        migrated: true,
        migrated_at: new Date().toISOString()
      })
      .eq('clerk_id', clerkUserId)

    if (migrationUpdateError) {
      logError(new Error('Failed to mark user as migrated'), {
        operation: 'complete_migration',
        phase: 'migration_flag_update',
        severity: 'medium',
        clerk_user_id: clerkUserId,
        errorContext: 'Could not update migration table',
        error: migrationUpdateError
      })
      // Don't fail the request - password was updated successfully
    }

    loggers.auth(
      { clerk_user_id: clerkUserId, email, supabase_id: migrationRecord.supabase_id },
      'Migration completed successfully'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error('Complete migration failed'),
      {
        operation: 'complete_migration',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Unexpected error during migration completion'
      }
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
