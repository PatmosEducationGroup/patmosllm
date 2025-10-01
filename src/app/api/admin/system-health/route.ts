import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withSupabaseAdmin } from '@/lib/supabase'
import { advancedCache } from '@/lib/advanced-cache'
import { testConnection as testPineconeConnection } from '@/lib/pinecone'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_request: NextRequest) {
  try {
    // Check admin authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const startTime = Date.now()

    // Get advanced system metrics including memory system
    const [dbStats, cacheStats, pineconeHealth, memoryHealth] = await Promise.all([
      // Database stats with connection pooling
      withSupabaseAdmin(async (supabase) => {
        const [usersResult, documentsResult, conversationsResult, userContextResult, conversationMemoryResult, topicProgressionResult] = await Promise.all([
          supabase.from('users').select('id, created_at, clerk_id').limit(1000),
          supabase.from('documents').select('id, file_size, created_at').limit(1000),
          supabase.from('conversations').select('id, created_at').limit(1000),
          supabase.from('user_context').select('user_id, updated_at, current_session_topics, topic_familiarity').limit(1000),
          supabase.from('conversation_memory').select('id, created_at, question_intent, user_satisfaction, extracted_topics').limit(1000),
          supabase.from('topic_progression').select('id, topic_name, expertise_level, total_interactions').limit(1000)
        ])
        return { usersResult, documentsResult, conversationsResult, userContextResult, conversationMemoryResult, topicProgressionResult }
      }),
      // Cache performance metrics
      advancedCache.getStats(),
      // Vector database health
      testPineconeConnection(),
      // Memory system health check
      testMemorySystemHealth()
    ])

    const dbResponseTime = Date.now() - startTime

    // Calculate statistics from pooled database results
    const totalUsers = dbStats.usersResult.data?.length || 0
    const activeUsers = dbStats.usersResult.data?.filter(u => !u.clerk_id.startsWith('invited_')).length || 0
    const pendingUsers = totalUsers - activeUsers

    const totalDocuments = dbStats.documentsResult.data?.length || 0
    const totalStorage = dbStats.documentsResult.data?.reduce((sum, doc) => sum + (doc.file_size || 0), 0) || 0

    const totalConversations = dbStats.conversationsResult.data?.length || 0

    // Memory system statistics
    const totalUserContexts = dbStats.userContextResult.data?.length || 0
    const totalConversationMemories = dbStats.conversationMemoryResult.data?.length || 0
    const totalTopicProgressions = dbStats.topicProgressionResult.data?.length || 0

    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const recentUsers = dbStats.usersResult.data?.filter(u => u.created_at > yesterday).length || 0
    const recentDocuments = dbStats.documentsResult.data?.filter(d => d.created_at > yesterday).length || 0
    const recentConversations = dbStats.conversationsResult.data?.filter(c => c.created_at > yesterday).length || 0
    const recentMemories = dbStats.conversationMemoryResult.data?.filter(m => m.created_at > yesterday).length || 0

    // Calculate memory system health metrics
    const memoryMetrics = calculateMemoryMetrics(dbStats.userContextResult.data || [], dbStats.conversationMemoryResult.data || [], dbStats.topicProgressionResult.data || [])

    return NextResponse.json({
      success: true,
      health: {
        database: {
          status: 'healthy',
          responseTime: dbResponseTime,
          connected: true
        },
        cache: {
          ...cacheStats,
          status: cacheStats.hitRate > 30 ? 'optimal' : cacheStats.hitRate > 10 ? 'good' : 'warming-up',
          memoryUsageMB: parseFloat(cacheStats.memoryUsage.toFixed(2))
        },
        vectorDatabase: {
          status: pineconeHealth ? 'healthy' : 'error',
          connected: pineconeHealth
        },
        memorySystem: {
          status: memoryHealth.status,
          responseTime: memoryHealth.responseTime,
          userContexts: totalUserContexts,
          conversationMemories: totalConversationMemories,
          topicProgressions: totalTopicProgressions,
          recent24h: recentMemories,
          coverage: memoryMetrics.coverage,
          averageSatisfaction: memoryMetrics.averageSatisfaction,
          topTopics: memoryMetrics.topTopics.slice(0, 5),
          topIntents: memoryMetrics.topIntents,
          memoryUtilization: memoryMetrics.memoryUtilization
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          pending: pendingUsers,
          recent24h: recentUsers
        },
        documents: {
          total: totalDocuments,
          totalSizeBytes: totalStorage,
          totalSizeMB: parseFloat((totalStorage / (1024 * 1024)).toFixed(2)),
          recent24h: recentDocuments
        },
        conversations: {
          total: totalConversations,
          recent24h: recentConversations
        },
        performance: {
          cacheHitRate: cacheStats.hitRate,
          dbResponseTime: dbResponseTime,
          status: cacheStats.hitRate > 20 ? 'excellent' : 'good'
        },
        system: {
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          version: '2.1.0-serverless-optimized',
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
          features: [
            'Serverless-Optimized Architecture',
            'Advanced Multi-layer Cache',
            'Hybrid Search (Semantic + Keyword)',
            'Intelligent Query Analysis',
            'Optimized Database Indexes',
            'Conversation Memory System',
            'User Context Tracking',
            'Topic Extraction & Learning'
          ]
        }
      }
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'System health check failed',
      health: {
        database: {
          status: 'error',
          responseTime: null,
          connected: false,
          error: ''
        }
      }
    }, { status: 500 })
  }
}

