'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import AdminNavbar from '@/components/AdminNavbar'
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
  Gauge
} from 'lucide-react'

interface SystemHealth {
  database: {
    status: string
    responseTime: number
    connected: boolean
    connectionPool: {
      utilization: number
      activeConnections: number
      totalConnections: number
      queueLength: number
    }
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
    databaseUtilization: number
    cacheHitRate: number
    estimatedConcurrentCapacity: number
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
  const { getToken } = useAuth()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const fetchHealth = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      
      const response = await fetch('/api/admin/system-health', {
        headers: {
          'Authorization': `Bearer ${token}`,
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
    } catch (err) {
      console.error('Error fetching system health:', err)
      setError('Failed to load system health')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  if (loading && !health) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar />
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
      <AdminNavbar />
      
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
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{health.database.responseTime}ms</div>
                  <div className="text-sm text-gray-600">Database Response</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${health.cache.hitRate > 50 ? 'text-green-600' : health.cache.hitRate > 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {health.cache.hitRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Cache Hit Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{health.performance.estimatedConcurrentCapacity}</div>
                  <div className="text-sm text-gray-600">Concurrent Capacity</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${health.database.connectionPool.utilization < 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {health.database.connectionPool.utilization.toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-600">DB Utilization</div>
                </div>
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
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pool Utilization</span>
                    <span className={`font-medium ${health.database.connectionPool.utilization < 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {health.database.connectionPool.utilization.toFixed(1)}%
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

              {/* Connection Pool */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Database className="h-8 w-8 text-indigo-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">Connection Pool</h3>
                    <p className={`text-sm ${
                      health.database.connectionPool.utilization < 70 ? 'text-green-600' : 
                      health.database.connectionPool.utilization < 85 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {health.database.connectionPool.utilization.toFixed(1)}% utilized
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Active</span>
                    <span className="font-medium">{health.database.connectionPool.activeConnections}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Pool</span>
                    <span className="font-medium">{health.database.connectionPool.totalConnections}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Queue Length</span>
                    <span className={`font-medium ${health.database.connectionPool.queueLength > 5 ? 'text-red-600' : 'text-green-600'}`}>
                      {health.database.connectionPool.queueLength}
                    </span>
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
                    <span className="font-medium">text-embedding-3-small</span>
                  </div>
                </div>
              </div>

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
                    <span className="text-gray-600">Concurrent Capacity</span>
                    <span className="font-medium text-green-600">{health.performance.estimatedConcurrentCapacity} users</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">DB Utilization</span>
                    <span className={`font-medium ${health.performance.databaseUtilization < 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {health.performance.databaseUtilization.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Cache Efficiency</span>
                    <span className={`font-medium ${health.performance.cacheHitRate > 50 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {health.performance.cacheHitRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* System Features */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Active Performance Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {health.system.features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2">
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
          </div>
        )}
      </div>
    </div>
  )
}