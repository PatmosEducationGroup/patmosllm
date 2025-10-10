/**
 * Clerk Webhook Handler
 *
 * Handles Clerk events for automatic user migration
 * Triggered on: session.created (after successful login)
 *
 * Flow:
 * 1. User logs into Clerk
 * 2. Clerk sends session.created webhook
 * 3. We check if user needs migration
 * 4. If unmigrated, we create/update Supabase Auth account with a temporary password
 * 5. User gets email to set new password (optional)
 * 6. Next login can use either Clerk or Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loggers, logError } from '@/lib/logger'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  // Get webhook secret from environment
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    logError(new Error('Missing CLERK_WEBHOOK_SECRET'), {
      operation: 'clerk_webhook',
      phase: 'config_check',
      severity: 'critical',
      errorContext: 'Webhook secret not configured'
    })
    return new NextResponse('Webhook secret not configured', { status: 500 })
  }

  // Get Svix headers for signature verification
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse('Error: Missing Svix headers', { status: 400 })
  }

  // Get raw body
  const payload = await req.json()
  const body = JSON.stringify(payload)

  // Create Svix instance
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  // Verify webhook signature
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature
    }) as WebhookEvent
  } catch (err) {
    logError(err instanceof Error ? err : new Error('Webhook verification failed'), {
      operation: 'clerk_webhook',
      phase: 'signature_verification',
      severity: 'high',
      errorContext: 'Invalid webhook signature'
    })
    return new NextResponse('Error: Verification failed', { status: 400 })
  }

  // Handle session.created event (user just logged in)
  if (evt.type === 'session.created') {
    const { user_id, created_at: _created_at } = evt.data

    loggers.auth(
      { clerk_user_id: user_id, event: 'session.created' },
      'Clerk session created - checking migration status'
    )

    try {
      // Get user details from Clerk
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      const user = await client.users.getUser(user_id)

      if (!user.primaryEmailAddress?.emailAddress) {
        loggers.auth(
          { clerk_user_id: user_id },
          'User has no primary email - skipping migration'
        )
        return new NextResponse('OK', { status: 200 })
      }

      const email = user.primaryEmailAddress.emailAddress.toLowerCase().trim()

      // Check if user needs migration
      const { data: mapRow } = await supabaseAdmin
        .from('user_migration')
        .select('migrated, supabase_id')
        .eq('email', email)
        .maybeSingle()

      // If already migrated, nothing to do
      if (mapRow?.migrated) {
        loggers.auth(
          { clerk_user_id: user_id, email },
          'User already migrated - skipping'
        )
        return new NextResponse('OK', { status: 200 })
      }

      // If no mapping exists, user wasn't prepopulated (shouldn't happen in production)
      if (!mapRow?.supabase_id) {
        loggers.auth(
          { clerk_user_id: user_id, email },
          'User not in migration table - creating shell account'
        )

        // Create a new Supabase Auth shell account
        const tempPassword = crypto.randomUUID() + crypto.randomUUID()
        const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true, // They verified with Clerk
          user_metadata: {
            clerk_id: user_id,
            first_name: user.firstName,
            last_name: user.lastName,
            migrated: false,
            created_via: 'webhook',
            clerk_created_at: user.createdAt
          }
        })

        if (createError || !authUser?.user) {
          logError(new Error('Failed to create Supabase shell account'), {
            operation: 'clerk_webhook',
            phase: 'shell_creation',
            severity: 'high',
            clerk_user_id: user_id,
            email,
            errorContext: 'Could not create Supabase Auth user',
            error: createError
          })
          return new NextResponse('Error creating shell account', { status: 500 })
        }

        // Add to migration table
        await supabaseAdmin
          .from('user_migration')
          .insert({
            email,
            clerk_id: user_id,
            supabase_id: authUser.user.id,
            migrated: false
          })

        // Update users table with auth_user_id
        await supabaseAdmin
          .from('users')
          .update({
            auth_user_id: authUser.user.id
          })
          .eq('clerk_id', user_id)

        loggers.auth(
          { clerk_user_id: user_id, email, supabase_id: authUser.user.id },
          'Created shell account via webhook'
        )

        return new NextResponse('OK', { status: 200 })
      }

      // User has mapping but not migrated - update the shell account
      loggers.auth(
        { clerk_user_id: user_id, email, supabase_id: mapRow.supabase_id },
        'Updating shell account via webhook'
      )

      // Update metadata but keep temporary password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        mapRow.supabase_id,
        {
          user_metadata: {
            clerk_id: user_id,
            first_name: user.firstName,
            last_name: user.lastName,
            migrated: false,
            last_clerk_login: new Date().toISOString(),
            clerk_created_at: user.createdAt
          }
        }
      )

      if (updateError) {
        logError(new Error('Failed to update shell account'), {
          operation: 'clerk_webhook',
          phase: 'shell_update',
          severity: 'medium',
          clerk_user_id: user_id,
          email,
          supabase_id: mapRow.supabase_id,
          errorContext: 'Could not update Supabase Auth metadata',
          error: updateError
        })
      }

      // Update users table with auth_user_id link
      await supabaseAdmin
        .from('users')
        .update({
          auth_user_id: mapRow.supabase_id
        })
        .eq('clerk_id', user_id)

      loggers.auth(
        { clerk_user_id: user_id, email },
        'Shell account ready - user can migrate by setting password'
      )

      return new NextResponse('OK', { status: 200 })
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Webhook processing failed'), {
        operation: 'clerk_webhook',
        phase: 'event_processing',
        severity: 'high',
        clerk_user_id: user_id,
        errorContext: 'Unexpected error during webhook processing'
      })
      return new NextResponse('Error processing webhook', { status: 500 })
    }
  }

  // Handle user.deleted event
  if (evt.type === 'user.deleted') {
    const { id: user_id } = evt.data

    loggers.auth({ clerk_user_id: user_id, event: 'user.deleted' }, 'User deleted in Clerk')

    try {
      // Soft delete in migration table
      await supabaseAdmin
        .from('user_migration')
        .update({
          deleted_at: new Date().toISOString(),
          migrated: false
        })
        .eq('clerk_id', user_id)

      // Soft delete in users table
      await supabaseAdmin
        .from('users')
        .update({
          deleted_at: new Date().toISOString()
        })
        .eq('clerk_id', user_id)

      loggers.auth({ clerk_user_id: user_id }, 'User soft-deleted in migration tables')

      return new NextResponse('OK', { status: 200 })
    } catch (error) {
      logError(error instanceof Error ? error : new Error('User deletion failed'), {
        operation: 'clerk_webhook',
        phase: 'user_deletion',
        severity: 'medium',
        clerk_user_id: user_id,
        errorContext: 'Failed to soft-delete user'
      })
      return new NextResponse('Error processing deletion', { status: 500 })
    }
  }

  // Return 200 for all other events
  return new NextResponse('OK', { status: 200 })
}
