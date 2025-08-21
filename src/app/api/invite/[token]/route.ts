import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 400 }
      )
    }

    // Look up invitation by token
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        email,
        name,
        role,
        invitation_expires_at,
        clerk_id,
        invited_by,
        inviter:invited_by(email, name)
      `)
      .eq('invitation_token', token)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    // Check if invitation has expired
    const now = new Date()
    const expiresAt = new Date(user.invitation_expires_at)
    const expired = now > expiresAt

    // Check if user has already activated their account
    const alreadyActivated = !user.clerk_id.startsWith('invited_')

    if (alreadyActivated) {
      return NextResponse.json(
        { success: false, error: 'This invitation has already been used' },
        { status: 400 }
      )
    }

    const inviterInfo = user.inviter as { email?: string; name?: string }

    return NextResponse.json({
      success: true,
      invitation: {
        email: user.email,
        name: user.name,
        role: user.role,
        invitedBy: inviterInfo?.name || inviterInfo?.email || 'Administrator',
        expired: expired
      }
    })

  } catch (error) {
    console.error('Invitation validation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to validate invitation' 
      },
      { status: 500 }
    )
  }
}