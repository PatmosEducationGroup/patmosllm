import { supabaseAdmin } from '../src/lib/supabase'

async function test() {
  console.log('Testing Supabase Admin connection...\n')

  // Test 1: Can we connect?
  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('count')
    .limit(1)

  console.log('Test 1 - Query users table:', usersError ? '❌ FAILED' : '✅ SUCCESS')
  if (usersError) console.error('Error:', usersError)

  // Test 2: Can we access auth.users?
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1
  })

  console.log('Test 2 - List auth users:', authError ? '❌ FAILED' : '✅ SUCCESS')
  if (authError) console.error('Error:', authError)

  // Test 3: Can we get a specific user?
  const { data: specificUser, error: specificError } = await supabaseAdmin.auth.admin.getUserById(
    '1bd4030e-7644-4dcc-8765-5fc605cc5f60'
  )

  console.log('Test 3 - Get specific user:', specificError ? '❌ FAILED' : '✅ SUCCESS')
  if (specificError) console.error('Error:', specificError)

  console.log('\nEnvironment check:')
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing')
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing')
}

test().catch(console.error)
