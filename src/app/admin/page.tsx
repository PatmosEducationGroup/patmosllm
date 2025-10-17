'use client'

/**
 * Admin Dashboard
 * Displays key statistics and system health metrics at a glance
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import {
  Users,
  FileText,
  MessageCircle,
  Database,
  Activity,
  Clock,
  TrendingUp,
  AlertCircle,
  Gift,
  Trash2,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface SystemHealth {
  database: {
    status: string
    responseTime: number
    connected: boolean
  }
  cache: {
    hitRate: number
    totalEntries: number
    status: string
  }
  users: {
    total: number
    active: number
    pending: number
    recent24h: number
  }
  documents: {
    total: number
    totalSizeBytes: number
    totalSizeMB: number
    recent24h: number
  }
  conversations: {
    total: number
    recent24h: number
  }
  memorySystem: {
    userContexts: number
    conversationMemories: number
    recent24h: number
  }
  vectorDatabase: {
    status: string
    totalVectors: number
    dimensions: number
  }
  system?: {
    timestamp: string
  }
}

interface DeletionStats {
  scheduledDeletions: number
  upcomingDeletions: number
}

interface InvitationStats {
  pendingInvitations: number
  totalInvitations: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [deletionStats, setDeletionStats] = useState<DeletionStats | null>(null)
  const [invitationStats, setInvitationStats] = useState<InvitationStats | null>(null)

  useEffect(() => {
    fetchDashboardData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Verify user has admin access
      const authResponse = await fetch('/api/auth')
      if (authResponse.ok) {
        const authData = await authResponse.json()
        if (authData.success && authData.user?.role) {
          // Only allow CONTRIBUTOR, ADMIN, or SUPER_ADMIN
          if (!['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'].includes(authData.user.role)) {
            router.push('/chat')
            return
          }
        } else {
          router.push('/chat')
          return
        }
      }

      // Fetch system health data
      const healthResponse = await fetch('/api/admin/system-health')
      if (!healthResponse.ok) {
        throw new Error('Failed to fetch system health')
      }
      const healthData = await healthResponse.json()
      // System health API returns data nested under 'health' key
      setSystemHealth(healthData.health || healthData)

      // Fetch deletion statistics (accounts scheduled for deletion)
      try {
        const deletionResponse = await fetch('/api/admin/deletion-stats')
        if (deletionResponse.ok) {
          const deletionData = await deletionResponse.json()
          setDeletionStats(deletionData)
        }
      } catch (err) {
        // Silently fail - deletion stats are optional
        console.warn('Failed to fetch deletion stats:', err)
      }

      // Fetch invitation statistics
      try {
        const invitationResponse = await fetch('/api/admin/invitation-stats')
        if (invitationResponse.ok) {
          const invitationData = await invitationResponse.json()
          setInvitationStats(invitationData)
        }
      } catch (err) {
        // Silently fail - invitation stats are optional
        console.warn('Failed to fetch invitation stats:', err)
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
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

  if (error) {
    return (
      <Alert variant="error" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <span>{error}</span>
      </Alert>
    )
  }

  if (!systemHealth) {
    return (
      <Alert variant="error" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <span>No system health data available</span>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            System overview and key metrics at a glance
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
        >
          Refresh
        </button>
      </div>

      {/* System Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Database Status */}
        <Card className="border-l-4 border-l-primary-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-primary-600" />
                Database
              </CardTitle>
              {systemHealth.database.connected ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`text-sm font-medium ${
                  systemHealth.database.status === 'healthy' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {systemHealth.database.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Response Time</span>
                <span className="text-sm font-medium">{systemHealth.database.responseTime}ms</span>
              </div>
            </div>
            <Link
              href="/admin/system-health"
              className="text-xs text-primary-600 hover:text-primary-700 mt-3 inline-block"
            >
              View Details →
            </Link>
          </CardContent>
        </Card>

        {/* Cache Status */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Cache
              </CardTitle>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Hit Rate</span>
                <span className="text-sm font-medium text-green-600">
                  {(systemHealth.cache.hitRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Entries</span>
                <span className="text-sm font-medium">{systemHealth.cache.totalEntries.toLocaleString()}</span>
              </div>
            </div>
            <Link
              href="/admin/system-health"
              className="text-xs text-primary-600 hover:text-primary-700 mt-3 inline-block"
            >
              View Details →
            </Link>
          </CardContent>
        </Card>

        {/* Vector Database Status */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                Vector DB
              </CardTitle>
              {systemHealth.vectorDatabase.status === 'healthy' ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`text-sm font-medium ${
                  systemHealth.vectorDatabase.status === 'healthy' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {systemHealth.vectorDatabase.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Vectors</span>
                <span className="text-sm font-medium">{systemHealth.vectorDatabase.totalVectors.toLocaleString()}</span>
              </div>
            </div>
            <Link
              href="/admin/system-health"
              className="text-xs text-primary-600 hover:text-primary-700 mt-3 inline-block"
            >
              View Details →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* User Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {systemHealth.users.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-600">Active:</span>
              <span className="text-xs font-medium text-green-600">
                {systemHealth.users.active.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Pending:</span>
              <span className="text-xs font-medium text-yellow-600">
                {systemHealth.users.pending.toLocaleString()}
              </span>
            </div>
            <Link
              href="/admin/users"
              className="text-xs text-primary-600 hover:text-primary-700 mt-3 inline-block"
            >
              Manage Users →
            </Link>
          </CardContent>
        </Card>

        {/* New Users (24h) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              New Users (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {systemHealth.users.recent24h.toLocaleString()}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Users created in the last 24 hours
            </p>
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gift className="w-5 h-5 text-yellow-600" />
              Pending Invitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {invitationStats?.pendingInvitations ?? systemHealth.users.pending.toLocaleString()}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Invitations awaiting acceptance
            </p>
            <Link
              href="/admin/invitation-quotas"
              className="text-xs text-primary-600 hover:text-primary-700 mt-3 inline-block"
            >
              Manage Invitations →
            </Link>
          </CardContent>
        </Card>

        {/* Accounts Scheduled for Deletion */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              Scheduled Deletions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {deletionStats?.scheduledDeletions ?? 0}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Accounts in 30-day grace period
            </p>
            {deletionStats && deletionStats.upcomingDeletions > 0 && (
              <div className="text-xs text-orange-600 mt-2">
                {deletionStats.upcomingDeletions} pending deletion soon
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {systemHealth.documents.total.toLocaleString()}
            </div>
            <div className="space-y-1 mt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Total Size:</span>
                <span className="text-xs font-medium">
                  {systemHealth.documents.totalSizeMB.toFixed(2)} MB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Uploaded (24h):</span>
                <span className="text-xs font-medium text-green-600">
                  {systemHealth.documents.recent24h.toLocaleString()}
                </span>
              </div>
            </div>
            <Link
              href="/admin/document-analytics"
              className="text-xs text-primary-600 hover:text-primary-700 mt-3 inline-block"
            >
              View Analytics →
            </Link>
          </CardContent>
        </Card>

        {/* Conversations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-gray-600" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {systemHealth.conversations.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-600">Active (24h):</span>
              <span className="text-xs font-medium text-green-600">
                {systemHealth.conversations.recent24h.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Memory System */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              Memory System
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">User Contexts</span>
                <span className="text-sm font-medium">
                  {systemHealth.memorySystem.userContexts.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Memories</span>
                <span className="text-sm font-medium">
                  {systemHealth.memorySystem.conversationMemories.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Recent (24h)</span>
                <span className="text-sm font-medium text-green-600">
                  {systemHealth.memorySystem.recent24h.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Updated */}
      <div className="text-center text-xs text-gray-500">
        Last updated: {systemHealth.system?.timestamp ? new Date(systemHealth.system.timestamp).toLocaleString() : new Date().toLocaleString()}
      </div>
    </div>
  )
}
