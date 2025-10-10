// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'
import { logger as _logger } from '../src/lib/logger'

/**
 * Pre-populate Supabase with shell accounts for all Clerk users
 * Run this BEFORE enabling lazy migration
 *
 * Process:
 * 1. Fetch all Clerk users (paginated)
 * 2. For each user, create Supabase Auth shell with random password
 * 3. Create mapping in user_migration table
 * 4. Report progress and errors
 */

// In-memory cache to avoid duplicate lookups
const emailToSupabaseId = new Map<string, string>()

async function findSupabaseUserByEmail(email: string): Promise<string | null> {
  if (emailToSupabaseId.has(email)) {
    return emailToSupabaseId.get(email)!
  }

  console.log(`      🔍 Looking up ${email} via RPC function...`)

  try {
    // Use the RPC function to query auth.users directly
    const { data, error } = await supabaseAdmin.rpc('get_auth_user_id_by_email', {
      p_email: email
    })

    if (error) {
      console.error(`      ❌ RPC error:`, error.message)
      return null
    }

    if (data) {
      console.log(`      ✓ Found ${email} → ${data}`)
      emailToSupabaseId.set(email, data)
      return data
    }

    console.error(`      ❌ User ${email} not found in auth.users`)
    return null
  } catch (error) {
    console.error(`      ❌ Exception finding user:`, error)
    return null
  }
}

async function ensureUserShell(
  email: string,
  clerkId: string,
  metadata: Record<string, unknown>
): Promise<{ supabaseId: string | null; wasExisting: boolean }> {
  try {
    // Since we're having issues with Admin API listUsers, let's try a workaround:
    // 1. Try to create the user
    // 2. If it fails with "already exists", try signInWithPassword with a wrong password
    //    to extract the user ID from the error

    // Generate secure random password (user will reset on migration)
    const randomPassword = crypto.randomUUID() + crypto.randomUUID()

    // Try to create Supabase Auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Pre-confirmed (they verified with Clerk)
      password: randomPassword,
      user_metadata: metadata
    })

    let supabaseId = created?.user?.id
    let wasExisting = false

    // Handle any error from createUser
    if (createErr) {
      console.log(`   ⚠️  createUser error for ${email}: "${createErr.message}"`)

      // Check if this is ANY kind of "user already exists" error
      if (
        /already.*registered|user.*already|email.*already|database.*error.*email/i.test(createErr.message)
      ) {
        console.log(`   ℹ️  User ${email} likely already exists in Supabase Auth (error suggests duplicate)`)

        // Look up the existing Supabase user ID
        supabaseId = (await findSupabaseUserByEmail(email)) || undefined

        if (!supabaseId) {
          console.error(`   ❌ Failed to find existing Supabase user ID for ${email}`)
          return { supabaseId: null, wasExisting: false }
        }

        wasExisting = true
      } else {
        console.error(`❌ Unexpected error creating ${email}:`, createErr.message)
        return { supabaseId: null, wasExisting: false }
      }
    }

    if (!supabaseId) {
      console.error(`❌ Could not resolve Supabase ID for ${email}`)
      return { supabaseId: null, wasExisting: false }
    }

    // Create mapping in user_migration table
    const { error: mapErr } = await supabaseAdmin.rpc('ensure_user_mapping', {
      p_email: email,
      p_clerk_id: clerkId,
      p_supabase_id: supabaseId
    })

    if (mapErr) {
      console.error(`❌ Mapping error for ${email}:`, mapErr.message)
      return { supabaseId: null, wasExisting: false }
    }

    return { supabaseId, wasExisting }
  } catch (error) {
    console.error(`❌ Error creating shell for ${email}:`, error)
    return { supabaseId: null, wasExisting: false }
  }
}

async function run() {
  console.log('🚀 Starting pre-population...')
  console.log('This will create Supabase shell accounts for all Clerk users\n')

  let offset = 0
  const limit = 100
  let processed = 0
  let createdNew = 0
  let mappedExisting = 0
  let skipped = 0
  let errors = 0

  const client = await clerkClient()

  let pageNum = 1

  // First, let's try to get the total count and see what filters are available
  console.log('\n🔍 Querying Clerk API for all users...')

  while (true) {
    console.log(`\n📄 Fetching Clerk users page ${pageNum} (offset: ${offset}, limit: ${limit})...`)

    // Fetch ALL users - try with explicit empty filters
    const response = await client.users.getUserList({
      limit,
      offset,
      // Try to explicitly include all user IDs from our database
    })

    const clerkUsers = response.data
    const totalCount = response.totalCount

    console.log(`   Found ${clerkUsers?.length || 0} users in this page`)
    console.log(`   Total users in Clerk API: ${totalCount}`)

    // Debug: Log all user emails to see who we're getting
    if (clerkUsers && clerkUsers.length > 0) {
      console.log(`   Users in this batch:`)
      clerkUsers.forEach((u, idx) => {
        const primaryEmail = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress
        console.log(`     ${idx + 1}. ${primaryEmail} (ID: ${u.id})`)
      })
    }

    if (!clerkUsers?.length) {
      console.log('   No more users to process, stopping pagination.')
      break
    }

    for (const user of clerkUsers) {
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId
      )?.emailAddress

      if (!primaryEmail) {
        console.log(`⚠️  Skipping ${user.id}: no primary email`)
        skipped++
        continue
      }

      // Determine auth type for analytics
      const hasPassword = user.passwordEnabled
      const hasOAuth = user.externalAccounts.length > 0
      const authType = hasPassword ? 'password' : hasOAuth ? 'oauth' : 'magic_link'

      const metadata = {
        clerk_id: user.id,
        first_name: user.firstName,
        last_name: user.lastName,
        clerk_auth_type: authType,
        has_mfa: user.twoFactorEnabled || false,
        migrated: false,
        clerk_created_at: user.createdAt
      }

      const result = await ensureUserShell(primaryEmail, user.id, metadata)

      if (result.supabaseId) {
        if (result.wasExisting) {
          mappedExisting++
          console.log(`✓ ${primaryEmail} [${authType}] → ${result.supabaseId} (existing)`)
        } else {
          createdNew++
          console.log(`✓ ${primaryEmail} [${authType}] → ${result.supabaseId} (new)`)
        }
      } else {
        errors++
      }

      processed++
    }

    offset += limit
    pageNum++
    console.log(`\n📊 Progress: ${processed} users processed (${createdNew} new, ${mappedExisting} existing, ${errors} errors)...\n`)
  }

  console.log('\n✅ Pre-population complete!')
  console.log(`   Total processed: ${processed}`)
  console.log(`   New accounts created: ${createdNew}`)
  console.log(`   Existing accounts mapped: ${mappedExisting}`)
  console.log(`   Skipped (no email): ${skipped}`)
  console.log(`   Errors: ${errors}`)

  if (errors > 0) {
    console.log('\n⚠️  Some users failed to process. Review errors above.')
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
