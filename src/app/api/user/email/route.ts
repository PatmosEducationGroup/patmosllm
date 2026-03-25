/**
 * API Route: Get Current User's Email
 *
 * Returns the authenticated user's email address
 * Used by the migration page to pre-fill the email field
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { logError } from '@/lib/logger'

export async function GET() {
  try {
    // getCurrentUser() handles Supabase auth
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // User email is available directly from the database
    if (!user.email) {
      return NextResponse.json({ error: 'No email found' }, { status: 404 })
    }

    return NextResponse.json({ email: user.email })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to fetch user email'), { operation: 'GET /api/user/email' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
