/**
 * Auth Migration Library
 *
 * Handles lazy migration from Clerk to Supabase Auth
 * Phase 5: Dual-auth implementation with automatic migration on login
 */

import { supabaseAdmin } from './supabase'
import { clerkClient } from '@clerk/nextjs/server'
import { loggers, logError } from './logger'

/**
 * Migrate a user from Clerk to Supabase Auth on their first login
 *
 * Process:
 * 1. Find the user's precreated mapping in user_migration table
 * 2. Update the Supabase Auth user's password
 * 3. Link the Supabase Auth ID to the users table (auth_user_id)
 * 4. Mark migration as complete
 * 5. Log the migration
 *
 * @param email - User's email address
 * @param password - User's password (from Clerk auth)
 * @param clerkUserId - Clerk user ID
 * @returns Migrated Supabase Auth user or null on failure
 */
export async function migrateUserToSupabase(
  email: string,
  password: string,
  clerkUserId: string
): Promise<{ id: string } | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase()

    loggers.auth(
      { email: normalizedEmail, clerk_id: clerkUserId, phase: 'migration_start' },
      'Starting user migration from Clerk to Supabase'
    )

    // Get Clerk user details for metadata
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)

    // Find precreated shell via mapping table
    const { data: mapRow, error: mapErr } = await supabaseAdmin
      .from('user_migration')
      .select('supabase_id, migrated, clerk_id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (mapErr) {
      logError(new Error('Migration lookup failed'), {
        operation: 'migrateUserToSupabase',
        phase: 'mapping_lookup',
        severity: 'high',
        email: normalizedEmail,
        clerk_id: clerkUserId,
        errorContext: 'Failed to find user mapping in user_migration table',
        error: mapErr
      })
      return null
    }

    if (!mapRow?.supabase_id) {
      logError(new Error('No precreated Supabase user found'), {
        operation: 'migrateUserToSupabase',
        phase: 'missing_mapping',
        severity: 'critical',
        email: normalizedEmail,
        clerk_id: clerkUserId,
        errorContext: 'User has no mapping in user_migration table - prepopulation may have failed'
      })

      // Log alert for monitoring
      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email: normalizedEmail,
          clerk_id: clerkUserId,
          alert_type: 'missing_mapping'
        })
         // Don't fail migration if alert fails

      return null
    }

    // If already migrated, just return the ID
    if (mapRow.migrated) {
      loggers.auth(
        { email: normalizedEmail, clerk_id: clerkUserId, supabase_id: mapRow.supabase_id },
        'User already migrated, skipping'
      )
      return { id: mapRow.supabase_id }
    }

    // Update Supabase Auth user with password + metadata
    const { data: authUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      mapRow.supabase_id,
      {
        password,
        user_metadata: {
          clerk_id: clerkUserId,
          first_name: clerkUser.firstName,
          last_name: clerkUser.lastName,
          migrated: true,
          migrated_at: new Date().toISOString(),
          mfa_enabled: clerkUser.twoFactorEnabled || false,
          // Keep track if user had MFA in Clerk (for future prompt to re-enable)
          clerk_had_mfa: clerkUser.twoFactorEnabled || false
        }
      }
    )

    if (updateError) {
      logError(new Error('Failed to update Supabase Auth user'), {
        operation: 'migrateUserToSupabase',
        phase: 'auth_update',
        severity: 'critical',
        email: normalizedEmail,
        clerk_id: clerkUserId,
        supabase_id: mapRow.supabase_id,
        errorContext: 'Failed to set password on Supabase Auth user',
        error: updateError
      })

      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email: normalizedEmail,
          clerk_id: clerkUserId,
          alert_type: 'auth_update_failed'
        })
        

      return null
    }

    // Update users table with auth_user_id link
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        auth_user_id: mapRow.supabase_id,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', clerkUserId)

    if (userUpdateError) {
      logError(new Error('Failed to link auth_user_id in users table'), {
        operation: 'migrateUserToSupabase',
        phase: 'users_table_update',
        severity: 'high',
        email: normalizedEmail,
        clerk_id: clerkUserId,
        supabase_id: mapRow.supabase_id,
        errorContext: 'Auth user created but failed to link to users table',
        error: userUpdateError
      })

      // This is recoverable - the user can still auth via Clerk fallback
      // Log alert but don't fail the migration
      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email: normalizedEmail,
          clerk_id: clerkUserId,
          alert_type: 'users_table_link_failed'
        })
        
    }

    // Mark migration as complete in user_migration table
    await supabaseAdmin
      .from('user_migration')
      .update({
        migrated: true,
        migrated_at: new Date().toISOString()
      })
      .eq('email', normalizedEmail)

    // Log successful migration
    await supabaseAdmin
      .from('migration_log')
      .insert({
        email: normalizedEmail,
        clerk_user_id: clerkUserId,
        supabase_user_id: mapRow.supabase_id
      })
       // Don't fail if logging fails

    loggers.auth(
      {
        email: normalizedEmail,
        clerk_id: clerkUserId,
        supabase_id: mapRow.supabase_id,
        phase: 'migration_complete'
      },
      'User successfully migrated from Clerk to Supabase'
    )

    return authUser.user
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Migration failed'), {
      operation: 'migrateUserToSupabase',
      phase: 'unexpected_error',
      severity: 'critical',
      email,
      clerk_id: clerkUserId,
      errorContext: 'Unexpected error during user migration'
    })

    await supabaseAdmin
      .from('migration_alerts')
      .insert({
        email,
        clerk_id: clerkUserId,
        alert_type: 'migration_error'
      })
      

    return null
  }
}

/**
 * Check if a user needs to be migrated
 *
 * @param email - User's email address
 * @returns true if user needs migration, false otherwise
 */
export async function needsMigration(email: string): Promise<boolean> {
  try {
    const normalizedEmail = email.trim().toLowerCase()

    const { data: mapRow } = await supabaseAdmin
      .from('user_migration')
      .select('migrated')
      .eq('email', normalizedEmail)
      .maybeSingle()

    return mapRow ? !mapRow.migrated : false
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to check migration status'), {
      operation: 'needsMigration',
      phase: 'status_check',
      severity: 'low',
      email,
      errorContext: 'Error checking if user needs migration'
    })
    return false
  }
}

/**
 * Get migration statistics
 * Used for admin dashboard
 */
export async function getMigrationStats() {
  try {
    const { data: progress } = await supabaseAdmin
      .from('v_migration_progress')
      .select('*')
      .single()

    const { data: last24h } = await supabaseAdmin
      .from('v_migration_last_24h')
      .select('*')

    const { data: byType } = await supabaseAdmin
      .from('v_migration_by_auth_type')
      .select('*')

    return {
      progress: progress || { total: 0, migrated: 0, remaining: 0, percentage: 0 },
      last24h: last24h || [],
      byType: byType || []
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to get migration stats'), {
      operation: 'getMigrationStats',
      phase: 'stats_retrieval',
      severity: 'low',
      errorContext: 'Error fetching migration statistics'
    })

    return {
      progress: { total: 0, migrated: 0, remaining: 0, percentage: 0 },
      last24h: [],
      byType: []
    }
  }
}
