/**
 * Test Script: Donation Tracking End-to-End
 *
 * Tests the complete donation tracking flow:
 * 1. Database tables exist
 * 2. Insert test usage log
 * 3. Manually trigger rollup (test cron logic)
 * 4. Fetch donation estimate
 *
 * Usage:
 *   npx tsx scripts/test-donation-tracking.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅' : '❌')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testDonationTracking() {
  console.log('🧪 Testing Donation Tracking System...\n')

  // Step 1: Verify tables exist
  console.log('1️⃣  Checking if tables exist...')
  try {
    const { data: tables, error } = await supabase
      .from('daily_donation_estimates')
      .select('user_id')
      .limit(1)

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows (table exists but empty)
      throw error
    }
    console.log('   ✅ daily_donation_estimates table exists')
  } catch (error) {
    console.error('   ❌ Table check failed:', error)
    return
  }

  // Step 2: Get first user for testing (active user with auth_user_id)
  console.log('\n2️⃣  Finding test user...')
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, auth_user_id, email')
    .not('auth_user_id', 'is', null)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (userError || !user) {
    console.error('   ❌ No active users found. Please create a user first.')
    return
  }
  if (!user.auth_user_id) {
    console.error('   ❌ User has null auth_user_id. Please use a properly migrated user.')
    return
  }
  console.log(`   ✅ Found user: ${user.email} (${user.id})`)

  // Step 3: Insert test usage logs
  console.log('\n3️⃣  Inserting test usage logs...')
  const testLogs = [
    {
      user_id: user.id,
      service: 'openai',
      total_tokens: 2500,
      operation_count: 1,
      estimated_cost_usd: 0.001375, // 2500 tokens * $0.005/10k * 1.10
      request_id: crypto.randomUUID()
    },
    {
      user_id: user.id,
      service: 'voyage',
      total_tokens: 1000,
      operation_count: 1,
      estimated_cost_usd: 0.00055, // 1000 tokens * $0.005/10k * 1.10
      request_id: crypto.randomUUID()
    },
    {
      user_id: user.id,
      service: 'pinecone',
      total_tokens: 0,
      operation_count: 1,
      estimated_cost_usd: 0.00055, // 100 equiv tokens * $0.005/10k * 1.10
      request_id: crypto.randomUUID()
    },
    {
      user_id: user.id,
      service: 'resend',
      total_tokens: 0,
      operation_count: 1,
      estimated_cost_usd: 0.00055, // 100 equiv tokens * $0.005/10k * 1.10
      request_id: crypto.randomUUID()
    }
  ]

  const { error: insertError } = await supabase
    .from('api_usage_internal_log')
    .insert(testLogs)

  if (insertError) {
    console.error('   ❌ Failed to insert test logs:', insertError)
    return
  }
  console.log('   ✅ Inserted 4 test usage logs')
  console.log(`      - OpenAI: 2500 tokens ($0.001375)`)
  console.log(`      - Voyage: 1000 tokens ($0.00055)`)
  console.log(`      - Pinecone: 1 query ($0.00055)`)
  console.log(`      - Resend: 1 email ($0.00055)`)
  console.log(`      Total expected: $0.00302`)

  // Step 4: Verify logs were inserted
  console.log('\n4️⃣  Verifying logs in database...')
  const { data: logs, error: logsError } = await supabase
    .from('api_usage_internal_log')
    .select('service, total_tokens, estimated_cost_usd')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(4)

  if (logsError || !logs) {
    console.error('   ❌ Failed to fetch logs:', logsError)
    return
  }
  console.log(`   ✅ Found ${logs.length} logs in database`)

  // Step 5: Manually trigger rollup (test cron logic)
  console.log('\n5️⃣  Manually triggering rollup (simulating cron job)...')
  const { error: rollupError } = await supabase.rpc('sql', {
    query: `
      INSERT INTO daily_donation_estimates (
        user_id,
        auth_user_id,
        current_month_estimate_usd,
        total_tokens_used,
        total_operations,
        last_updated
      )
      SELECT
        user_id,
        (SELECT auth_user_id FROM users WHERE id = user_id LIMIT 1) AS auth_user_id,
        ROUND(SUM(estimated_cost_usd)::NUMERIC, 2) AS current_month_estimate_usd,
        SUM(total_tokens) AS total_tokens_used,
        SUM(operation_count) AS total_operations,
        NOW() AS last_updated
      FROM api_usage_internal_log
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
        AND user_id = '${user.id}'
      GROUP BY user_id
      ON CONFLICT (user_id)
      DO UPDATE SET
        current_month_estimate_usd = EXCLUDED.current_month_estimate_usd,
        total_tokens_used = EXCLUDED.total_tokens_used,
        total_operations = EXCLUDED.total_operations,
        last_updated = NOW();
    `
  })

  if (rollupError) {
    console.error('   ⚠️  RPC method not available, trying direct insert...')

    // Alternative: Direct insert/upsert
    const { data: aggregation } = await supabase
      .from('api_usage_internal_log')
      .select('user_id, estimated_cost_usd, total_tokens, operation_count')
      .eq('user_id', user.id)
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

    if (aggregation) {
      const totalCost = aggregation.reduce((sum, log) => sum + Number(log.estimated_cost_usd), 0)
      const totalTokens = aggregation.reduce((sum, log) => sum + Number(log.total_tokens), 0)
      const totalOps = aggregation.reduce((sum, log) => sum + Number(log.operation_count), 0)

      const { error: upsertError } = await supabase
        .from('daily_donation_estimates')
        .upsert({
          user_id: user.id,
          auth_user_id: user.auth_user_id,
          current_month_estimate_usd: Number(totalCost.toFixed(2)),
          total_tokens_used: totalTokens,
          total_operations: totalOps,
          last_updated: new Date().toISOString()
        })

      if (upsertError) {
        console.error('   ❌ Failed to upsert estimate:', upsertError)
        return
      }
      console.log('   ✅ Rollup completed via direct upsert')
    }
  } else {
    console.log('   ✅ Rollup completed successfully')
  }

  // Step 6: Fetch donation estimate
  console.log('\n6️⃣  Fetching donation estimate...')
  const { data: estimate, error: estimateError } = await supabase
    .from('daily_donation_estimates')
    .select('current_month_estimate_usd, total_tokens_used, total_operations, last_updated')
    .eq('user_id', user.id)
    .single()

  if (estimateError || !estimate) {
    console.error('   ❌ Failed to fetch estimate:', estimateError)
    return
  }

  console.log('   ✅ Donation estimate retrieved:')
  console.log(`      - Monthly cost: $${estimate.current_month_estimate_usd}`)
  console.log(`      - Total tokens: ${estimate.total_tokens_used}`)
  console.log(`      - Total operations: ${estimate.total_operations}`)
  console.log(`      - Last updated: ${estimate.last_updated}`)

  // Step 7: Test API endpoint (if server is running)
  console.log('\n7️⃣  Testing API endpoint (requires dev server running)...')
  try {
    const response = await fetch('http://localhost:3000/api/user/donation-estimate', {
      headers: {
        'Cookie': `__session=test` // Replace with actual session if needed
      }
    })

    if (response.ok) {
      const data = await response.json()
      console.log('   ✅ API response:', JSON.stringify(data, null, 2))
    } else {
      console.log(`   ⚠️  API returned ${response.status} (may need authentication)`)
    }
  } catch (error) {
    console.log('   ⚠️  API endpoint test skipped (server not running or auth required)')
  }

  console.log('\n✅ All tests completed!')
  console.log('\n📋 Next steps:')
  console.log('   1. Add trackUsage() calls to 6-8 code locations')
  console.log('   2. Create DonationEstimateBadge component')
  console.log('   3. Create /settings/donate page')
  console.log('   4. Test with real usage in development')
}

testDonationTracking().catch(console.error)
