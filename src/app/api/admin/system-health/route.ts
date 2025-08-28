import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const startTime = Date.now()

    // Test database connection and get basic stats
    const [usersResult, documentsResult, conversationsResult] = await Promise.all([
      supabaseAdmin.from('users').select('id, created_at, clerk_id').limit(1000),
      supabaseAdmin.from('documents').select('id, file_size, created_at').limit(1000),
      supabaseAdmin.from('conversations').select('id, created_at').limit(1000)
    ])

    const dbResponseTime = Date.now() - startTime

    // Calculate statistics
    const totalUsers = usersResult.data?.length || 0
    const activeUsers = usersResult.data?.filter(u => !u.clerk_id.startsWith('invited_')).length || 0
    const pendingUsers = totalUsers - activeUsers

    const totalDocuments = documentsResult.data?.length || 0
    const totalStorage = documentsResult.data?.reduce((sum, doc) => sum + (doc.file_size || 0), 0) || 0

    const totalConversations = conversationsResult.data?.length || 0

    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    const recentUsers = usersResult.data?.filter(u => u.created_at > yesterday).length || 0
    const recentDocuments = documentsResult.data?.filter(d => d.created_at > yesterday).length || 0
    const recentConversations = conversationsResult.data?.filter(c => c.created_at > yesterday).length || 0

    return NextResponse.json({
      success: true,
      health: {
        database: {
          status: 'healthy',
          responseTime: dbResponseTime,
          connected: true
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
          recent24h: recentDocuments
        },
        conversations: {
          total: totalConversations,
          recent24h: recentConversations
        },
        system: {
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          version: '1.0.0'
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