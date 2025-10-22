import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loggers, logError } from '@/lib/logger'

// =================================================================
// GET - Validate invitation token (Phase 7)
// =================================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 400 }
      )
    }

    // =================================================================
    // LOOKUP INVITATION - Find invitation by token in invitation_tokens table
    // =================================================================
    const { data: invitation, error: lookupError } = await supabaseAdmin
      .from('invitation_tokens')
      .select(`
        id,
        email,
        name,
        role,
        token,
        expires_at,
        accepted_at,
        invited_by,
        inviter:invited_by(email, name)
      `)
      .eq('token', token)
      .single()

    if (lookupError || !invitation) {
      loggers.security({
        operation: 'validate_invitation_token',
        token,
        error: 'Token not found'
      }, 'Invalid invitation token attempted')

      return NextResponse.json(
        { success: false, error: 'Invalid invitation link' },
        { status: 404 }
      )
    }

    // =================================================================
    // CHECK ACCEPTANCE STATUS - Verify invitation hasn't been used
    // =================================================================
    if (invitation.accepted_at) {
      return NextResponse.json(
        { success: false, error: 'This invitation has already been accepted' },
        { status: 400 }
      )
    }

    // =================================================================
    // CHECK EXPIRATION - Verify invitation hasn't expired
    // =================================================================
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)
    const isExpired = expiresAt < now

    // =================================================================
    // SUCCESS RESPONSE - Return invitation details
    // =================================================================
    const inviterInfo = invitation.inviter as { email?: string; name?: string }

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        expired: isExpired,
        invitedBy: inviterInfo?.name || inviterInfo?.email || 'Administrator'
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API invite/[token]/validate',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Failed to validate invitation token'
    })
    return NextResponse.json(
      { success: false, error: 'Failed to validate invitation' },
      { status: 500 }
    )
  }
}
