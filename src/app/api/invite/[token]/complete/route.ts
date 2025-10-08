import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import {loggers, logError} from '@/lib/logger'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }

    if (!token) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Find the invitation by token
    const { data: invitation, error: findError } = await supabaseAdmin
      .from('users')
      .select('id, email, invitation_token, invitation_expires_at')
      .eq('invitation_token', token)
      .single()

    if (findError || !invitation) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Check if invitation has expired
    const now = new Date()
    const expiresAt = new Date(invitation.invitation_expires_at)
    if (now > expiresAt) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Update the user record with the real Clerk ID and clear invitation token
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        clerk_id: userId,
        invitation_token: null,
        invitation_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', invitation.id)

    if (updateError) {
      loggers.database({ email: invitation.email, userId, error: updateError.message, operation: 'link_clerk_account' }, 'Error updating user with Clerk ID')
      return NextResponse.redirect(new URL('/', request.url))
    }

    loggers.auth({ email: invitation.email, userId, invitationId: invitation.id, success: true }, 'Successfully linked Clerk account to user via complete endpoint')

    // Redirect to main app
    return NextResponse.redirect(new URL('/', request.url))

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Operation failed'), {
      operation: 'API invite/[token]/complete',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Operation failed'
    })
return NextResponse.redirect(new URL('/', request.url))
  }
}