'use client'

/**
 * Settings Landing Page
 * Main hub with user statistics and quick links
 */

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import { MessageCircle, FileText, Calendar, TrendingUp, Clock } from 'lucide-react'
import { logError } from '@/lib/logger'

interface UserStats {
  totalConversations: number
  totalQuestions: number
  totalSystemDocuments: number // Total documents available to all users
  accountCreatedAt: string
  lastActiveAt: string
  avgQuestionsPerDay: number
  mostActiveDay: string
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)

  useEffect(() => {
    loadUserStats()
  }, [])

  async function loadUserStats() {
    try {
      setLoading(true)

      const response = await fetch('/api/user/stats')
      if (!response.ok) {
        throw new Error('Failed to fetch user statistics')
      }

      const data = await response.json()
      setStats(data)
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load stats'), {
        operation: 'loadUserStats',
        component: 'SettingsPage'
      })
      setError('Failed to load user statistics')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getDaysSinceCreation = () => {
    if (!stats) return 0
    const created = new Date(stats.accountCreatedAt)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - created.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
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
        <h2 className="text-3xl font-bold text-gray-900">Account Settings</h2>
        <p className="text-gray-600 mt-2">
          Manage your account preferences and view your activity
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* User Statistics Grid */}
      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Total Conversations */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Conversations</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalConversations}</p>
                  </div>
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-primary-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Questions */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Questions Asked</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalQuestions}</p>
                  </div>
                  <div className="w-12 h-12 bg-secondary-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-secondary-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Documents */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Documents Available</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalSystemDocuments}</p>
                    <p className="text-xs text-gray-500 mt-1">system-wide</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Age */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Account Age</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{getDaysSinceCreation()}</p>
                    <p className="text-xs text-gray-500 mt-1">days</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Average Questions Per Day */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg. Questions/Day</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.avgQuestionsPerDay.toFixed(1)}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Last Active */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Last Active</p>
                    <p className="text-lg font-bold text-gray-900 mt-2">Today</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(stats.lastActiveAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Account Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account details and membership information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700">Account Created</span>
                  <span className="text-gray-900">{formatDate(stats.accountCreatedAt)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700">Most Active Day</span>
                  <span className="text-gray-900">{stats.mostActiveDay}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-700">Account Status</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
