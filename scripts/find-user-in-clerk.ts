/**
 * Find a user in Clerk by email (production)
 */

import { clerkClient } from '@clerk/nextjs/server'

const EMAIL_TO_FIND = 'emichaelray+prodcontributor@gmail.com'

async function findUser() {
  console.log(`🔍 Searching Clerk for: ${EMAIL_TO_FIND}\n`)

  const client = await clerkClient()

  try {
    const { data: users } = await client.users.getUserList({
      emailAddress: [EMAIL_TO_FIND],
      limit: 10
    })

    if (!users || users.length === 0) {
      console.log('❌ User NOT found in Clerk')
      return
    }

    console.log(`✅ Found ${users.length} user(s):\n`)

    for (const user of users) {
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId
      )?.emailAddress

      console.log(`   Clerk ID: ${user.id}`)
      console.log(`   Email: ${primaryEmail}`)
      console.log(`   First Name: ${user.firstName || 'N/A'}`)
      console.log(`   Last Name: ${user.lastName || 'N/A'}`)
      console.log(`   Created: ${new Date(user.createdAt).toISOString()}`)
      console.log(`   Password Enabled: ${user.passwordEnabled}`)
      console.log(`   2FA Enabled: ${user.twoFactorEnabled}`)
      console.log()
    }
  } catch (err: unknown) {
    console.log('❌ Error:', (err instanceof Error ? err.message : String(err)))
  }
}

findUser().catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
