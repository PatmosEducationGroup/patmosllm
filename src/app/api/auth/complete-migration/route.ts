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
    const { clerkUserId, email, password } = await request.json()

    // Must provide either clerkUserId OR email
    if ((!clerkUserId && !email) || !password) {
      return NextResponse.json(
        { error: 'Either Clerk user ID or email is required, along with password' },
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

    // OPTION 1: Clerk session-based flow (backward compatibility)
    if (clerkUserId) {
      loggers.auth(
        { clerk_user_id: clerkUserId },
        'Completing migration via Clerk ID - setting new password'
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

      const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase().trim()

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
          email: userEmail,
          errorContext: 'Could not update Supabase Auth password',
          error: updateError
        })
        return NextResponse.json(
          { error: `Failed to update password: ${updateError.message || 'Unknown error'}` },
          { status: 500 }
        )
      }

      // Mark as migrated in migration table
      await supabaseAdmin
        .from('user_migration')
        .update({
          migrated: true,
          migrated_at: new Date().toISOString()
        })
        .eq('clerk_id', clerkUserId)

      loggers.auth(
        { clerk_user_id: clerkUserId, email: userEmail, supabase_id: migrationRecord.supabase_id },
        'Migration completed successfully (Clerk flow)'
      )

      return NextResponse.json({ success: true })
    }

    // OPTION 2: Email-based flow (for forced migration without Clerk session)
    if (email) {
      const normalizedEmail = email.toLowerCase().trim()

      loggers.auth(
        { email: normalizedEmail },
        'Completing migration via email - setting new password'
      )

      // Get migration record by email
      const { data: migrationRecord } = await supabaseAdmin
        .from('user_migration')
        .select('supabase_id, clerk_id, migrated')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!migrationRecord) {
        logError(new Error('Migration record not found'), {
          operation: 'complete_migration',
          phase: 'record_lookup',
          severity: 'high',
          email: normalizedEmail,
          errorContext: 'User not in migration table'
        })
        return NextResponse.json(
          { error: 'Migration record not found. Please contact support.' },
          { status: 404 }
        )
      }

      if (migrationRecord.migrated) {
        // Already migrated, just return success
        loggers.auth({ email: normalizedEmail }, 'User already migrated')
        return NextResponse.json({ success: true })
      }

      // Update Supabase Auth password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        migrationRecord.supabase_id,
        {
          password,
          user_metadata: {
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
          email: normalizedEmail,
          supabase_id: migrationRecord.supabase_id,
          errorContext: 'Could not update Supabase Auth password',
          error: updateError
        })
        return NextResponse.json(
          { error: `Failed to update password: ${updateError.message || 'Unknown error'}` },
          { status: 500 }
        )
      }

      // Mark as migrated in migration table
      await supabaseAdmin
        .from('user_migration')
        .update({
          migrated: true,
          migrated_at: new Date().toISOString()
        })
        .eq('email', normalizedEmail)

      loggers.auth(
        { email: normalizedEmail, supabase_id: migrationRecord.supabase_id },
        'Migration completed successfully (Email flow)'
      )

      return NextResponse.json({ success: true })
    }

    // Should never reach here (guarded by initial validation)
    return NextResponse.json(
      { error: 'Either clerkUserId or email required' },
      { status: 400 }
    )
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
