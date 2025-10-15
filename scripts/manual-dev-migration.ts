/**
 * Manual Dev Account Migration Script
 *
 * Use this to manually migrate your dev account from Clerk to Supabase
 * when the automatic migration doesn't work in development
 *
 * Usage:
 *   npx tsx scripts/manual-dev-migration.ts YOUR_EMAIL@example.com YourPassword123
 */

// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local first
const envPath = resolve(process.cwd(), '.env.local')
console.log(`Loading environment from: ${envPath}`)
const result = config({ path: envPath })

if (result.error) {
  console.error('Failed to load .env.local:', result.error)
  process.exit(1)
}

// Verify required env vars
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗')
  process.exit(1)
}

import { clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '../src/lib/supabase'

async function manualMigration(email: string, password: string) {
  console.log('🔧 Manual Dev Account Migration')
  console.log(`📧 Email: ${email}`)
  console.log('━'.repeat(60))

  // Validate password
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters')
    process.exit(1)
  }
  if (!/[A-Z]/.test(password)) {
    console.error('❌ Password must contain an uppercase letter')
    process.exit(1)
  }
  if (!/[a-z]/.test(password)) {
    console.error('❌ Password must contain a lowercase letter')
    process.exit(1)
  }
  if (!/[0-9]/.test(password)) {
    console.error('❌ Password must contain a number')
    process.exit(1)
  }

  console.log('✓ Password meets requirements\n')

  // Step 1: Find Clerk user
  console.log('Step 1: Looking up Clerk user...')
  const client = await clerkClient()
  const clerkUsers = await client.users.getUserList({
    emailAddress: [email]
  })

  if (!clerkUsers.data || clerkUsers.data.length === 0) {
    console.error(`❌ No Clerk user found with email: ${email}`)
    process.exit(1)
  }

  const clerkUser = clerkUsers.data[0]
  console.log(`✓ Found Clerk user: ${clerkUser.id}`)
  console.log(`  Name: ${clerkUser.firstName} ${clerkUser.lastName}`)
  console.log(`  Created: ${new Date(clerkUser.createdAt).toLocaleDateString()}\n`)

  // Step 2: Check if Supabase user already exists
  console.log('Step 2: Checking Supabase Auth...')
  const { data: existingSupabaseUser } = await supabaseAdmin.rpc('get_auth_user_id_by_email', {
    p_email: email.toLowerCase().trim()
  })

  let supabaseId: string

  if (existingSupabaseUser) {
    console.log(`✓ Found existing Supabase user: ${existingSupabaseUser}`)
    supabaseId = existingSupabaseUser

    // Update password
    console.log('  Updating password...')
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      supabaseId,
      {
        password,
        user_metadata: {
          clerk_id: clerkUser.id,
          first_name: clerkUser.firstName,
          last_name: clerkUser.lastName,
          migrated: true,
          migration_completed_at: new Date().toISOString()
        }
      }
    )

    if (updateError) {
      console.error('❌ Failed to update password:', updateError.message)
      process.exit(1)
    }
    console.log('✓ Password updated\n')
  } else {
    // Create new Supabase user
    console.log('  Creating new Supabase user...')
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      email_confirm: true,
      password,
      user_metadata: {
        clerk_id: clerkUser.id,
        first_name: clerkUser.firstName,
        last_name: clerkUser.lastName,
        migrated: true,
        migration_completed_at: new Date().toISOString()
      }
    })

    if (createError || !newUser.user) {
      console.error('❌ Failed to create Supabase user:', createError?.message)
      process.exit(1)
    }

    supabaseId = newUser.user.id
    console.log(`✓ Created Supabase user: ${supabaseId}\n`)
  }

  // Step 3: Ensure user_migration mapping exists
  console.log('Step 3: Creating migration mapping...')
  const { error: mappingError } = await supabaseAdmin.rpc('ensure_user_mapping', {
    p_email: email.toLowerCase().trim(),
    p_clerk_id: clerkUser.id,
    p_supabase_id: supabaseId
  })

  if (mappingError) {
    console.error('❌ Failed to create mapping:', mappingError.message)
    process.exit(1)
  }
  console.log('✓ Mapping created\n')

  // Step 4: Mark as migrated
  console.log('Step 4: Marking migration as complete...')
  const { error: updateError } = await supabaseAdmin
    .from('user_migration')
    .update({
      migrated: true,
      migrated_at: new Date().toISOString()
    })
    .eq('clerk_id', clerkUser.id)

  if (updateError) {
    console.error('⚠️  Warning: Could not update migration status:', updateError.message)
    console.log('   (This is usually fine - user can still log in)\n')
  } else {
    console.log('✓ Migration marked complete\n')
  }

  // Step 5: Ensure user exists in public.users table
  console.log('Step 5: Ensuring user record in public.users...')
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', supabaseId)
    .maybeSingle()

  if (!existingUser) {
    console.log('  Creating user record...')
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: supabaseId,
        clerk_id: clerkUser.id,
        email: email.toLowerCase().trim(),
        role: 'USER',
        created_at: new Date().toISOString()
      })

    if (userError) {
      console.error('⚠️  Warning: Could not create user record:', userError.message)
      console.log('   (This might be created automatically by trigger)\n')
    } else {
      console.log('✓ User record created\n')
    }
  } else {
    console.log('✓ User record already exists\n')
  }

  console.log('━'.repeat(60))
  console.log('✅ Migration complete!')
  console.log('\n📝 You can now log in to Supabase with:')
  console.log(`   Email: ${email}`)
  console.log(`   Password: ${password}`)
  console.log('\n🔗 Go to: http://localhost:3000/auth/login-supabase')
}

// Get command line arguments
const args = process.argv.slice(2)

if (args.length < 2) {
  console.log('Usage: npx tsx scripts/manual-dev-migration.ts YOUR_EMAIL PASSWORD')
  console.log('\nExample:')
  console.log('  npx tsx scripts/manual-dev-migration.ts admin@example.com MyPassword123')
  console.log('\nPassword requirements:')
  console.log('  - At least 8 characters')
  console.log('  - Contains uppercase letter')
  console.log('  - Contains lowercase letter')
  console.log('  - Contains number')
  process.exit(1)
}

const [email, password] = args

manualMigration(email, password).catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
