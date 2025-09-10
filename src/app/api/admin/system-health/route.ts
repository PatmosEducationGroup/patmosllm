import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withSupabaseAdmin, getSupabaseHealth } from '@/lib/supabase'
import { advancedCache } from '@/lib/advanced-cache'
import { testConnection as testPineconeConnection } from '@/lib/pinecone'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
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

    // Get advanced system metrics
    const [dbStats, cacheStats, connectionHealth, pineconeHealth] = await Promise.all([
      // Database stats with connection pooling
      withSupabaseAdmin(async (supabase) => {
        const [usersResult, documentsResult, conversationsResult] = await Promise.all([
          supabase.from('users').select('id, created_at, clerk_id').limit(1000),
          supabase.from('documents').select('id, file_size, created_at').limit(1000),
          supabase.from('conversations').select('id, created_at').limit(1000)
        ])
        return { usersResult, documentsResult, conversationsResult }
      }),
      // Cache performance metrics
      advancedCache.getStats(),
      // Connection pool health
      getSupabaseHealth(),
      // Vector database health
      testPineconeConnection()
    ])

    const dbResponseTime = Date.now() - startTime

    // Calculate statistics from pooled database results
    const totalUsers = dbStats.usersResult.data?.length || 0
    const activeUsers = dbStats.usersResult.data?.filter(u => !u.clerk_id.startsWith('invited_')).length || 0
    const pendingUsers = totalUsers - activeUsers

    const totalDocuments = dbStats.documentsResult.data?.length || 0
    const totalStorage = dbStats.documentsResult.data?.reduce((sum, doc) => sum + (doc.file_size || 0), 0) || 0

    const totalConversations = dbStats.conversationsResult.data?.length || 0

    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    const recentUsers = dbStats.usersResult.data?.filter(u => u.created_at > yesterday).length || 0
    const recentDocuments = dbStats.documentsResult.data?.filter(d => d.created_at > yesterday).length || 0
    const recentConversations = dbStats.conversationsResult.data?.filter(c => c.created_at > yesterday).length || 0

    return NextResponse.json({
      success: true,
      health: {
        database: {
          status: 'healthy',
          responseTime: dbResponseTime,
          connected: true,
          connectionPool: connectionHealth
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
          databaseUtilization: connectionHealth.utilization,
          cacheHitRate: cacheStats.hitRate,
          estimatedConcurrentCapacity: Math.floor(100 - connectionHealth.utilization) * 5, // Rough estimate
          status: connectionHealth.utilization < 70 && cacheStats.hitRate > 20 ? 'excellent' : 'good'
        },
        system: {
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          version: '2.0.0-hybrid-search',
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
          features: [
            'Singleton Connection Pool',
            'Advanced Multi-layer Cache',
            'Hybrid Search (Semantic + Keyword)',
            'Intelligent Query Analysis',
            'Real-time Performance Monitoring'
          ]
        }
      }
    })

  } catch (error) {
    console.error('System health check failed:', error)
    return NextResponse.json({
      success: false,
      error: 'System health check failed',
      health: {
        database: {
          status: 'error',
          responseTime: null,
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }, { status: 500 })
  }
}