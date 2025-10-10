/**
 * PRODUCTION Prepopulation Script
 *
 * Pre-populate Supabase Auth with shell accounts for all production Clerk users
 * Run this BEFORE deploying dual-auth code to production
 *
 * Usage:
 *   node -r dotenv/config node_modules/.bin/tsx scripts/prepopulate-production.ts dotenv_config_path=.env.production
 */

import { clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Validate we're using production keys
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const clerkSecretKey = process.env.CLERK_SECRET_KEY

if (!clerkPubKey?.startsWith('pk_live_') || !clerkSecretKey?.startsWith('sk_live_')) {
  console.error('❌ ERROR: This script requires PRODUCTION Clerk keys!')
  console.error('   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_live_')
  console.error('   CLERK_SECRET_KEY must start with sk_live_')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// In-memory cache to avoid duplicate lookups
const emailToSupabaseId = new Map<string, string>()

async function findSupabaseUserByEmail(email: string): Promise<string | null> {
  if (emailToSupabaseId.has(email)) {
    return emailToSupabaseId.get(email)!
  }

  console.log(`      🔍 Looking up ${email} in Supabase Auth...`)

  try {
    const { data, error } = await supabase.rpc('get_auth_user_id_by_email', {
      p_email: email
    })

    if (error) {
      console.error(`      ❌ RPC error:`, error.message)
      return null
    }

    if (data) {
      console.log(`      ✓ Found existing Supabase Auth user → ${data}`)
      emailToSupabaseId.set(email, data)
      return data
    }

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
    // Generate secure random password (user will reset on migration)
    const randomPassword = crypto.randomUUID() + crypto.randomUUID()

    // Try to create Supabase Auth user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true, // Pre-confirmed (they verified with Clerk)
      password: randomPassword,
      user_metadata: metadata
    })

    let supabaseId = created?.user?.id
    let wasExisting = false

    // Handle any error from createUser
    if (createErr) {
      console.log(`   ⚠️  createUser error: "${createErr.message}"`)

      // Check if this is ANY kind of "user already exists" error
      if (
        /already.*registered|user.*already|email.*already|database.*error.*email/i.test(createErr.message)
      ) {
        console.log(`   ℹ️  User already exists in Supabase Auth`)

        // Look up the existing Supabase user ID
        supabaseId = (await findSupabaseUserByEmail(email)) || undefined

        if (!supabaseId) {
          console.error(`   ❌ Failed to find existing Supabase user ID`)
          return { supabaseId: null, wasExisting: false }
        }

        wasExisting = true
      } else {
        console.error(`   ❌ Unexpected error:`, createErr.message)
        return { supabaseId: null, wasExisting: false }
      }
    }

    if (!supabaseId) {
      console.error(`   ❌ Could not resolve Supabase ID`)
      return { supabaseId: null, wasExisting: false }
    }

    // Create mapping in user_migration table
    const { error: mapErr } = await supabase.rpc('ensure_user_mapping', {
      p_email: email,
      p_clerk_id: clerkId,
      p_supabase_id: supabaseId
    })

    if (mapErr) {
      console.error(`   ❌ Mapping error:`, mapErr.message)
      return { supabaseId: null, wasExisting: false }
    }

    return { supabaseId, wasExisting }
  } catch (error) {
    console.error(`   ❌ Error creating shell:`, error)
    return { supabaseId: null, wasExisting: false }
  }
}

async function run() {
  console.log('🚀 Starting PRODUCTION prepopulation...')
  console.log('⚠️  Using PRODUCTION Clerk + Supabase credentials\n')

  // Get all users from production database
  const { data: dbUsers, error: dbError } = await supabase
    .from('users')
    .select('id, email, clerk_id, clerk_user_id')
    .not('clerk_id', 'like', 'invited_%')
    .is('deleted_at', null)

  if (dbError || !dbUsers) {
    console.error('❌ Failed to fetch users from database:', dbError)
    process.exit(1)
  }

  console.log(`📊 Found ${dbUsers.length} active users in production database\n`)

  const client = await clerkClient()
  let createdNew = 0
  let mappedExisting = 0
  let errors = 0

  for (const dbUser of dbUsers) {
    console.log(`\n🔍 Processing: ${dbUser.email}`)
    console.log(`   Database Clerk ID: ${dbUser.clerk_id}`)

    // Verify user exists in Clerk
    const { data: clerkUsers } = await client.users.getUserList({
      emailAddress: [dbUser.email],
      limit: 10
    })

    if (!clerkUsers || clerkUsers.length === 0) {
      console.log(`   ⚠️  Not found in Clerk - skipping`)
      errors++
      continue
    }

    const clerkUser = clerkUsers[0]
    console.log(`   Clerk user ID: ${clerkUser.id}`)

    // Determine auth type for analytics
    const hasPassword = clerkUser.passwordEnabled
    const hasOAuth = clerkUser.externalAccounts.length > 0
    const authType = hasPassword ? 'password' : hasOAuth ? 'oauth' : 'magic_link'

    const metadata = {
      clerk_id: clerkUser.id,
      first_name: clerkUser.firstName,
      last_name: clerkUser.lastName,
      clerk_auth_type: authType,
      has_mfa: clerkUser.twoFactorEnabled || false,
      migrated: false,
      clerk_created_at: clerkUser.createdAt
    }

    const result = await ensureUserShell(dbUser.email, clerkUser.id, metadata)

    if (result.supabaseId) {
      if (result.wasExisting) {
        mappedExisting++
        console.log(`   ✅ Mapped existing → ${result.supabaseId}`)
      } else {
        createdNew++
        console.log(`   ✅ Created new → ${result.supabaseId}`)
      }
    } else {
      errors++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 PREPOPULATION COMPLETE')
  console.log('='.repeat(60))
  console.log(`   ✅ New Supabase Auth accounts created: ${createdNew}`)
  console.log(`   ✅ Existing accounts mapped: ${mappedExisting}`)
  console.log(`   ❌ Errors: ${errors}`)
  console.log(`   📝 Total processed: ${dbUsers.length}`)
  console.log('='.repeat(60))

  if (errors > 0) {
    console.log('\n⚠️  Some users failed to process. Review errors above.')
    process.exit(1)
  }

  console.log('\n✅ All production users are ready for dual-auth migration!')
  console.log('   You can now deploy the dual-auth code to production.')
}

run().catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
