import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import {
  advancedCache,
  CACHE_NAMESPACES,
  CACHE_TTL,
  getCachedConversationHistory,
  cacheConversationHistory
} from '@/lib/advanced-cache'

// Get conversation history for a specific session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 403 }
      )
    }

    const { id: sessionId } = await params

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, title')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Check cache for conversation history first
    const cachedConversations = getCachedConversationHistory(sessionId)
    if (cachedConversations) {
      console.log(`Cache hit for conversation history: ${sessionId}`)
      return NextResponse.json({
        success: true,
        session: {
          id: session.id,
          title: session.title
        },
        conversations: cachedConversations,
        cached: true
      })
    }

    // Get conversation history from database
    const { data: conversations, error: conversationsError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (conversationsError) {
      console.error('Error fetching conversations:', conversationsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch conversation history' },
        { status: 500 }
      )
    }

    const conversationList = conversations || []

    // Cache the conversation history for future requests
    cacheConversationHistory(sessionId, conversationList)
    console.log(`Cached conversation history: ${sessionId} (${conversationList.length} conversations)`)

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        title: session.title
      },
      conversations: conversationList
    })

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch session' 
      },
      { status: 500 }
    )
  }
}

// Update session title
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 403 }
      )
    }

    const { id: sessionId } = await params
    const { title } = await request.json()

    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      )
    }

    const { data: session, error } = await supabaseAdmin
      .from('chat_sessions')
      .update({
        title: title.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to update session' },
        { status: 500 }
      )
    }

    // Invalidate session list cache since we updated the title
    const sessionCacheKey = `sessions-${user.id}`
    advancedCache.delete(CACHE_NAMESPACES.USER_SESSIONS, sessionCacheKey)
    console.log(`Cache invalidated for user sessions after title update: ${user.id}`)

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        updatedAt: session.updated_at
      }
    })

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update session' 
      },
      { status: 500 }
    )
  }
}

// Delete session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 403 }
      )
    }

    const { id: sessionId } = await params

    // Delete session (will cascade delete conversations)
    const { error } = await supabaseAdmin
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete session' },
        { status: 500 }
      )
    }

    // Invalidate both session list and conversation history cache
    const sessionCacheKey = `sessions-${user.id}`
    advancedCache.delete(CACHE_NAMESPACES.USER_SESSIONS, sessionCacheKey)
    advancedCache.delete(CACHE_NAMESPACES.CHAT_HISTORY, sessionId)
    console.log(`Cache invalidated after session deletion: ${sessionId} and user sessions: ${user.id}`)

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully'
    })

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete session' 
      },
      { status: 500 }
    )
  }
}