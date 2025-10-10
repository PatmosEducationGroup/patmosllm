// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { clerkClient } from '@clerk/nextjs/server'

/**
 * Test script to check if Clerk users exist individually
 * This will help us understand why getUserList only returns 4 users
 */

// Known user IDs from Supabase database
const knownUserIds = [
  'user_33cpM6KpTFruA4kIMEG6eKrs2d5', // michael.l.wiggins@gmail.com
  'user_33bPP6Q6P4qxAzRnAL76wj3HwsI', // matt@bighousechurch.com
  'user_33ckTV8xqEiEEZiXsAxg6rdzed4', // katie@everydaympls.com
  'user_33fERMMYBDcm0uuuDijV6cHrL2H', // nick@runministries.org
  'user_33hBM7wkLREyLGQGeHGsXI2kasZ', // kelly@runministries.org
  'user_33ct9oKtrjsofwY9guF28MEvIaJ', // christopher.fletcher@manna.church
  'user_33Z9q6RnFe7DaJMTFKBxSxh84n5', // ericwatt@gmail.com
  'user_33NO4Fgb2SmqD82d2fyfOWykXns', // drc@tlpmail.com
  'user_33DCwwnVg8CUu4nmVQkRDzLl67g', // sbp@pm.me
  'user_32WO6XSzo9wn6PlcS2jMuILkJLz', // jason.hubbard@ipcprayer.org
  'user_32T5onhGm5LtCBZZmOqLRFIlcs7', // tim@runministries.org
  'user_33X1P0QjOI7iT3jSVII1JMGt62T', // emichaelray+test13@gmail.com (in API)
  'user_33NZzguVeakg8nuqnFKPjikdcwq', // emichaelray+hecontributor@gmail.com (in API)
  'user_31v9cMP10nsOCh2262VX7Cn7OJ5', // mray523@proton.me (in API)
  'user_31VtkWmZ1hKvQ7XKK8EgGtTYUtx', // emichaelray@gmail.com (in API)
]

async function testClerkUsers() {
  console.log('🧪 Testing individual Clerk user access...\n')

  const client = await clerkClient()

  let found = 0
  let notFound = 0
  let errors = 0

  for (const userId of knownUserIds) {
    try {
      const user = await client.users.getUser(userId)
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId
      )?.emailAddress

      console.log(`✅ Found: ${primaryEmail} (${userId})`)
      found++
    } catch (err: unknown) {
      if (((err as { status?: number }).status) === 404) {
        console.log(`❌ Not found: ${userId}`)
        notFound++
      } else {
        console.log(`⚠️  Error: ${userId} - ${(err instanceof Error ? err.message : String(err))}`)
        errors++
      }
    }
  }

  console.log(`\n📊 Results:`)
  console.log(`   ✅ Found: ${found}`)
  console.log(`   ❌ Not found: ${notFound}`)
  console.log(`   ⚠️  Errors: ${errors}`)
  console.log(`   📝 Total tested: ${knownUserIds.length}`)
}

testClerkUsers().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
