#!/usr/bin/env node
/**
 * Test Rate Limiting - Tests both local and production rate limiting
 *
 * Usage:
 *   node scripts/test-rate-limiting.js                    # Test production
 *   node scripts/test-rate-limiting.js http://localhost:3000  # Test local
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'https://www.multiplytools.app';
const isLocal = BASE_URL.includes('localhost');

console.log(`\n${'='.repeat(60)}`);
console.log(`🧪 Testing Rate Limiting on: ${BASE_URL}`);
console.log(`${'='.repeat(60)}\n`);

// Test configuration
const TESTS = [
  {
    name: 'Chat Rate Limit (30 per 5min for regular users)',
    endpoint: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Test message',
      conversationId: null
    }),
    expectedLimit: 30,
    requestsToSend: 5 // Send 5 requests to test
  }
];

/**
 * Make HTTP/HTTPS request
 */
function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Run a single test
 */
async function runTest(test) {
  console.log(`\n📍 Test: ${test.name}`);
  console.log(`   Endpoint: ${test.endpoint}`);
  console.log(`   Expected limit: ${test.expectedLimit} requests\n`);

  const url = `${BASE_URL}${test.endpoint}`;
  const results = [];

  for (let i = 1; i <= test.requestsToSend; i++) {
    try {
      const response = await makeRequest(url, {
        method: test.method,
        headers: test.headers
      }, test.body);

      const statusCode = response.statusCode;
      const isRateLimited = statusCode === 429;

      console.log(`   Request ${i}: ${isRateLimited ? '🚫 RATE LIMITED' : '✅ OK'} (${statusCode})`);

      results.push({
        requestNumber: i,
        statusCode,
        isRateLimited
      });

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`   Request ${i}: ❌ ERROR - ${error.message}`);
      results.push({
        requestNumber: i,
        error: error.message
      });
    }
  }

  // Summary
  const successCount = results.filter(r => r.statusCode && r.statusCode < 400).length;
  const rateLimitedCount = results.filter(r => r.isRateLimited).length;
  const errorCount = results.filter(r => r.error).length;

  console.log(`\n   📊 Results:`);
  console.log(`      ✅ Successful: ${successCount}`);
  console.log(`      🚫 Rate Limited: ${rateLimitedCount}`);
  console.log(`      ❌ Errors: ${errorCount}`);

  return results;
}

/**
 * Check if Upstash is configured
 */
async function checkUpstashStatus() {
  console.log('\n🔍 Checking Upstash Configuration...\n');

  try {
    // Try to make a simple request and check response headers
    const url = `${BASE_URL}/api/chat`;
    const response = await makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({ message: 'test' }));

    // Check for Upstash-specific headers or error messages
    const body = response.body;

    console.log(`   Status: ${response.statusCode}`);

    if (response.statusCode === 401) {
      console.log(`   ✅ API is working (authentication required - expected)`);
    }

    // In production, we can't directly check Upstash status without auth,
    // but we can infer from rate limiting behavior
    console.log(`   ℹ️  To verify Upstash: Check Vercel logs for "Upstash Redis configured"`);

  } catch (error) {
    console.error(`   ❌ Error checking status: ${error.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check Upstash status
    await checkUpstashStatus();

    // Run tests
    for (const test of TESTS) {
      await runTest(test);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Rate Limiting Test Complete`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`💡 Tips:`);
    console.log(`   - To test locally: node scripts/test-rate-limiting.js http://localhost:3000`);
    console.log(`   - To test production: node scripts/test-rate-limiting.js`);
    console.log(`   - Check Vercel logs for: "Upstash Redis configured"`);
    console.log(`   - Without auth, you'll see 401 errors (expected)`);
    console.log(`   - With valid session, you should see rate limiting after ${TESTS[0].expectedLimit} requests\n`);

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

main();
