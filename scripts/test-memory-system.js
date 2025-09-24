#!/usr/bin/env node

/**
 * Memory System Test Script
 * Tests the conversation memory integration
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

async function testMemorySystem() {
  console.log('🧠 Testing PatmosLLM Memory System...\n')

  try {
    // Test 1: Check if memory tables exist
    console.log('1️⃣ Testing database schema...')

    const tables = ['user_context', 'conversation_memory', 'topic_progression', 'question_patterns']

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1)
      if (error) {
        console.error(`   ❌ ${table} table not accessible: ${error.message}`)
      } else {
        console.log(`   ✅ ${table} table exists and accessible`)
      }
    }

    // Test 2: Check user contexts
    console.log('\n2️⃣ Testing user contexts...')

    const { data: contexts, error: contextError } = await supabase
      .from('user_context')
      .select('user_id, topic_familiarity, question_patterns, updated_at')

    if (contextError) {
      console.error(`   ❌ Error fetching user contexts: ${contextError.message}`)
    } else {
      console.log(`   ✅ Found ${contexts.length} user contexts`)
      if (contexts.length > 0) {
        const recentContext = contexts[0]
        console.log(`   📊 Most recent context updated: ${recentContext.updated_at}`)
        console.log(`   📝 Topics tracked: ${Object.keys(recentContext.topic_familiarity || {}).length}`)
      }
    }

    // Test 3: Check conversation memory
    console.log('\n3️⃣ Testing conversation memory...')

    const { data: memories, error: memoryError } = await supabase
      .from('conversation_memory')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (memoryError) {
      console.error(`   ❌ Error fetching conversation memories: ${memoryError.message}`)
    } else {
      console.log(`   ✅ Found ${memories.length} conversation memories`)
      if (memories.length > 0) {
        const recentMemory = memories[0]
        console.log(`   🕐 Most recent: ${recentMemory.created_at}`)
        console.log(`   🏷️  Intent: ${recentMemory.question_intent}`)
        console.log(`   📚 Topics: ${recentMemory.extracted_topics.join(', ')}`)
        if (recentMemory.user_satisfaction) {
          console.log(`   ⭐ Satisfaction: ${recentMemory.user_satisfaction}/5`)
        }
      }
    }

    // Test 4: Topic analysis
    console.log('\n4️⃣ Testing topic analysis...')

    if (memories && memories.length > 0) {
      const allTopics = memories.flatMap(m => m.extracted_topics)
      const topicCounts = allTopics.reduce((acc, topic) => {
        acc[topic] = (acc[topic] || 0) + 1
        return acc
      }, {})

      const sortedTopics = Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)

      console.log('   📈 Top topics:')
      sortedTopics.forEach(([topic, count]) => {
        console.log(`      • ${topic}: ${count} times`)
      })
    }

    // Test 5: Memory system health
    console.log('\n5️⃣ Testing memory system health...')

    const healthChecks = await Promise.all([
      // Check for recent memory updates
      supabase
        .from('conversation_memory')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

      // Check for topic progression records
      supabase
        .from('topic_progression')
        .select('*')
        .limit(5),

      // Check for question patterns
      supabase
        .from('question_patterns')
        .select('*')
        .limit(5)
    ])

    const [recentMemories, topicProgressions, questionPatterns] = healthChecks

    console.log(`   📅 Recent memories (24h): ${recentMemories.data?.length || 0}`)
    console.log(`   📊 Topic progressions: ${topicProgressions.data?.length || 0}`)
    console.log(`   🔍 Question patterns: ${questionPatterns.data?.length || 0}`)

    // Summary
    console.log('\n✅ Memory System Test Complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 Summary:`)
    console.log(`   • User contexts: ${contexts?.length || 0}`)
    console.log(`   • Conversation memories: ${memories?.length || 0}`)
    console.log(`   • Recent activity: ${recentMemories.data?.length || 0} in 24h`)
    console.log(`   • System status: ${contexts?.length > 0 && memories?.length > 0 ? '🟢 OPERATIONAL' : '🟡 INITIALIZING'}`)

    if (contexts?.length === 0 || memories?.length === 0) {
      console.log('\n💡 Note: Memory data will populate as users interact with the chat system.')
    }

  } catch (error) {
    console.error('\n❌ Memory system test failed:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  testMemorySystem()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test script error:', error)
      process.exit(1)
    })
}

module.exports = { testMemorySystem }