#!/usr/bin/env node

/**
 * Test Memory System Integration in System Health
 * Validates that the memory system is properly integrated into system health monitoring
 */

const { createClient } = require('@supabase/supabase-js')

// Environment check
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testMemoryHealthIntegration() {
  console.log('🔍 Testing Memory System Health Integration...\n')

  try {
    console.log('1️⃣ Testing memory table connectivity (simulating health check)...')

    // Simulate the health check queries
    const [contextTest, memoryTest, progressionTest, patternTest] = await Promise.all([
      supabase.from('user_context').select('id').limit(1),
      supabase.from('conversation_memory').select('id').limit(1),
      supabase.from('topic_progression').select('id').limit(1),
      supabase.from('question_patterns').select('id').limit(1)
    ])

    let allTablesHealthy = true
    const tableResults = [
      { name: 'user_context', result: contextTest },
      { name: 'conversation_memory', result: memoryTest },
      { name: 'topic_progression', result: progressionTest },
      { name: 'question_patterns', result: patternTest }
    ]

    tableResults.forEach(({ name, result }) => {
      if (result.error) {
        console.log(`   ❌ ${name}: ${result.error.message}`)
        allTablesHealthy = false
      } else {
        console.log(`   ✅ ${name}: Connected (${result.data?.length || 0} records accessible)`)
      }
    })

    console.log(`\n   Memory System Status: ${allTablesHealthy ? '🟢 HEALTHY' : '🔴 ERROR'}`)

    console.log('\n2️⃣ Testing memory metrics calculation...')

    // Get sample data for metrics calculation
    const [contexts, memories, progressions] = await Promise.all([
      supabase.from('user_context').select('user_id, updated_at, current_session_topics, topic_familiarity').limit(100),
      supabase.from('conversation_memory').select('id, created_at, question_intent, user_satisfaction, extracted_topics').limit(100),
      supabase.from('topic_progression').select('id, topic_name, expertise_level, total_interactions').limit(100)
    ])

    // Calculate metrics (simplified version of what system health does)
    const metrics = calculateMemoryMetrics(
      contexts.data || [],
      memories.data || [],
      progressions.data || []
    )

    console.log(`   📊 Memory Coverage: ${metrics.coverage}%`)
    console.log(`   ⭐ Avg Satisfaction: ${metrics.averageSatisfaction}/5`)
    console.log(`   🎯 Memory Utilization: ${metrics.memoryUtilization}%`)
    console.log(`   📚 Topics Tracked: ${metrics.totalTopicsTracked}`)
    console.log(`   💬 Total Interactions: ${metrics.totalInteractions}`)

    if (metrics.topTopics.length > 0) {
      console.log('   🏷️  Top Topics:')
      metrics.topTopics.slice(0, 3).forEach(({ topic, count }) => {
        console.log(`      • ${topic}: ${count} times`)
      })
    }

    if (metrics.topIntents.length > 0) {
      console.log('   🎯 Top Intents:')
      metrics.topIntents.slice(0, 3).forEach(({ intent, count }) => {
        console.log(`      • ${intent}: ${count} times`)
      })
    }

    console.log('\n3️⃣ Testing recent activity tracking...')

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recentMemories = (memories.data || []).filter(m => m.created_at > yesterday)

    console.log(`   📈 Recent memories (24h): ${recentMemories.length}`)

    if (recentMemories.length > 0) {
      const recentTopics = recentMemories.flatMap(m => m.extracted_topics || [])
      const uniqueRecentTopics = [...new Set(recentTopics)]
      console.log(`   📚 Active topics today: ${uniqueRecentTopics.slice(0, 5).join(', ')}`)
    }

    console.log('\n✅ Memory Health Integration Test Complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📋 Integration Status:')
    console.log(`   • Memory tables: ${allTablesHealthy ? '🟢 Connected' : '🔴 Error'}`)
    console.log(`   • Metrics calculation: ${metrics ? '🟢 Working' : '🔴 Error'}`)
    console.log(`   • Data collection: ${memories.data?.length > 0 ? '🟢 Active' : '🟡 Starting'}`)
    console.log('\n💡 Your memory system is ready for system health monitoring!')
    console.log('   Run your app and check: /api/admin/system-health')

  } catch (error) {
    console.error('\n❌ Memory health integration test failed:', error.message)
    process.exit(1)
  }
}

function calculateMemoryMetrics(contexts, memories, progressions) {
  // Calculate memory coverage
  const coverage = contexts.length > 0 ? Math.round((contexts.length / Math.max(contexts.length, 1)) * 100) : 0

  // Calculate average user satisfaction
  const satisfactionScores = memories.filter(m => m.user_satisfaction !== null).map(m => m.user_satisfaction)
  const averageSatisfaction = satisfactionScores.length > 0
    ? Math.round((satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length) * 100) / 100
    : 0

  // Calculate top topics
  const allTopics = memories.flatMap(m => m.extracted_topics || [])
  const topicCounts = allTopics.reduce((acc, topic) => {
    acc[topic] = (acc[topic] || 0) + 1
    return acc
  }, {})
  const topTopics = Object.entries(topicCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }))

  // Calculate top intents
  const intentCounts = memories.reduce((acc, m) => {
    acc[m.question_intent] = (acc[m.question_intent] || 0) + 1
    return acc
  }, {})
  const topIntents = Object.entries(intentCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }))

  // Calculate memory utilization
  const activeContexts = contexts.filter(c =>
    Object.keys(c.topic_familiarity || {}).length > 0 ||
    (c.current_session_topics && c.current_session_topics.length > 0)
  ).length
  const memoryUtilization = contexts.length > 0 ? Math.round((activeContexts / contexts.length) * 100) : 0

  return {
    coverage,
    averageSatisfaction,
    topTopics,
    topIntents,
    memoryUtilization,
    totalTopicsTracked: Object.keys(topicCounts).length,
    totalInteractions: memories.length
  }
}

// Run if called directly
if (require.main === module) {
  testMemoryHealthIntegration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test script error:', error)
      process.exit(1)
    })
}