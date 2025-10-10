// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '../src/lib/supabase'

/**
 * Fix Clerk ID mismatches by looking up users by email
 * This handles cases where users were deleted/recreated in Clerk
 */

async function fixClerkIds() {
  console.log('🔧 Fixing Clerk ID mismatches...\n')

  // Get all users from Supabase with real Clerk IDs (not invited_ placeholders)
  const { data: dbUsers, error: dbError } = await supabaseAdmin
    .from('users')
    .select('id, email, clerk_id, clerk_user_id')
    .not('clerk_id', 'like', 'invited_%')
    .is('deleted_at', null)

  if (dbError || !dbUsers) {
    console.error('❌ Failed to fetch users from database:', dbError)
    return
  }

  console.log(`📊 Found ${dbUsers.length} users in database with Clerk IDs\n`)

  const client = await clerkClient()
  let fixed = 0
  let alreadyCorrect = 0
  let notFoundInClerk = 0
  let errors = 0

  for (const dbUser of dbUsers) {
    try {
      // Try to get user by current ID first
      let _clerkUser
      try {
        _clerkUser = await client.users.getUser(dbUser.clerk_id)
        console.log(`✅ ${dbUser.email} - Clerk ID is correct (${dbUser.clerk_id})`)
        alreadyCorrect++
        continue
      } catch (err: unknown) {
        if (((err as { status?: number }).status) !== 404) {
          throw err
        }
        // 404 means old ID - need to find by email
      }

      // Get all Clerk users and find by email
      console.log(`🔍 ${dbUser.email} - Old ID not found, searching by email...`)

      const { data: allUsers } = await client.users.getUserList({
        emailAddress: [dbUser.email],
        limit: 10
      })

      if (!allUsers || allUsers.length === 0) {
        console.log(`   ❌ Not found in Clerk by email`)
        notFoundInClerk++
        continue
      }

      if (allUsers.length > 1) {
        console.log(`   ⚠️  Multiple users found for email (${allUsers.length})`)
      }

      const newClerkUser = allUsers[0]
      const newClerkId = newClerkUser.id

      console.log(`   🔄 Updating: ${dbUser.clerk_id} → ${newClerkId}`)

      // Update both clerk_id and clerk_user_id
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          clerk_id: newClerkId,
          clerk_user_id: newClerkId,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbUser.id)

      if (updateError) {
        console.log(`   ❌ Update failed:`, updateError.message)
        errors++
      } else {
        console.log(`   ✅ Updated successfully`)
        fixed++
      }

    } catch (err: unknown) {
      console.log(`   ❌ Error processing ${dbUser.email}:`, (err instanceof Error ? err.message : String(err)))
      errors++
    }

    console.log('') // Empty line between users
  }

  console.log('\n📊 Summary:')
  console.log(`   ✅ Already correct: ${alreadyCorrect}`)
  console.log(`   🔄 Fixed: ${fixed}`)
  console.log(`   ❌ Not found in Clerk: ${notFoundInClerk}`)
  console.log(`   ⚠️  Errors: ${errors}`)
  console.log(`   📝 Total processed: ${dbUsers.length}`)
}

fixClerkIds().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
