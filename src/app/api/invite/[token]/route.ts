import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

/**
 * GET /api/invite/[token]
 * Validates an invitation token (legacy route - redirects to new system)
 *
 * The new invitation system uses /api/invite/[token]/validate instead.
 * This route is kept for backwards compatibility.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token required' },
        { status: 400 }
      )
    }

    // Find invitation by token in users table (legacy)
    const { data: invitation, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        name,
        role,
        invitation_token,
        invitation_expires_at,
        invited_by,
        inviter:invited_by(email, name)
      `)
      .eq('invitation_token', token)
      .single()

    if (error || !invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    // Check if invitation has expired
    const now = new Date()
    const expiresAt = new Date(invitation.invitation_expires_at)
    const expired = now > expiresAt

    return NextResponse.json({
      success: true,
      invitation: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        invitedBy: (invitation.inviter as { email?: string; name?: string })?.name ||
                   (invitation.inviter as { email?: string; name?: string })?.email ||
                   'System',
        expired
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API invite/[token]',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Internal server error'
    })
    return NextResponse.json(
      { success: false, error: 'Failed to validate invitation' },
      { status: 500 }
    )
  }
}
