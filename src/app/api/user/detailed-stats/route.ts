import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

/**
 * API Route: Detailed User Statistics
 * GET /api/user/detailed-stats
 *
 * Returns comprehensive activity statistics:
 * - Conversation metrics (total, weekly, monthly, avg length)
 * - Question metrics (total, weekly, monthly, avg per conversation)
 * - Activity patterns (active days, streaks, daily averages)
 * - Top topics from conversation analysis
 * - Recent 7-day activity
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const stats = await withSupabaseAdmin(async (supabase) => {
      // Fetch all conversations with dates
      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('id, question, answer, created_at, session_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (conversationsError) {
        throw new Error(`Failed to fetch conversations: ${conversationsError.message}`)
      }

      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      // Calculate conversation metrics
      const totalConversations = conversations?.length || 0
      const conversationsThisWeek = conversations?.filter(c =>
        new Date(c.created_at) >= oneWeekAgo
      ).length || 0
      const conversationsThisMonth = conversations?.filter(c =>
        new Date(c.created_at) >= oneMonthAgo
      ).length || 0

      // Group by session to calculate avg conversation length
      const sessionGroups = new Map<string, number>()
      conversations?.forEach(conv => {
        const sessionId = conv.session_id
        sessionGroups.set(sessionId, (sessionGroups.get(sessionId) || 0) + 1)
      })
      const avgConversationLength = sessionGroups.size > 0
        ? Math.round((totalConversations / sessionGroups.size) * 10) / 10
        : 0

      // Calculate question metrics
      const totalQuestions = totalConversations // Each conversation = 1 question
      const questionsThisWeek = conversationsThisWeek
      const questionsThisMonth = conversationsThisMonth
      const avgQuestionsPerConversation = avgConversationLength

      // Calculate activity metrics
      const uniqueDays = new Set<string>()
      conversations?.forEach(conv => {
        const date = new Date(conv.created_at)
        uniqueDays.add(date.toISOString().split('T')[0])
      })
      const totalDaysActive = uniqueDays.size

      // Calculate streaks
      const sortedDates = Array.from(uniqueDays).sort()
      let currentStreak = 0
      let longestStreak = 0
      let tempStreak = 1

      // Calculate current streak
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      if (sortedDates.includes(today) || sortedDates.includes(yesterday)) {
        for (let i = sortedDates.length - 1; i >= 0; i--) {
          const currentDate = new Date(sortedDates[i])
          const prevDate = i > 0 ? new Date(sortedDates[i - 1]) : null

          if (prevDate) {
            const dayDiff = Math.round((currentDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000))
            if (dayDiff === 1) {
              currentStreak++
            } else {
              break
            }
          } else {
            currentStreak++
          }
        }
      }

      // Calculate longest streak
      for (let i = 1; i < sortedDates.length; i++) {
        const currentDate = new Date(sortedDates[i])
        const prevDate = new Date(sortedDates[i - 1])
        const dayDiff = Math.round((currentDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000))

        if (dayDiff === 1) {
          tempStreak++
          longestStreak = Math.max(longestStreak, tempStreak)
        } else {
          tempStreak = 1
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak)

      // Fetch user account creation date for avg calculation
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', user.id)
        .single()

      if (userError) {
        throw new Error(`Failed to fetch user data: ${userError.message}`)
      }

      const accountCreated = new Date(userData.created_at)
      const daysSinceCreation = Math.max(1, Math.floor((now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)))
      const avgQuestionsPerDay = Math.round((totalQuestions / daysSinceCreation) * 10) / 10

      // Analyze top topics from topic_progression table
      const { data: topicData } = await supabase
        .from('topic_progression')
        .select('topic, interactions')
        .eq('user_id', user.id)
        .order('interactions', { ascending: false })
        .limit(5)

      const topTopics = topicData?.map(t => ({
        name: t.topic,
        count: t.interactions
      })) || [
        { name: 'General Questions', count: totalQuestions }
      ]

      // Calculate recent 7-day activity
      const recentActivity = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = date.toISOString().split('T')[0]

        const questionCount = conversations?.filter(conv => {
          const convDate = new Date(conv.created_at).toISOString().split('T')[0]
          return convDate === dateStr
        }).length || 0

        recentActivity.push({
          date: dateStr,
          questionCount
        })
      }

      return {
        conversations: {
          total: totalConversations,
          thisWeek: conversationsThisWeek,
          thisMonth: conversationsThisMonth,
          avgLength: avgConversationLength
        },
        questions: {
          total: totalQuestions,
          thisWeek: questionsThisWeek,
          thisMonth: questionsThisMonth,
          avgPerConversation: avgQuestionsPerConversation
        },
        activity: {
          totalDaysActive,
          longestStreak,
          currentStreak,
          avgQuestionsPerDay
        },
        topTopics,
        recentActivity
      }
    })

    return NextResponse.json(stats)

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'GET /api/user/detailed-stats',
      userId: 'unknown'
    })

    return NextResponse.json(
      { error: 'Failed to fetch detailed statistics' },
      { status: 500 }
    )
  }
}
