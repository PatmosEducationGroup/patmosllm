import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
 request: NextRequest,
 context: { params: Promise<{ userId: string }> }
) {
 try {
   const { userId: currentUserId } = await auth()
   if (!currentUserId) {
     return NextResponse.json(
       { success: false, error: 'Authentication required' },
       { status: 401 }
     )
   }

   const currentUser = await getCurrentUser()
   if (!currentUser || !['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)) {
     return NextResponse.json(
       { success: false, error: 'Admin privileges required' },
       { status: 403 }
     )
   }

   const { userId } = await context.params

   // Verify target user exists
   const { data: targetUser, error: userError } = await supabaseAdmin
     .from('users')
     .select('id, email, name, created_at')
     .eq('id', userId)
     .single()

   if (userError || !targetUser) {
     return NextResponse.json(
       { success: false, error: 'User not found' },
       { status: 404 }
     )
   }

   // Get document uploads
   const { data: documents } = await supabaseAdmin
     .from('documents')
     .select('id, title, file_size, mime_type, created_at')
     .eq('uploaded_by', userId)
     .order('created_at', { ascending: false })
     .limit(50)

   // Get chat sessions
   const { data: chatSessions } = await supabaseAdmin
     .from('chat_sessions')
     .select('id, created_at, updated_at')
     .eq('user_id', userId)
     .order('created_at', { ascending: false })
     .limit(50)

   // Get conversations with debug
   const { data: conversations, error: convError } = await supabaseAdmin
     .from('conversations')
     .select('id, question, created_at, sources, user_id')
     .eq('user_id', userId)
     .order('created_at', { ascending: false })
     .limit(100)

   // Debug logging
   console.log('Timeline Debug:', {
     targetUserId: userId,
     conversationsFound: conversations?.length || 0,
     conversationError: convError,
     sampleConversation: conversations?.[0],
     documentsFound: documents?.length || 0,
     chatSessionsFound: chatSessions?.length || 0
   })

   // Build timeline events
   const timeline = []

   // Account creation
   timeline.push({
     id: 'account_created',
     type: 'account_created',
     title: 'Account Created',
     description: `${targetUser.name || targetUser.email} joined the platform`,
     timestamp: targetUser.created_at,
     metadata: { email: targetUser.email, name: targetUser.name }
   })

   // Document uploads
   documents?.forEach(doc => {
     timeline.push({
       id: `doc_${doc.id}`,
       type: 'document_upload',
       title: 'Document Uploaded',
       description: doc.title,
       timestamp: doc.created_at,
       metadata: {
         title: doc.title,
         size: doc.file_size,
         type: doc.mime_type
       }
     })
   })

   // Chat sessions
   chatSessions?.forEach(session => {
     timeline.push({
       id: `session_${session.id}`,
       type: 'chat_session',
       title: 'Chat Session Started',
       description: 'Chat session initiated',
       timestamp: session.created_at,
       metadata: {
         sessionId: session.id,
         duration: Math.round((new Date(session.updated_at).getTime() - new Date(session.created_at).getTime()) / 1000 / 60)
       }
     })
   })

   // Individual questions
   conversations?.forEach(conv => {
     timeline.push({
       id: `conv_${conv.id}`,
       type: 'question',
       title: 'Question Asked',
       description: conv.question,
       timestamp: conv.created_at,
       metadata: {
         question: conv.question,
         sources: conv.sources || []
       }
     })
   })

   // Sort by timestamp (newest first)
   timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

   // Calculate stats
   const engagementScore = Math.min(100, Math.round(
     (documents?.length || 0) * 5 + 
     (conversations?.length || 0) * 2 + 
     (chatSessions?.length || 0) * 1
   ))

   return NextResponse.json({
     success: true,
     user: {
       id: targetUser.id,
       email: targetUser.email,
       name: targetUser.name,
       created_at: targetUser.created_at
     },
     timeline,
     stats: {
       totalEvents: timeline.length,
       documentsUploaded: documents?.length || 0,
       chatSessions: chatSessions?.length || 0,
       questionsAsked: conversations?.length || 0,
       engagementScore,
       lastActivity: timeline.length > 1 ? timeline[0].timestamp : null
     }
   })

 } catch (_error) {
   return NextResponse.json(
     { success: false, error: 'Failed to fetch user timeline' },
     { status: 500 }
   )
 }
}