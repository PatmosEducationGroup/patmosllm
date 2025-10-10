/**
 * Check a specific user's Clerk ID in database vs production Clerk
 *
 * Usage:
 *   node -r dotenv/config node_modules/.bin/tsx scripts/check-user-clerk-id.ts dotenv_config_path=.env.production
 */

import { clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const EMAIL_TO_CHECK = 'emichaelray+prodcontributor@gmail.com' // Change this to test different emails

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkUser() {
  console.log(`🔍 Checking user: ${EMAIL_TO_CHECK}\n`)

  // 1. Check what's in the database
  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('id, email, clerk_id, clerk_user_id, role, created_at')
    .eq('email', EMAIL_TO_CHECK)
    .is('deleted_at', null)
    .single()

  if (dbError || !dbUser) {
    console.log('❌ User NOT found in database')
    console.log('   Error:', dbError?.message || 'No user with this email')
    return
  }

  console.log('✅ User found in database:')
  console.log(`   Database ID: ${dbUser.id}`)
  console.log(`   Email: ${dbUser.email}`)
  console.log(`   clerk_id: ${dbUser.clerk_id}`)
  console.log(`   clerk_user_id: ${dbUser.clerk_user_id}`)
  console.log(`   Role: ${dbUser.role}`)
  console.log(`   Created: ${dbUser.created_at}\n`)

  // 2. Check what's in Clerk
  const client = await clerkClient()

  try {
    const { data: clerkUsers } = await client.users.getUserList({
      emailAddress: [EMAIL_TO_CHECK],
      limit: 10
    })

    if (!clerkUsers || clerkUsers.length === 0) {
      console.log('❌ User NOT found in Clerk by email search')
      return
    }

    const clerkUser = clerkUsers[0]
    console.log('✅ User found in Clerk:')
    console.log(`   Clerk ID: ${clerkUser.id}`)
    console.log(`   Email: ${clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress}`)
    console.log(`   Created: ${clerkUser.createdAt}\n`)

    // 3. Compare
    if (dbUser.clerk_id === clerkUser.id) {
      console.log('✅ MATCH: Database clerk_id matches Clerk user ID')
      console.log('   This user should be able to log in successfully!\n')
    } else {
      console.log('❌ MISMATCH: Database clerk_id does NOT match Clerk user ID')
      console.log(`   Database has: ${dbUser.clerk_id}`)
      console.log(`   Clerk has:    ${clerkUser.id}`)
      console.log('   This user will get "User not found" error!\n')

      console.log('💡 To fix, run:')
      console.log(`   UPDATE users SET clerk_id = '${clerkUser.id}', clerk_user_id = '${clerkUser.id}' WHERE email = '${EMAIL_TO_CHECK}';`)
    }

  } catch (err: unknown) {
    console.log('❌ Error checking Clerk:', (err instanceof Error ? err.message : String(err)))
  }
}

checkUser().catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
