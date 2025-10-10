/**
 * API Route: Supabase Login
 *
 * Authenticates migrated users via Supabase Auth
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Create Supabase server client with cookie handling
    const cookieStore = await cookies()
    const responseHeaders = new Headers()

    const cookieAdapter = {
      get: (name: string) => cookieStore.get(name)?.value,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        // Build cookie string - DON'T force HttpOnly (Supabase needs client-side access)
        const cookieParts = [
          `${name}=${value}`,
          `Path=${options?.path ?? '/'}`,
          `SameSite=${options?.sameSite ?? 'Lax'}`
        ]

        // Only add these if explicitly set
        if (options?.secure) cookieParts.push('Secure')
        if (options?.httpOnly) cookieParts.push('HttpOnly')
        if (options?.maxAge) cookieParts.push(`Max-Age=${options.maxAge}`)
        if (options?.domain) cookieParts.push(`Domain=${options.domain}`)

        responseHeaders.append('Set-Cookie', cookieParts.join('; '))
      },
      remove: (name: string, options: Record<string, unknown>) => {
        responseHeaders.append(
          'Set-Cookie',
          `${name}=; Path=${options?.path ?? '/'}; Max-Age=0`
        )
      }
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieAdapter as never }
    )

    // Attempt Supabase login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    })

    if (error) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Login failed' }, { status: 500 })
    }

    // IMPORTANT: Clear any existing Clerk session cookies
    // This ensures the user is fully migrated to Supabase Auth
    const clerkCookies = [
      '__client',
      '__session',
      '__clerk_db_jwt'
    ]

    clerkCookies.forEach(cookieName => {
      cookieStore.getAll().forEach(cookie => {
        if (cookie.name.includes(cookieName)) {
          responseHeaders.append(
            'Set-Cookie',
            `${cookie.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
          )
        }
      })
    })

    return NextResponse.json(
      {
        success: true,
        source: 'supabase',
        redirect: '/chat'
      },
      { status: 200, headers: responseHeaders }
    )
  } catch (error) {
    console.error('Error during Supabase login:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
