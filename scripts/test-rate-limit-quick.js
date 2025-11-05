#!/usr/bin/env node
/**
 * Quick Rate Limit Test - Fires rapid requests to test rate limiting
 *
 * Usage:
 *   node scripts/test-rate-limit-quick.js                           # Test production
 *   node scripts/test-rate-limit-quick.js http://localhost:3000     # Test local
 *   node scripts/test-rate-limit-quick.js --requests 35             # Custom count
 */

const https = require('https');
const http = require('http');

// Parse arguments
let BASE_URL = 'https://www.multiplytools.app';
let NUM_REQUESTS = 35; // Enough to hit the 30/5min limit

process.argv.forEach((arg, index) => {
  if (arg.startsWith('http')) {
    BASE_URL = arg;
  }
  if (arg === '--requests' && process.argv[index + 1]) {
    NUM_REQUESTS = parseInt(process.argv[index + 1]);
  }
});

console.log(`\n${'='.repeat(70)}`);
console.log(`🧪 Quick Rate Limit Test`);
console.log(`${'='.repeat(70)}`);
console.log(`Target: ${BASE_URL}`);
console.log(`Requests: ${NUM_REQUESTS}`);
console.log(`Expected limit: 30 requests per 5 minutes (regular users)`);
console.log(`${'='.repeat(70)}\n`);

/**
 * Make a quick request (don't wait for streaming response)
 */
function makeQuickRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();

    const req = client.request(url, options, (res) => {
      const duration = Date.now() - startTime;

      // Don't wait for body - just check status code and headers
      res.destroy(); // Close connection immediately

      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        duration
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    // Set a timeout to prevent hanging
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Run the test
 */
async function runTest() {
  const url = `${BASE_URL}/api/chat`;
  const results = [];
  let firstRateLimitAt = null;

  console.log(`📡 Sending ${NUM_REQUESTS} rapid requests...\n`);

  const startTime = Date.now();

  for (let i = 1; i <= NUM_REQUESTS; i++) {
    try {
      const response = await makeQuickRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': process.env.TEST_COOKIE || '' // Can set this for authenticated tests
        }
      }, JSON.stringify({
        message: `Test message ${i}`,
        conversationId: null
      }));

      const statusCode = response.statusCode;
      const isRateLimited = statusCode === 429;
      const isAuth = statusCode === 401;

      if (isRateLimited && !firstRateLimitAt) {
        firstRateLimitAt = i;
      }

      // Visual indicator
      let indicator = '✅';
      if (isRateLimited) indicator = '🚫';
      if (isAuth) indicator = '🔒';
      if (statusCode >= 500) indicator = '❌';

      console.log(`  ${String(i).padStart(3, ' ')}. ${indicator} ${statusCode} ${isRateLimited ? '(RATE LIMITED)' : isAuth ? '(AUTH REQUIRED)' : ''} - ${response.duration}ms`);

      results.push({
        requestNumber: i,
        statusCode,
        isRateLimited,
        isAuth,
        duration: response.duration
      });

      // No delay - fire as fast as possible

    } catch (error) {
      console.log(`  ${String(i).padStart(3, ' ')}. ❌ ERROR: ${error.message}`);
      results.push({
        requestNumber: i,
        error: error.message
      });
    }
  }

  const totalTime = Date.now() - startTime;

  // Calculate statistics
  const successCount = results.filter(r => r.statusCode && r.statusCode === 200).length;
  const rateLimitedCount = results.filter(r => r.isRateLimited).length;
  const authRequiredCount = results.filter(r => r.isAuth).length;
  const errorCount = results.filter(r => r.error).length;
  const avgDuration = results
    .filter(r => r.duration)
    .reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.duration).length;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 Test Results`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Total Requests:    ${NUM_REQUESTS}`);
  console.log(`✅ Success (200):   ${successCount}`);
  console.log(`🚫 Rate Limited:   ${rateLimitedCount}`);
  console.log(`🔒 Auth Required:  ${authRequiredCount}`);
  console.log(`❌ Errors:         ${errorCount}`);
  console.log(`⏱️  Avg Duration:   ${avgDuration.toFixed(0)}ms`);
  console.log(`⏱️  Total Time:     ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`📍 First Rate Limit: Request #${firstRateLimitAt || 'N/A'}`);
  console.log(`${'='.repeat(70)}\n`);

  // Interpretation
  console.log(`💡 Interpretation:`);
  if (authRequiredCount > 0 && successCount === 0) {
    console.log(`   ⚠️  All requests required authentication`);
    console.log(`   💡 To test with auth, set TEST_COOKIE environment variable:`);
    console.log(`      1. Login to ${BASE_URL}`);
    console.log(`      2. Open DevTools → Application → Cookies`);
    console.log(`      3. Copy the session cookie`);
    console.log(`      4. Run: TEST_COOKIE="your-cookie" node scripts/test-rate-limit-quick.js\n`);
  } else if (rateLimitedCount > 0) {
    console.log(`   ✅ Rate limiting is WORKING!`);
    console.log(`   📊 Requests were rate limited after #${firstRateLimitAt}`);

    if (firstRateLimitAt <= 30) {
      console.log(`   ✅ Limit is around 30 requests (as expected for regular users)`);
    } else if (firstRateLimitAt > 30 && firstRateLimitAt <= 150) {
      console.log(`   📈 Limit is higher than 30 - you might be a CONTRIBUTOR (150 limit)`);
    } else if (firstRateLimitAt > 150) {
      console.log(`   👑 Limit is very high - you might be an ADMIN or SUPER_ADMIN`);
    }
    console.log(``);
  } else if (successCount > 30) {
    console.log(`   ⚠️  No rate limiting detected after ${NUM_REQUESTS} requests`);
    console.log(`   🔍 Possible reasons:`);
    console.log(`      - Rate limiting not configured (check Upstash credentials)`);
    console.log(`      - You're an admin/super_admin with high limits`);
    console.log(`      - Your IP is in RATE_LIMIT_EXEMPT_USERS\n`);
  } else {
    console.log(`   ℹ️  Test completed but no definitive rate limiting observed`);
    console.log(`   💡 Try increasing --requests to see rate limiting\n`);
  }
}

// Run the test
runTest().catch(error => {
  console.error(`\n❌ Test failed: ${error.message}`);
  process.exit(1);
});
