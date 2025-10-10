import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import {
  advancedCache,
  CACHE_NAMESPACES,
  CACHE_TTL
} from '@/lib/advanced-cache'
import { loggers, logError } from '@/lib/logger'

// Get all chat sessions for user
export async function GET(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check cache for user sessions first
    const cacheKey = `sessions-${user.id}`
    const cachedSessions = advancedCache.get<Array<Record<string, unknown>>>(
      CACHE_NAMESPACES.USER_SESSIONS,
      cacheKey
    )

    if (cachedSessions) {
      loggers.cache({ userId: user.id, sessionCount: cachedSessions.length, hit: true }, 'Cache hit for user sessions')
      return NextResponse.json({
        success: true,
        sessions: cachedSessions,
        cached: true
      })
    }

    // Get user's chat sessions with message count from database (exclude soft-deleted)
    const { data: sessions, error } = await supabaseAdmin
      .from('chat_sessions')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        conversations(count)
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch chat sessions' },
        { status: 500 }
      )
    }

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messageCount: session.conversations?.[0]?.count || 0
    }))

    // Cache the formatted sessions for future requests
    advancedCache.set(
      CACHE_NAMESPACES.USER_SESSIONS,
      cacheKey,
      formattedSessions,
      CACHE_TTL.SHORT // 5 minutes for session lists
    )

    loggers.cache({ userId: user.id, sessionCount: formattedSessions.length, operation: 'set' }, 'Cached user sessions')

    return NextResponse.json({
      success: true,
      sessions: formattedSessions
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to fetch chat sessions'), {
      operation: 'GET /api/chat/sessions',
      phase: 'session_retrieval',
      severity: 'high',
      errorContext: 'Failed to retrieve user chat sessions from database'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch sessions'
      },
      { status: 500 }
    )
  }
}

// Create new chat session
export async function POST(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { title = 'New Chat' } = await _request.json()

    const { data: session, error } = await supabaseAdmin
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: title
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to create chat session' },
        { status: 500 }
      )
    }

    // Invalidate cached sessions since we created a new one
    const cacheKey = `sessions-${user.id}`
    advancedCache.delete(CACHE_NAMESPACES.USER_SESSIONS, cacheKey)
    loggers.cache({ userId: user.id, operation: 'invalidate', reason: 'new_session' }, 'Cache invalidated for user sessions')

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to create chat session'), {
      operation: 'POST /api/chat/sessions',
      phase: 'session_creation',
      severity: 'high',
      errorContext: 'Failed to create new chat session in database'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create session'
      },
      { status: 500 }
    )
  }
}