/**
 * Force Logout All Clerk Users
 *
 * Revokes all active Clerk sessions to force users to re-authenticate
 * This triggers the migration flow on their next login
 *
 * Usage:
 *   node -r dotenv/config node_modules/.bin/tsx scripts/force-clerk-logout.ts dotenv_config_path=.env.production
 */

import { clerkClient } from '@clerk/nextjs/server'

async function forceLogoutAllUsers() {
  console.log('🔐 Force Logout All Clerk Users')
  console.log('='.repeat(60))
  console.log('⚠️  This will revoke ALL active Clerk sessions')
  console.log('   Users will need to re-authenticate on next visit')
  console.log('='.repeat(60))
  console.log()

  const client = await clerkClient()
  let offset = 0
  const limit = 100
  let totalUsers = 0
  let totalSessions = 0
  let errors = 0

  while (true) {
    console.log(`\n📄 Fetching users (offset: ${offset}, limit: ${limit})...`)

    const { data: users, totalCount } = await client.users.getUserList({
      limit,
      offset
    })

    if (!users || users.length === 0) {
      console.log('   No more users to process')
      break
    }

    console.log(`   Found ${users.length} users in this batch`)
    console.log(`   Total users in Clerk: ${totalCount}`)

    for (const user of users) {
      const primaryEmail =
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
        'unknown'

      try {
        // Get all sessions for this user
        const { data: sessions } = await client.sessions.getSessionList({
          userId: user.id
        })

        if (!sessions || sessions.length === 0) {
          console.log(`   ℹ️  ${primaryEmail} - No active sessions`)
          totalUsers++
          continue
        }

        console.log(`   🔄 ${primaryEmail} - Revoking ${sessions.length} session(s)...`)

        // Revoke all sessions
        let revokedCount = 0
        for (const session of sessions) {
          try {
            await client.sessions.revokeSession(session.id)
            revokedCount++
          } catch (err: unknown) {
            console.log(`      ⚠️  Failed to revoke session ${session.id}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        console.log(`   ✅ ${primaryEmail} - Revoked ${revokedCount}/${sessions.length} sessions`)
        totalSessions += revokedCount
        totalUsers++
      } catch (err: unknown) {
        console.log(`   ❌ ${primaryEmail} - Error: ${(err instanceof Error ? err.message : String(err))}`)
        errors++
      }
    }

    offset += limit
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 FORCE LOGOUT COMPLETE')
  console.log('='.repeat(60))
  console.log(`   👥 Users processed: ${totalUsers}`)
  console.log(`   🔐 Sessions revoked: ${totalSessions}`)
  console.log(`   ❌ Errors: ${errors}`)
  console.log('='.repeat(60))
  console.log()
  console.log('✅ All users will be prompted to log in again on next visit')
  console.log('   The migration flow will activate automatically')
}

forceLogoutAllUsers().catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
