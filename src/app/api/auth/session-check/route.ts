/**
 * API Route: Session Check
 *
 * Diagnostic endpoint to verify session persistence and token status.
 * Useful for debugging "stay logged in" issues.
 *
 * Usage: GET /api/auth/session-check
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(_request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {},
        remove() {}
      }
    }
  )

  const {
    data: { session },
    error
  } = await supabase.auth.getSession()

  if (error) {
    return NextResponse.json({
      authenticated: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      message: 'No session found',
      timestamp: new Date().toISOString(),
      cookies: {
        allCookies: cookieStore.getAll().map((c) => ({
          name: c.name,
          hasValue: !!c.value,
          length: c.value?.length
        }))
      }
    })
  }

  // Calculate token expiration details
  const expiresAt = new Date(session.expires_at! * 1000)
  const now = new Date()
  const timeUntilExpiry = expiresAt.getTime() - now.getTime()
  const minutesUntilExpiry = Math.round(timeUntilExpiry / 1000 / 60)

  // Check if token should be refreshed soon
  const shouldRefreshSoon = minutesUntilExpiry < 5

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      createdAt: session.user.created_at
    },
    session: {
      expiresAt: expiresAt.toISOString(),
      minutesUntilExpiry,
      shouldRefreshSoon,
      hasRefreshToken: !!session.refresh_token,
      accessTokenLength: session.access_token?.length
    },
    cookies: {
      authTokenPresent: !!cookieStore
        .getAll()
        .find((c) => c.name.includes('sb-') && c.name.includes('auth-token')),
      allSupabaseCookies: cookieStore
        .getAll()
        .filter((c) => c.name.includes('sb-'))
        .map((c) => ({
          name: c.name,
          hasValue: !!c.value,
          length: c.value?.length
        }))
    },
    timestamp: new Date().toISOString()
  })
}
