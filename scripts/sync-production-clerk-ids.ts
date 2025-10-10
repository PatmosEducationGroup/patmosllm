/**
 * PRODUCTION Clerk ID Sync Script
 *
 * This script syncs your production Supabase database with production Clerk
 * Run this with PRODUCTION environment variables!
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_live_... NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... npm run tsx scripts/sync-production-clerk-ids.ts
 */

import { clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

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

async function syncProductionClerkIds() {
  console.log('🔄 Syncing Production Clerk IDs...')
  console.log('⚠️  Using PRODUCTION keys\n')

  // Get all users from production database (exclude invited_ placeholders and deleted users)
  const { data: dbUsers, error: dbError } = await supabase
    .from('users')
    .select('id, email, clerk_id, clerk_user_id')
    .not('clerk_id', 'like', 'invited_%')
    .is('deleted_at', null)

  if (dbError || !dbUsers) {
    console.error('❌ Failed to fetch users from database:', dbError)
    return
  }

  console.log(`📊 Found ${dbUsers.length} active users in database\n`)

  const client = await clerkClient()
  let updated = 0
  let alreadyCorrect = 0
  let notFoundInClerk = 0
  let errors = 0

  for (const dbUser of dbUsers) {
    try {
      console.log(`\n🔍 Checking: ${dbUser.email}`)
      console.log(`   DB Clerk ID: ${dbUser.clerk_id}`)

      // Search Clerk by email
      const { data: clerkUsers } = await client.users.getUserList({
        emailAddress: [dbUser.email],
        limit: 10
      })

      if (!clerkUsers || clerkUsers.length === 0) {
        console.log(`   ❌ Not found in Production Clerk`)
        notFoundInClerk++
        continue
      }

      const clerkUser = clerkUsers[0]
      console.log(`   Clerk has ID: ${clerkUser.id}`)

      if (clerkUser.id === dbUser.clerk_id) {
        console.log(`   ✅ Already correct`)
        alreadyCorrect++
        continue
      }

      // Update the database with correct Clerk ID
      console.log(`   🔄 Updating: ${dbUser.clerk_id} → ${clerkUser.id}`)

      const { error: updateError } = await supabase
        .from('users')
        .update({
          clerk_id: clerkUser.id,
          clerk_user_id: clerkUser.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbUser.id)

      if (updateError) {
        console.log(`   ❌ Update failed:`, updateError.message)
        errors++
      } else {
        console.log(`   ✅ Updated successfully`)
        updated++
      }

    } catch (err: unknown) {
      console.log(`   ❌ Error:`, (err instanceof Error ? err.message : String(err)))
      errors++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 SYNC COMPLETE')
  console.log('='.repeat(60))
  console.log(`   ✅ Already correct: ${alreadyCorrect}`)
  console.log(`   🔄 Updated: ${updated}`)
  console.log(`   ❌ Not found in Clerk: ${notFoundInClerk}`)
  console.log(`   ⚠️  Errors: ${errors}`)
  console.log(`   📝 Total: ${dbUsers.length}`)
  console.log('='.repeat(60))

  if (updated > 0) {
    console.log('\n✅ Production users should now be able to log in!')
  }
}

syncProductionClerkIds().catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
