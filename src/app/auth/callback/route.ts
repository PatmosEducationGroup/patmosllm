/**
 * Supabase Auth Callback Route
 *
 * Handles OAuth callbacks and email confirmations from Supabase Auth
 * Used for password resets and email verifications during migration
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next') || '/chat'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: Record<string, unknown>) {
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          }
        }
      }
    )

    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth callback error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=auth_failed`)
    }

    // Check if this is a password recovery
    if (type === 'recovery') {
      // Redirect to update password page
      return NextResponse.redirect(`${requestUrl.origin}/update-password`)
    }

    // Successful auth - redirect to app
    return NextResponse.redirect(`${requestUrl.origin}${next}`)
  }

  // No code in URL - something went wrong
  return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=no_code`)
}
