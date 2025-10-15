'use client'

/**
 * Statistics Page
 * Detailed user activity stats and insights
 */

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import { BarChart3, TrendingUp, Calendar, MessageCircle, Target } from 'lucide-react'
import { logError } from '@/lib/logger'

interface DetailedStats {
  conversations: {
    total: number
    thisWeek: number
    thisMonth: number
    avgLength: number
  }
  questions: {
    total: number
    thisWeek: number
    thisMonth: number
    avgPerConversation: number
  }
  activity: {
    totalDaysActive: number
    longestStreak: number
    currentStreak: number
    avgQuestionsPerDay: number
  }
  topTopics: Array<{
    name: string
    count: number
  }>
  recentActivity: Array<{
    date: string
    questionCount: number
  }>
}

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DetailedStats | null>(null)

  useEffect(() => {
    loadDetailedStats()
  }, [])

  async function loadDetailedStats() {
    try {
      setLoading(true)
      // For now, we'll use mock data
      // In production, fetch from /api/user/detailed-stats
      setStats({
        conversations: {
          total: 42,
          thisWeek: 5,
          thisMonth: 18,
          avgLength: 3.7
        },
        questions: {
          total: 156,
          thisWeek: 12,
          thisMonth: 58,
          avgPerConversation: 3.7
        },
        activity: {
          totalDaysActive: 32,
          longestStreak: 7,
          currentStreak: 3,
          avgQuestionsPerDay: 4.9
        },
        topTopics: [
          { name: 'Prayer & Missions', count: 45 },
          { name: 'Discipleship', count: 32 },
          { name: 'Biblical Studies', count: 28 },
          { name: 'Church Leadership', count: 21 },
          { name: 'Evangelism', count: 18 }
        ],
        recentActivity: [
          { date: '2025-10-15', questionCount: 8 },
          { date: '2025-10-14', questionCount: 5 },
          { date: '2025-10-13', questionCount: 6 },
          { date: '2025-10-12', questionCount: 0 },
          { date: '2025-10-11', questionCount: 4 },
          { date: '2025-10-10', questionCount: 7 },
          { date: '2025-10-09', questionCount: 3 }
        ]
      })
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load stats'), {
        operation: 'loadDetailedStats',
        component: 'StatsPage'
      })
      setError('Failed to load statistics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Statistics & Insights</h2>
        <p className="text-gray-600 mt-2">
          Your activity and engagement metrics
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {stats && (
        <>
          {/* Conversation Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Conversation Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.conversations.total}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">This Week</p>
                  <p className="text-2xl font-bold text-primary-600">{stats.conversations.thisWeek}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-secondary-600">{stats.conversations.thisMonth}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg. Length</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.conversations.avgLength}</p>
                  <p className="text-xs text-gray-500">questions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Question Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.questions.total}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">This Week</p>
                  <p className="text-2xl font-bold text-primary-600">{stats.questions.thisWeek}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-secondary-600">{stats.questions.thisMonth}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Per Conversation</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.questions.avgPerConversation}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity & Streaks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Activity & Streaks
              </CardTitle>
              <CardDescription>
                Your engagement consistency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Active Days</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.activity.totalDaysActive}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Current Streak</p>
                  <p className="text-2xl font-bold text-green-600">{stats.activity.currentStreak}</p>
                  <p className="text-xs text-gray-500">days</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Longest Streak</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.activity.longestStreak}</p>
                  <p className="text-xs text-gray-500">days</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg. Daily Questions</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.activity.avgQuestionsPerDay}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Topics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Top Topics
              </CardTitle>
              <CardDescription>
                Your most discussed areas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topTopics.map((topic, index) => {
                  const maxCount = stats.topTopics[0].count
                  const percentage = (topic.count / maxCount) * 100

                  return (
                    <div key={topic.name}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{topic.name}</span>
                        <span className="text-sm text-gray-600">{topic.count} questions</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            index === 0 ? 'bg-primary-600' :
                            index === 1 ? 'bg-secondary-600' :
                            index === 2 ? 'bg-green-600' :
                            'bg-blue-600'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Recent Activity (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.recentActivity.map((day) => {
                  const date = new Date(day.date)
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const maxQuestions = Math.max(...stats.recentActivity.map(d => d.questionCount))
                  const barWidth = maxQuestions > 0 ? (day.questionCount / maxQuestions) * 100 : 0

                  return (
                    <div key={day.date} className="flex items-center gap-3">
                      <div className="w-20 text-sm text-gray-600 flex-shrink-0">
                        <div className="font-medium">{dayName}</div>
                        <div className="text-xs">{dateStr}</div>
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-gray-100 rounded-full h-6 flex items-center">
                          <div
                            className="bg-gradient-to-r from-primary-400 to-primary-600 h-6 rounded-full flex items-center justify-center transition-all duration-500"
                            style={{ width: `${Math.max(barWidth, day.questionCount > 0 ? 15 : 0)}%` }}
                          >
                            {day.questionCount > 0 && (
                              <span className="text-xs font-medium text-white px-2">
                                {day.questionCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
