/**
 * API Route: Privacy Data Export
 *
 * Allows users to export all their personal data in JSON format (GDPR compliance)
 * Creates a data export request and gathers all user data for download
 *
 * Phase 8: Privacy Settings Portal (Step 1 - Read-only, safest)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  try {
    // Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Rate limiting check - users can export once per hour
    const rateLimitResult = await checkExportRateLimit(user.id)
    if (!rateLimitResult.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many export requests. Please try again later.',
        retryAfter: rateLimitResult.retryAfter
      }, { status: 429 })
    }

    // Create export request record
    const exportRequestId = await createExportRequest(user.id)

    // Gather all user data
    const exportData = await gatherUserData(user.id, user.email)

    // Log to privacy audit log
    await logPrivacyAction(user.id, 'DATA_EXPORT_REQUESTED', {
      exportRequestId,
      recordCount: calculateRecordCount(exportData)
    })

    // In production, we would:
    // 1. Save exportData to Vercel Blob (temporary storage)
    // 2. Send email with download link
    // 3. Set expiration (24 hours)

    // For now, return the data directly for testing
    return NextResponse.json({
      success: true,
      message: 'Data export created successfully',
      exportRequestId,
      data: exportData,
      metadata: {
        totalRecords: calculateRecordCount(exportData),
        exportedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Export failed'), {
      operation: 'API privacy/export',
      phase: 'data_export',
      severity: 'high',
      errorContext: 'Failed to export user data'
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to create data export. Please try again later.'
    }, { status: 500 })
  }
}

/**
 * Check if user has exceeded export rate limit (1 per hour)
 */
async function checkExportRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const recentExports = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('data_export_requests')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error
      return data
    })

    if (recentExports && recentExports.length > 0) {
      const lastExportTime = new Date(recentExports[0].created_at).getTime()
      const now = Date.now()
      const timeSinceLastExport = now - lastExportTime
      const oneHourInMs = 60 * 60 * 1000

      if (timeSinceLastExport < oneHourInMs) {
        const retryAfterSeconds = Math.ceil((oneHourInMs - timeSinceLastExport) / 1000)
        return { allowed: false, retryAfter: retryAfterSeconds }
      }
    }

    return { allowed: true }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Rate limit check failed'), {
      operation: 'checkExportRateLimit',
      userId
    })
    // On error, allow the export (fail open)
    return { allowed: true }
  }
}

/**
 * Create a record in data_export_requests table
 */
async function createExportRequest(userId: string): Promise<string> {
  return await withSupabaseAdmin(async (supabase) => {
    const { data, error } = await supabase
      .from('data_export_requests')
      .insert({
        user_id: userId,
        status: 'completed',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  })
}

/**
 * Gather all user data from all tables
 */
async function gatherUserData(userId: string, userEmail: string | null) {
  return await withSupabaseAdmin(async (supabase) => {
    // Query all user-related data in parallel
    const [
      profileResult,
      conversationsResult,
      documentsResult,
      userContextResult,
      userPreferencesResult,
      onboardingMilestonesResult,
      conversationMemoryResult,
      topicProgressionResult,
      chatSessionsResult
    ] = await Promise.all([
      // User profile
      supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single(),

      // Conversations
      supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      // Documents
      supabase
        .from('documents')
        .select('id, title, file_name, file_size, file_type, storage_path, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      // User context (memory system)
      supabase
        .from('user_context')
        .select('*')
        .eq('user_id', userId),

      // User preferences
      supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId),

      // Onboarding milestones
      supabase
        .from('user_onboarding_milestones')
        .select('*')
        .eq('user_id', userId),

      // Conversation memory
      supabase
        .from('conversation_memory')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      // Topic progression
      supabase
        .from('topic_progression')
        .select('*')
        .eq('user_id', userId),

      // Chat sessions
      supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ])

    // Build export data structure
    return {
      export_metadata: {
        user_id: userId,
        email: userEmail,
        exported_at: new Date().toISOString(),
        format_version: '1.0',
        export_type: 'full_user_data'
      },
      profile: profileResult.data ? sanitizeProfile(profileResult.data) : null,
      conversations: conversationsResult.data || [],
      documents: documentsResult.data || [],
      user_context: userContextResult.data || [],
      preferences: userPreferencesResult.data || [],
      onboarding_milestones: onboardingMilestonesResult.data || [],
      conversation_memory: conversationMemoryResult.data || [],
      topic_progression: topicProgressionResult.data || [],
      chat_sessions: chatSessionsResult.data || [],
      statistics: {
        total_conversations: conversationsResult.data?.length || 0,
        total_documents: documentsResult.data?.length || 0,
        total_document_size_bytes: documentsResult.data?.reduce((sum, doc) => sum + (doc.file_size || 0), 0) || 0,
        total_conversation_memories: conversationMemoryResult.data?.length || 0,
        account_created_at: profileResult.data?.created_at || null
      }
    }
  })
}

/**
 * Sanitize user profile - remove sensitive internal fields
 */
function sanitizeProfile(profile: Record<string, unknown>) {
  // Remove sensitive internal fields
  const {
    auth_user_id: _auth_user_id,
    invitation_token: _invitation_token,
    ...sanitizedProfile
  } = profile

  return sanitizedProfile
}

/**
 * Calculate total record count across all data
 */
function calculateRecordCount(exportData: {
  profile: unknown;
  conversations?: unknown[];
  documents?: unknown[];
  user_context?: unknown[];
  preferences?: unknown[];
  onboarding_milestones?: unknown[];
  conversation_memory?: unknown[];
  topic_progression?: unknown[];
  chat_sessions?: unknown[];
}): number {
  return (
    (exportData.profile ? 1 : 0) +
    (exportData.conversations?.length || 0) +
    (exportData.documents?.length || 0) +
    (exportData.user_context?.length || 0) +
    (exportData.preferences?.length || 0) +
    (exportData.onboarding_milestones?.length || 0) +
    (exportData.conversation_memory?.length || 0) +
    (exportData.topic_progression?.length || 0) +
    (exportData.chat_sessions?.length || 0)
  )
}

/**
 * Log privacy action to audit log
 */
async function logPrivacyAction(userId: string, action: string, metadata: Record<string, unknown>) {
  try {
    await withSupabaseAdmin(async (supabase) => {
      await supabase
        .from('privacy_audit_log')
        .insert({
          user_id: userId,
          action,
          metadata,
          created_at: new Date().toISOString()
        })
    })
  } catch (error) {
    // Don't fail the request if audit logging fails
    logError(error instanceof Error ? error : new Error('Audit log failed'), {
      operation: 'logPrivacyAction',
      action,
      userId
    })
  }
}
