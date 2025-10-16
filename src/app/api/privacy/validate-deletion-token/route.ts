import { NextRequest, NextResponse } from 'next/server'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

/**
 * API Route: Validate Deletion Cancellation Token
 * Checks if a deletion token is valid and not expired
 *
 * @route POST /api/privacy/validate-deletion-token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token required' },
        { status: 400 }
      )
    }

    // Look up user by deletion token
    const result = await withSupabaseAdmin(async (supabase) => {
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, deleted_at, deletion_token_expires_at')
        .eq('deletion_token', token)
        .maybeSingle()

      if (error) throw error
      return user
    })

    if (!result) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid token'
      })
    }

    // Check if token has expired
    const now = new Date()
    const expiresAt = new Date(result.deletion_token_expires_at)

    if (expiresAt < now) {
      return NextResponse.json({
        valid: false,
        error: 'Token has expired'
      })
    }

    // Check if deletion is still scheduled
    if (!result.deleted_at) {
      return NextResponse.json({
        valid: false,
        error: 'Deletion has already been cancelled'
      })
    }

    return NextResponse.json({
      valid: true,
      email: result.email
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'validateDeletionToken',
      route: '/api/privacy/validate-deletion-token'
    })

    return NextResponse.json(
      { valid: false, error: 'Failed to validate token' },
      { status: 500 }
    )
  }
}
