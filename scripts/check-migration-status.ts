// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { supabaseAdmin } from '../src/lib/supabase'

/**
 * Check migration status for a specific user
 */

async function checkMigrationStatus(email: string) {
  console.log(`🔍 Checking migration status for: ${email}\n`)

  // Check user_migration table
  const { data: migration, error: migrationError } = await supabaseAdmin
    .from('user_migration')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (migrationError) {
    console.error('❌ Error checking migration:', migrationError.message)
    return
  }

  if (!migration) {
    console.log('❌ No migration record found')
    return
  }

  console.log('📊 Migration Record:')
  console.log(`   Email: ${migration.email}`)
  console.log(`   Clerk ID: ${migration.clerk_id}`)
  console.log(`   Supabase ID: ${migration.supabase_id}`)
  console.log(`   Migrated: ${migration.migrated ? '✅ YES' : '❌ NO'}`)
  console.log(`   Created: ${migration.created_at}`)
  console.log(`   Updated: ${migration.updated_at}`)

  // Check if Supabase Auth user exists
  const { data: authUser, error: authError } = await supabaseAdmin.rpc('get_auth_user_id_by_email', {
    p_email: email
  })

  if (authError) {
    console.error('\n❌ Error checking Supabase Auth:', authError.message)
    return
  }

  if (authUser) {
    console.log(`\n✅ Supabase Auth user exists: ${authUser}`)

    // Try to get more details about the auth user
    const { data: userDetails, error: detailsError } = await supabaseAdmin.auth.admin.getUserById(authUser)

    if (!detailsError && userDetails) {
      console.log(`   Email confirmed: ${userDetails.user.email_confirmed_at ? '✅' : '❌'}`)
      console.log(`   Last sign in: ${userDetails.user.last_sign_in_at || 'Never'}`)
      console.log(`   Created: ${userDetails.user.created_at}`)
    }
  } else {
    console.log('\n❌ No Supabase Auth user found')
  }

  // Check users table
  const { data: dbUser, error: dbError } = await supabaseAdmin
    .from('users')
    .select('id, email, clerk_id, role, created_at')
    .eq('email', email)
    .maybeSingle()

  if (dbError) {
    console.error('\n❌ Error checking users table:', dbError.message)
    return
  }

  if (dbUser) {
    console.log('\n📋 Database User Record:')
    console.log(`   ID: ${dbUser.id}`)
    console.log(`   Email: ${dbUser.email}`)
    console.log(`   Clerk ID: ${dbUser.clerk_id}`)
    console.log(`   Role: ${dbUser.role}`)
    console.log(`   Created: ${dbUser.created_at}`)
  } else {
    console.log('\n❌ No user record in users table')
  }
}

// Get email from command line or use default test email
const email = process.argv[2] || 'emichaelray+mtest1@gmail.com'

checkMigrationStatus(email).catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
