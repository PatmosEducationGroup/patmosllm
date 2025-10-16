import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

/**
 * API Route: Cancel Account Deletion
 * GDPR Article 17 - Right to Erasure (Cancellation)
 *
 * Cancels a scheduled account deletion:
 * - Clears deleted_at timestamp
 * - Only works if deletion is still scheduled (not yet executed)
 * - Logs cancellation to audit trail
 *
 * @route POST /api/privacy/cancel-deletion
 */
export async function POST(request: NextRequest) {
  try {
    // Parse body - may be empty for session-based cancellation
    let token: string | undefined
    try {
      const body = await request.json()
      token = body.token
    } catch {
      // No body or invalid JSON - that's fine for session-based auth
      token = undefined
    }

    let userId: string
    let authUserId: string | null
    let deletionDate: string | null = null

    // 1. Authenticate either via session OR via deletion token
    if (token) {
      // Token-based cancellation (from email magic link)
      const result = await withSupabaseAdmin(async (supabase) => {
        const { data: user, error } = await supabase
          .from('users')
          .select('id, auth_user_id, deleted_at, deletion_token_expires_at')
          .eq('deletion_token', token)
          .maybeSingle()

        if (error) throw error
        return user
      })

      if (!result) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        )
      }

      // Check token expiration
      const now = new Date()
      const expiresAt = new Date(result.deletion_token_expires_at)
      if (expiresAt < now) {
        return NextResponse.json(
          { error: 'Token has expired' },
          { status: 401 }
        )
      }

      if (!result.deleted_at) {
        return NextResponse.json(
          { error: 'Deletion has already been cancelled' },
          { status: 400 }
        )
      }

      userId = result.id
      authUserId = result.auth_user_id
      deletionDate = result.deleted_at
    } else {
      // Session-based cancellation (logged in user)
      const user = await getCurrentUser()
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      // Check if user has a scheduled deletion
      const result = await withSupabaseAdmin(async (supabase) => {
        const { data: userData, error: fetchError } = await supabase
          .from('users')
          .select('deleted_at')
          .eq('id', user.id)
          .single()

        if (fetchError) throw fetchError
        return userData
      })

      if (!result.deleted_at) {
        return NextResponse.json(
          { error: 'No scheduled deletion found' },
          { status: 400 }
        )
      }

      userId = user.id
      authUserId = user.auth_user_id || null
      deletionDate = result.deleted_at
    }

    // 2. Cancel deletion by clearing deleted_at timestamp + token
    await withSupabaseAdmin(async (supabase) => {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          deleted_at: null,
          deletion_token: null,
          deletion_token_expires_at: null
        })
        .eq('id', userId)

      if (updateError) {
        throw new Error(`Failed to cancel account deletion: ${updateError.message}`)
      }

      // 3. Log to privacy audit log
      const { error: auditError } = await supabase
        .from('privacy_audit_log')
        .insert({
          user_id: userId,
          auth_user_id: authUserId,
          action: 'ACCOUNT_DELETION_CANCELLED',
          details: {
            original_deletion_date: deletionDate,
            cancelled_at: new Date().toISOString(),
            cancelled_via: token ? 'magic_link' : 'authenticated_session',
            ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
          }
        })

      if (auditError) {
        logError(new Error(`Failed to log deletion cancellation: ${auditError.message}`), {
          operation: 'logDeletionCancellation',
          userId: userId
        })
        // Don't fail the request if audit logging fails
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Account deletion cancelled successfully'
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'cancelAccountDeletion',
      route: '/api/privacy/cancel-deletion'
    })

    return NextResponse.json(
      { error: 'Failed to cancel account deletion' },
      { status: 500 }
    )
  }
}
