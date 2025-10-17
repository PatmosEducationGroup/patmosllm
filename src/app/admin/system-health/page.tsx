'use client'

import { useState, useEffect, useCallback } from 'react'
import { logError } from '@/lib/logger'
// Clerk hooks removed - now using session-based auth
import {
  Database,
  Users,
  FileText,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  Activity,
  Gauge,
  Info,
  HelpCircle,
  Brain
} from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'

interface SystemHealth {
  database: {
    status: string
    responseTime: number
    connected: boolean
    error?: string
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
    totalEntries: number
    memoryUsage: number
    memoryUsageMB: number
    evictions: number
    status: string
  }
  vectorDatabase: {
    status: string
    connected: boolean
  }
  memorySystem: {
    status: string
    responseTime: number
    userContexts: number
    conversationMemories: number
    topicProgressions: number
    recent24h: number
    coverage: number
    averageSatisfaction: number
    topTopics: Array<{ topic: string; count: number }>
    topIntents: Array<{ intent: string; count: number }>
    memoryUtilization: number
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
  performance: {
    cacheHitRate: number
    dbResponseTime: number
    status: string
  }
  system: {
    uptime: number
    timestamp: string
    version: string
    nodeVersion: string
    memoryUsage: {
      rss: number
      heapTotal: number
      heapUsed: number
      external: number
      arrayBuffers: number
    }
    features: string[]
  }
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)

