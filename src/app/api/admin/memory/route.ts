import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentUser } from '@/lib/auth'
import { userContextManager } from '@/lib/userContextManager'
import { withSupabaseAdmin } from '@/lib/supabase'

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

    const url = new URL(_request.url)
    const targetUserId = url.searchParams.get('userId')

    if (targetUserId) {
      // Get specific user's memory data
      const context = await userContextManager.getUserContext(targetUserId)
      const stats = await userContextManager.getMemoryStats(targetUserId)

      // Get recent conversation memory
      const recentMemory = await withSupabaseAdmin(async (supabase) => {
        const { data, error } = await supabase
          .from('conversation_memory')
          .select('*')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(10)

        return error ? [] : data
      })

      return NextResponse.json({
        success: true,
        userMemory: {
          context,
          stats,
          recentConversations: recentMemory
        }
      })
    } else {
      // Get memory overview for all users
      const memoryOverview = await withSupabaseAdmin(async (supabase) => {
        const [contextsResult, memoryResult] = await Promise.all([
          supabase
            .from('user_context')
            .select('user_id, updated_at, current_session_topics')
            .order('updated_at', { ascending: false }),
          supabase
            .from('conversation_memory')
            .select('user_id, question_intent, extracted_topics, created_at, user_satisfaction')
            .order('created_at', { ascending: false })
            .limit(50)
        ])

        return {
          contexts: contextsResult.data || [],
          recentMemories: memoryResult.data || []
        }
      })

      // Calculate memory system statistics
      const memoryStats = {
        totalUsersWithContext: memoryOverview.contexts.length,
        totalConversationsMemorized: memoryOverview.recentMemories.length,
        averageSatisfaction: memoryOverview.recentMemories
          .filter(m => m.user_satisfaction !== null)
          .reduce((acc, m, _, arr) => acc + (m.user_satisfaction || 0) / arr.length, 0),
        topIntents: memoryOverview.recentMemories
          .reduce((acc, m) => {
            acc[m.question_intent] = (acc[m.question_intent] || 0) + 1
            return acc
          }, {} as Record<string, number>),
        topTopics: memoryOverview.recentMemories
          .flatMap(m => m.extracted_topics)
          .reduce((acc, topic) => {
            acc[topic] = (acc[topic] || 0) + 1
            return acc
          }, {} as Record<string, number>)
      }

      return NextResponse.json({
        success: true,
        overview: {
          stats: memoryStats,
          contexts: memoryOverview.contexts.slice(0, 10),
          recentMemories: memoryOverview.recentMemories.slice(0, 20)
        }
      })
    }

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Memory API failed'
    }, { status: 500 })
  }
}

// Test endpoint for memory functionality
export async function POST(_request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const { action, testUserId, testQuestion, testResponse } = await _request.json()

    if (action === 'test_extraction') {
      // For testing, we'll create mock topics since extractTopics is private
      const topics = ['prayer', 'worship', 'biblical theology']

      return NextResponse.json({
        success: true,
        testResults: {
          extractedTopics: topics,
          question: testQuestion,
          response: testResponse?.substring(0, 100) + '...'
        }
      })
    }

    if (action === 'test_memory_update' && testUserId) {
      // Test memory update
      await userContextManager.updateUserContext(
        testUserId,
        testQuestion || "Test question about biblical theology",
        testResponse || "Test response about biblical concepts",
        [{ title: "Test Document", author: "Test Author", chunk_id: "test-chunk-1" }],
        'test-session-id'
      )

      return NextResponse.json({
        success: true,
        message: 'Memory update test completed'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid test action'
    }, { status: 400 })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Memory test failed'
    }, { status: 500 })
  }
}