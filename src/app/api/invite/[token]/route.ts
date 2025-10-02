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
        { success: false, error: 'Token required' },
        { status: 400 }
      )
    }

    // Find invitation by token
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

  } catch (_error) {
    return NextResponse.json(
      { success: false, error: 'Failed to validate invitation' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    const { clerkId, email } = await request.json()

    if (!token || !clerkId || !email) {
      return NextResponse.json(
        { success: false, error: 'Token, Clerk ID, and email required' },
        { status: 400 }
      )
    }

    // Find the invitation
    const { data: invitation, error: findError } = await supabaseAdmin
      .from('users')
      .select('id, email, invitation_token, invitation_expires_at')
      .eq('invitation_token', token)
      .single()

    if (findError || !invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    // Check if invitation has expired
    const now = new Date()
    const expiresAt = new Date(invitation.invitation_expires_at)
    if (now > expiresAt) {
      return NextResponse.json(
        { success: false, error: 'Invitation has expired' },
        { status: 400 }
      )
    }

    // Verify email matches
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Email does not match invitation' },
        { status: 400 }
      )
    }

    // Update the user record with the real Clerk ID and clear invitation token
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        clerk_id: clerkId,
        invitation_token: null,
        invitation_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', invitation.id)

    if (updateError) {
      console.error('Error updating user with Clerk ID:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to complete account setup' },
        { status: 500 }
      )
    }

    console.log(`Successfully linked Clerk account ${clerkId} to user ${email}`)

    return NextResponse.json({
      success: true,
      message: 'Account setup completed successfully'
    })

  } catch (_error) {
    return NextResponse.json(
      { success: false, error: 'Failed to complete account setup' },
      { status: 500 }
    )
  }
}