      // Session-based auth - uses cookies automatically
      const response = await fetch('/api/admin/system-health', {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      
      if (data.success) {
        setHealth(data.health)
        setLastUpdated(new Date().toLocaleTimeString())
        setError(null)
      } else {
        setError(data.error || 'Failed to fetch system health')
      }
    } catch (error) {
    logError(error instanceof Error ? error : new Error('Operation failed'), {
      operation: 'API route',
      phase: 'request_handling',
      severity: 'critical',
      errorContext: 'Operation failed'
    })
setError('Failed to load system health')
  } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

//   const _formatUptime = (seconds: number) => {
//     const days = Math.floor(seconds / 86400)
//     const hours = Math.floor((seconds % 86400) / 3600)
//     const minutes = Math.floor((seconds % 3600) / 60)
//     
//     if (days > 0) return `${days}d ${hours}h ${minutes}m`
//     if (hours > 0) return `${hours}h ${minutes}m`
//     return `${minutes}m`
//   }

  if (loading && !health) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading system health...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
            <p className="mt-2 text-gray-600">
              Real-time monitoring of your application&apos;s health and performance
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              Last updated: {lastUpdated}
            </span>
            <button
              onClick={() => setShowDetailsModal(true)}
              className="inline-flex items-center px-3 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
            >
              <Info className="h-4 w-4 mr-2" />
              Learn More
            </button>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {health && (
          <div className="space-y-6">
            {/* System Status Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">System Status</h2>
                <div className="flex items-center">
                  {health.database.connected ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-red-500" />
                  )}
                  <span className={`ml-2 text-sm font-medium ${
                    health.database.connected ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {health.database.connected ? 'All Systems Operational' : 'System Issues Detected'}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Tooltip content="Time it takes for the database to respond to queries. Lower is better. <50ms is excellent.">
                  <div className="text-center cursor-help">
                    <div className="text-2xl font-bold text-gray-900">{health.database.responseTime}ms</div>
                    <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                      Database Response
                      <HelpCircle className="h-3 w-3 text-gray-400" />
                    </div>
                  </div>
                </Tooltip>
                <Tooltip content="Percentage of requests served from cache vs database. Higher is better for performance. >50% is good.">
                  <div className="text-center cursor-help">
                    <div className={`text-2xl font-bold ${health.cache.hitRate > 50 ? 'text-green-600' : health.cache.hitRate > 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {health.cache.hitRate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                      Cache Hit Rate
                      <HelpCircle className="h-3 w-3 text-gray-400" />
                    </div>
                  </div>
                </Tooltip>
                <Tooltip content="Total active users in the system">
                  <div className="text-center cursor-help">
                    <div className="text-2xl font-bold text-green-600">{health.users.active}</div>
                    <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                      Active Users
                      <HelpCircle className="h-3 w-3 text-gray-400" />
                    </div>
                  </div>
                </Tooltip>
                <Tooltip content="Database query response time. <100ms is excellent, <500ms is good, >1000ms needs attention.">
                  <div className="text-center cursor-help">
                    <div className={`text-2xl font-bold ${health.database.responseTime < 100 ? 'text-green-600' : health.database.responseTime < 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {health.database.responseTime}ms
                    </div>
                    <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                      DB Response Time
                      <HelpCircle className="h-3 w-3 text-gray-400" />
                    </div>
                  </div>
                </Tooltip>
              </div>
            </div>

            {/* Detailed Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Database Health */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Database className="h-8 w-8 text-blue-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Database</h3>
                    <p className={`text-sm ${health.database.connected ? 'text-green-600' : 'text-red-600'}`}>
                      {health.database.status}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Response Time</span>
                    <span className="font-medium">{health.database.responseTime}ms</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Status</span>
                    <span className={`font-medium ${health.database.connected ? 'text-green-600' : 'text-red-600'}`}>
                      {health.database.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Users */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-green-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Users</h3>
                    <p className="text-sm text-gray-600">{health.users.total} total</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Active</span>
                    <span className="font-medium text-green-600">{health.users.active}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pending</span>
                    <span className="font-medium text-yellow-600">{health.users.pending}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">New (24h)</span>
                    <span className="font-medium">{health.users.recent24h}</span>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-purple-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Documents</h3>
                    <p className="text-sm text-gray-600">{health.documents.total} files</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Size</span>
                    <span className="font-medium">{formatBytes(health.documents.totalSizeBytes)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">New (24h)</span>
                    <span className="font-medium">{health.documents.recent24h}</span>
                  </div>
                </div>
              </div>

              {/* Conversations */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <MessageSquare className="h-8 w-8 text-orange-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Conversations</h3>
                    <p className="text-sm text-gray-600">{health.conversations.total} total</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Recent (24h)</span>
                    <span className="font-medium">{health.conversations.recent24h}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Avg per User</span>
                    <span className="font-medium">
                      {health.users.active > 0 ? Math.round(health.conversations.total / health.users.active) : 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Cache Performance */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Zap className="h-8 w-8 text-yellow-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Cache</h3>
                    <p className={`text-sm ${
                      health.cache.status === 'optimal' ? 'text-green-600' : 
                      health.cache.status === 'good' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {health.cache.status}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Hit Rate</span>
                    <span className={`font-medium ${health.cache.hitRate > 50 ? 'text-green-600' : health.cache.hitRate > 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {health.cache.hitRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Entries</span>
                    <span className="font-medium">{health.cache.totalEntries}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Memory Usage</span>
                    <span className="font-medium">{health.cache.memoryUsageMB.toFixed(1)} MB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Evictions</span>
                    <span className="font-medium">{health.cache.evictions}</span>
                  </div>
                </div>
              </div>

              {/* Vector Database */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Activity className="h-8 w-8 text-pink-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Vector DB</h3>
                    <p className={`text-sm ${health.vectorDatabase.connected ? 'text-green-600' : 'text-red-600'}`}>
                      {health.vectorDatabase.status}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Status</span>
                    <span className={`font-medium ${health.vectorDatabase.connected ? 'text-green-600' : 'text-red-600'}`}>
                      {health.vectorDatabase.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Search Type</span>
                    <span className="font-medium">Hybrid (Semantic + Keyword)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Embedding Model</span>
                    <span className="font-medium">voyage-3-large</span>
                  </div>
                </div>
              </div>

              {/* Memory System */}
              {health.memorySystem && (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <Brain className="h-8 w-8 text-purple-500" />
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Memory System</h3>
                      <p className={`text-sm ${health.memorySystem.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
                        {health.memorySystem.status}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Response Time</span>
                      <span className="font-medium">{health.memorySystem.responseTime}ms</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">User Contexts</span>
                      <span className="font-medium">{health.memorySystem.userContexts}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Memories</span>
                      <span className="font-medium">{health.memorySystem.conversationMemories}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Recent (24h)</span>
                      <span className="font-medium text-green-600">{health.memorySystem.recent24h}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Utilization</span>
                      <span className={`font-medium ${health.memorySystem.memoryUtilization > 50 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {health.memorySystem.memoryUtilization}%
                      </span>
                    </div>
                    {health.memorySystem.averageSatisfaction > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Avg Satisfaction</span>
                        <span className="font-medium text-blue-600">{health.memorySystem.averageSatisfaction.toFixed(1)}/5</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Performance Metrics */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Gauge className="h-8 w-8 text-emerald-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Performance</h3>
                    <p className={`text-sm ${
                      health.performance.status === 'excellent' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {health.performance.status}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">DB Response Time</span>
                    <span className={`font-medium ${health.performance.dbResponseTime < 100 ? 'text-green-600' : health.performance.dbResponseTime < 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {health.performance.dbResponseTime}ms
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Cache Efficiency</span>
                    <span className={`font-medium ${health.performance.cacheHitRate > 50 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {health.performance.cacheHitRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Overall Status</span>
                    <span className="font-medium text-green-600">{health.performance.status}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* System Features */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Active Performance Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {health.system.features.map((feature) => (
                  <div key={feature} className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">System Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Last Updated:</span>
                  <div className="font-medium">{new Date(health.system.timestamp).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-gray-600">Database Health:</span>
                  <div className={`font-medium ${health.database.connected ? 'text-green-600' : 'text-red-600'}`}>
                    {health.database.status}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Storage Usage:</span>
                  <div className="font-medium">{formatBytes(health.documents.totalSizeBytes)}</div>
                </div>
              </div>
            </div>

            {/* Memory Insights */}
            {health.memorySystem && (health.memorySystem.topTopics.length > 0 || health.memorySystem.topIntents.length > 0) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Memory System Insights</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Topics */}
                  {health.memorySystem.topTopics.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                        <Brain className="h-5 w-5 text-purple-500 mr-2" />
                        Popular Topics
                      </h3>
                      <div className="space-y-2">
                        {health.memorySystem.topTopics.slice(0, 5).map((topic) => (
                          <div key={topic.topic} className="flex justify-between items-center">
                            <span className="text-sm text-gray-700 capitalize">{topic.topic}</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min((topic.count / Math.max(...health.memorySystem.topTopics.map(t => t.count))) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-500 w-6 text-right">{topic.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Question Intents */}
                  {health.memorySystem.topIntents.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                        <MessageSquare className="h-5 w-5 text-blue-500 mr-2" />
                        Question Types
                      </h3>
                      <div className="space-y-2">
                        {health.memorySystem.topIntents.slice(0, 5).map((intent) => (
                          <div key={intent.intent} className="flex justify-between items-center">
                            <span className="text-sm text-gray-700 capitalize">{intent.intent}</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min((intent.count / Math.max(...health.memorySystem.topIntents.map(i => i.count))) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-500 w-6 text-right">{intent.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Memory Stats Summary */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-purple-600">{health.memorySystem.userContexts}</div>
                      <div className="text-xs text-gray-600">User Profiles</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{health.memorySystem.conversationMemories}</div>
                      <div className="text-xs text-gray-600">Total Memories</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{health.memorySystem.recent24h}</div>
                      <div className="text-xs text-gray-600">Recent Activity</div>
                    </div>
                    {health.memorySystem.averageSatisfaction > 0 && (
                      <div>
                        <div className="text-2xl font-bold text-orange-600">{health.memorySystem.averageSatisfaction.toFixed(1)}</div>
                        <div className="text-xs text-gray-600">Avg Satisfaction</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Health Details Modal */}
        <Modal
          isOpen={showDetailsModal}
          onClose={() => setShowDetailsModal(false)}
          title="System Health Metrics Explained"
          size="lg"
        >
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Performance Metrics</h3>
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-medium text-gray-900">Database Response Time</h4>
                  <p className="text-sm text-gray-600">Time it takes for database queries to complete. Lower values indicate better performance.</p>
                  <div className="text-xs text-gray-500 mt-1">
                    • &lt;50ms: Excellent • 50-100ms: Good • &gt;100ms: Needs attention
                  </div>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-medium text-gray-900">Cache Hit Rate</h4>
                  <p className="text-sm text-gray-600">Percentage of requests served from cache instead of database. Higher values reduce load and improve speed.</p>
                  <div className="text-xs text-gray-500 mt-1">
                    • &gt;70%: Excellent • 50-70%: Good • &lt;50%: Consider cache optimization
                  </div>
                </div>
                <div className="border-l-4 border-purple-500 pl-4">
                  <h4 className="font-medium text-gray-900">Database Utilization</h4>
                  <p className="text-sm text-gray-600">Percentage of database connections currently in use. Monitors system load.</p>
                  <div className="text-xs text-gray-500 mt-1">
                    • &lt;70%: Healthy • 70-85%: High load • &gt;85%: Critical - may need scaling
                  </div>
                </div>
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-medium text-gray-900">Concurrent Capacity</h4>
                  <p className="text-sm text-gray-600">Estimated number of users who can simultaneously use the system based on current performance metrics.</p>
                  <div className="text-xs text-gray-500 mt-1">
                    Calculated from: DB connection pool size, response times, and cache efficiency
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Understanding the Dashboard</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">Green indicators:</span> System is performing optimally
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">Yellow indicators:</span> Performance is acceptable but could be improved
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">Red indicators:</span> Issues detected that may affect user experience
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">What to Watch For</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div>• Database response times consistently above 100ms may indicate performance issues</div>
                <div>• Cache hit rates below 50% suggest cache configuration could be optimized</div>
                <div>• Database utilization above 85% indicates the system is approaching capacity limits</div>
                <div>• Sudden changes in these metrics may indicate system problems or unusual usage patterns</div>
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}