// =================================================================
// MEMORY SYSTEM HEALTH FUNCTIONS
// =================================================================

async function testMemorySystemHealth() {
  const startTime = Date.now()

  try {
    // Test basic memory operations
    await withSupabaseAdmin(async (supabase) => {
      // Test connectivity to all memory tables
      const [contextTest, memoryTest, progressionTest, patternTest] = await Promise.all([
        supabase.from('user_context').select('id').limit(1),
        supabase.from('conversation_memory').select('id').limit(1),
        supabase.from('topic_progression').select('id').limit(1),
        supabase.from('question_patterns').select('id').limit(1)
      ])

      // If any queries fail, throw error
      if (contextTest.error || memoryTest.error || progressionTest.error || patternTest.error) {
        throw new Error('Memory table connectivity test failed')
      }
    })

    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      connected: true
    }
  } catch (error) {
    return {
      status: 'error',
      responseTime: Date.now() - startTime,
      connected: false,
      error: ''
    }
  }
}

function calculateMemoryMetrics(contexts: Array<{
  topic_familiarity: Record<string, {
    level: number;
    interactions: number;
    lastAsked: string;
    commonQuestions: string[];
  }>;
  current_session_topics: string[];
}>, memories: Array<{
  user_satisfaction: number | null;
  extracted_topics: string[];
  question_intent: string;
}>, progressions: Array<{
  expertise_level: number;
  total_interactions: number;
}>) {
  // Calculate memory coverage (% of users with context vs total users)
  const coverage = contexts.length > 0 ? Math.round((contexts.length / Math.max(contexts.length, 1)) * 100) : 0

  // Calculate average user satisfaction
  const satisfactionScores = memories.filter(m => m.user_satisfaction !== null).map(m => m.user_satisfaction as number)
  const averageSatisfaction = satisfactionScores.length > 0
    ? Math.round((satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length) * 100) / 100
    : 0

  // Calculate top topics from all memories
  const allTopics = memories.flatMap(m => m.extracted_topics || [])
  const topicCounts = allTopics.reduce((acc: Record<string, number>, topic: string) => {
    acc[topic] = (acc[topic] || 0) + 1
    return acc
  }, {})
  const topTopics = Object.entries(topicCounts)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }))

  // Calculate top question intents
  const intentCounts = memories.reduce((acc: Record<string, number>, m) => {
    acc[m.question_intent] = (acc[m.question_intent] || 0) + 1
    return acc
  }, {})
  const topIntents = Object.entries(intentCounts)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }))

  // Calculate memory utilization score
  const totalPossibleContexts = contexts.length
  const activeContexts = contexts.filter(c =>
    Object.keys(c.topic_familiarity || {}).length > 0 ||
    (c.current_session_topics && c.current_session_topics.length > 0)
  ).length
  const memoryUtilization = totalPossibleContexts > 0 ? Math.round((activeContexts / totalPossibleContexts) * 100) : 0

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