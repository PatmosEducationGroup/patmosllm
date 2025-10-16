import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * API Route: Sign Out
 * Logs out the user from Supabase Auth
 *
 * @route POST /api/auth/signout
 */
export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true })

    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            response.cookies.set(name, value, options)
          },
          remove(name: string, options: Record<string, unknown>) {
            response.cookies.set(name, '', { ...options, maxAge: 0 })
          }
        }
      }
    )

    // Sign out from Supabase
    await supabase.auth.signOut()

    return response

  } catch (error) {
    console.error('[Signout Error]', error)
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    )
  }
}
