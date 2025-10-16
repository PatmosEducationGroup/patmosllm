import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

/**
 * API Route: User Statistics
 * GET /api/user/stats
 *
 * Returns aggregated statistics for the authenticated user:
 * - Total conversations
 * - Total questions (messages in conversations)
 * - Total system documents available
 * - Account age and creation date
 * - Last active timestamp
 * - Average questions per day
 * - Most active day of the week
 */
export async function GET(_request: NextRequest) {
  try {
    // Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const stats = await withSupabaseAdmin(async (supabase) => {
      // Fetch user account details
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('created_at, updated_at')
        .eq('id', user.id)
        .single()

      if (userError) {
        throw new Error(`Failed to fetch user data: ${userError.message}`)
      }

      // Count total conversations
      const { count: conversationsCount, error: conversationsError } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (conversationsError) {
        throw new Error(`Failed to count conversations: ${conversationsError.message}`)
      }

      // Get conversations to count questions
      // Note: conversations table uses 'question' and 'answer' fields, not 'messages'
      const { data: conversations, error: conversationsDataError } = await supabase
        .from('conversations')
        .select('question, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (conversationsDataError) {
        throw new Error(`Failed to fetch conversations: ${conversationsDataError.message}`)
      }

      // Count total system documents (all documents in the system)
      const { count: documentsCount, error: documentsError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })

      if (documentsError) {
        throw new Error(`Failed to count documents: ${documentsError.message}`)
      }

      // Calculate question statistics
      // Each conversation record = 1 question (from the user)
      const totalQuestions = conversations?.length || 0
      const dayOfWeekCounts: Record<string, number> = {
        Sunday: 0,
        Monday: 0,
        Tuesday: 0,
        Wednesday: 0,
        Thursday: 0,
        Friday: 0,
        Saturday: 0
      }

      conversations?.forEach((conv) => {
        // Track day of week for this conversation
        if (conv.created_at) {
          const dayName = new Date(conv.created_at).toLocaleDateString('en-US', { weekday: 'long' })
          dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1
        }
      })

      // Find most active day
      let mostActiveDay = 'N/A'
      let maxCount = 0
      Object.entries(dayOfWeekCounts).forEach(([day, count]) => {
        if (count > maxCount) {
          maxCount = count
          mostActiveDay = day
        }
      })

      // Calculate average questions per day
      const accountCreated = new Date(userData.created_at)
      const now = new Date()
      const daysSinceCreation = Math.max(1, Math.floor((now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)))
      const avgQuestionsPerDay = totalQuestions / daysSinceCreation

      // Get last active timestamp (most recent conversation creation)
      const lastActiveAt = conversations && conversations.length > 0
        ? conversations[0].created_at
        : userData.updated_at

      return {
        totalConversations: conversationsCount || 0,
        totalQuestions,
        totalSystemDocuments: documentsCount || 0,
        accountCreatedAt: userData.created_at,
        lastActiveAt,
        avgQuestionsPerDay: Math.round(avgQuestionsPerDay * 10) / 10, // Round to 1 decimal
        mostActiveDay
      }
    })

    return NextResponse.json(stats)

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'GET /api/user/stats',
      userId: 'unknown'
    })

    return NextResponse.json(
      { error: 'Failed to fetch user statistics' },
      { status: 500 }
    )
  }
}
