import { useState, useEffect } from 'react'
import { Users, Clock, TrendingUp, AlertTriangle, CheckCircle, User, FileText, MessageCircle, Target } from 'lucide-react'

interface OnboardingAnalytics {
  overview: {
    total_users: number
    completed_onboarding: number
    completion_rate: string
    average_onboarding_time: number
    users_stuck: number
  }
  funnel_metrics: {
    total_invited: number
    first_login: number
    first_document_view: number
    first_document_upload: number
    first_chat: number
    first_successful_answer: number
    onboarding_complete: number
  }
  conversion_rates: {
    invited_to_login: string
    login_to_document_view: string
    document_view_to_upload: string
    upload_to_chat: string
    chat_to_success: string
    overall_completion: string
  }
  users_by_stage: Record<string, any[]>
  stuck_users: Array<{
    user_id: string
    email: string
    name: string
    current_stage: string
    days_stuck: number
    progress_percentage: number
    created_at: string
  }>
  recent_activity: {
    new_users_30_days: number
    completed_30_days: number
    completion_rate_30_days: string
  }
  average_stage_timings?: {
    invite_to_login: number
    login_to_doc_view: number
    doc_view_to_upload: number
    upload_to_chat: number
    chat_to_success: number
    total_onboarding: number
  }
}

export default function OnboardingAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<OnboardingAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    fetchAnalytics()
    
    let interval: NodeJS.Timeout
    if (autoRefresh) {
      interval = setInterval(fetchAnalytics, 30000) // Refresh every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh])

  const fetchAnalytics = async () => {
    try {
      setError(null)
      const response = await fetch('/api/admin/onboarding-analytics')
      
      if (!response.ok) {
        throw new Error('Failed to fetch onboarding analytics')
      }
      
      const data = await response.json()
      setAnalytics(data)
    } catch (err) {
      console.error('Error fetching onboarding analytics:', err)
      setError('Failed to load onboarding analytics')
    } finally {
      setLoading(false)
    }
  }

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'invited': return <Users className="w-4 h-4" />
      case 'first_login': return <User className="w-4 h-4" />
      case 'first_document_view': 
      case 'first_document_upload': return <FileText className="w-4 h-4" />
      case 'first_chat': 
      case 'first_successful_answer': return <MessageCircle className="w-4 h-4" />
      case 'completed': return <CheckCircle className="w-4 h-4" />
      default: return <Target className="w-4 h-4" />
    }
  }

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'invited': return 'bg-gray-100 text-gray-800'
      case 'first_login': return 'bg-blue-100 text-blue-800'
      case 'first_document_view': return 'bg-purple-100 text-purple-800'
      case 'first_document_upload': return 'bg-indigo-100 text-indigo-800'
      case 'first_chat': return 'bg-green-100 text-green-800'
      case 'first_successful_answer': return 'bg-emerald-100 text-emerald-800'
      case 'completed': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatStageName = (stage: string) => {
    const names: Record<string, string> = {
      'invited': 'Invited',
      'first_login': 'First Login',
      'first_document_view': 'Viewed Documents',
      'first_document_upload': 'Uploaded Document',
      'first_chat': 'First Chat',
      'first_successful_answer': 'Got Answer',
      'completed': 'Completed',
      'not_started': 'Not Started'
    }
    return names[stage] || stage
  }

  const formatDuration = (days: number) => {
    if (days < 1) return '<1 day'
    if (days === 1) return '1 day'
    return `${Math.round(days)} days`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading onboarding analytics...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="p-3 bg-red-100 rounded-full w-fit mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!analytics) return null

const funnelSteps = [
  { key: 'total_invited', label: 'Invited', count: analytics.funnel_metrics.total_invited },
  { key: 'first_login', label: 'First Login', count: analytics.funnel_metrics.first_login },
  { key: 'first_chat', label: 'First Chat', count: analytics.funnel_metrics.first_chat },
  { key: 'first_successful_answer', label: 'Got Answer', count: analytics.funnel_metrics.first_successful_answer },
  { key: 'onboarding_complete', label: 'Completed', count: analytics.funnel_metrics.onboarding_complete },
]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Onboarding Analytics</h1>
          <p className="text-gray-600">Track user progression through the onboarding funnel</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Auto-refresh</span>
          </label>
          <button
            onClick={fetchAnalytics}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.total_users}</p>
              <p className="text-sm text-gray-600">Total Users</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.completed_onboarding}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.completion_rate}%</p>
              <p className="text-sm text-gray-600">Completion Rate</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatDuration(analytics.overview.average_onboarding_time)}
              </p>
              <p className="text-sm text-gray-600">Avg Time</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.users_stuck}</p>
              <p className="text-sm text-gray-600">Users Stuck</p>
            </div>
          </div>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Onboarding Funnel</h2>
        
        <div className="space-y-4">
          {funnelSteps.map((step, index) => {
            const prevStep = index > 0 ? funnelSteps[index - 1] : null
            const conversionRate = prevStep ? 
              ((step.count / prevStep.count) * 100).toFixed(1) : '100.0'
            const width = analytics.funnel_metrics.total_invited > 0 ? 
              (step.count / analytics.funnel_metrics.total_invited) * 100 : 0

            return (
              <div key={step.key} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium text-gray-700 text-right">
                  {step.label}
                </div>
                
                <div className="flex-1 relative">
                  <div className="h-8 bg-gray-200 rounded-lg overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                      style={{ width: `${width}%` }}
                    ></div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-between px-3">
                    <span className="text-sm font-medium text-white">
                      {step.count} users
                    </span>
                    {index > 0 && (
                      <span className="text-sm font-medium text-white">
                        {conversionRate}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-16 text-right">
                  <span className="text-sm text-gray-600">
                    {width.toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Users by Stage and Stuck Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users by Current Stage */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Users by Current Stage</h2>
          
          <div className="space-y-3">
            {Object.entries(analytics.users_by_stage)
              .sort(([,a], [,b]) => b.length - a.length)
              .map(([stage, users]) => (
                <div key={stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStageIcon(stage)}
                    <span className="font-medium text-gray-900">
                      {formatStageName(stage)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStageColor(stage)}`}>
                      {users.length}
                    </span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Stuck Users */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            Users Stuck (3+ days)
            {analytics.stuck_users.length > 0 && (
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                {analytics.stuck_users.length}
              </span>
            )}
          </h2>
          
          {analytics.stuck_users.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No users are currently stuck! 🎉
            </p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {analytics.stuck_users.map((user) => (
                <div key={user.user_id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">
                      {user.name || user.email}
                    </p>
                    <p className="text-sm text-gray-600">
                      Stuck at: {formatStageName(user.current_stage)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-600">
                      {Math.round(user.days_stuck)} days
                    </p>
                    <p className="text-xs text-gray-500">
                      {user.progress_percentage}% complete
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity (30 Days)</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {analytics.recent_activity.new_users_30_days}
            </p>
            <p className="text-sm text-gray-600">New Users</p>
          </div>
          
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {analytics.recent_activity.completed_30_days}
            </p>
            <p className="text-sm text-gray-600">Completed Onboarding</p>
          </div>
          
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {analytics.recent_activity.completion_rate_30_days}%
            </p>
            <p className="text-sm text-gray-600">Recent Completion Rate</p>
          </div>
        </div>
      </div>
    </div>
  )
}