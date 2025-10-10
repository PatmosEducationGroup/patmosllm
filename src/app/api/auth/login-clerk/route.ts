/**
 * API Route: Clerk Login
 *
 * Authenticates unmigrated users via Clerk server-side
 * Then triggers migration to Supabase automatically
 */

import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { migrateUserToSupabase } from '@/lib/auth-migration'
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
    const client = await clerkClient()

    // Instead of using SignIn API (which doesn't work server-side),
    // we need to verify the user exists and get their ID
    // Then use the migration library which handles the password verification
    console.log('[CLERK LOGIN] Looking up user by email:', normalizedEmail)

    // Get user list and find by email
    const { data: users } = await client.users.getUserList({
      emailAddress: [normalizedEmail]
    })

    if (!users || users.length === 0) {
      console.log('[CLERK LOGIN] User not found')
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const user = users[0]
    console.log('[CLERK LOGIN] Found user:', user.id)

    // Check if user has password authentication enabled
    if (!user.passwordEnabled) {
      console.log('[CLERK LOGIN] User does not have password auth enabled')
      return NextResponse.json(
        { error: 'This account uses a different sign-in method' },
        { status: 400 }
      )
    }

    // Migrate user to Supabase
    const userId = user.id
    if (!userId) {
      return NextResponse.json(
        { error: 'Failed to get user ID from Clerk' },
        { status: 500 }
      )
    }

    const migratedUser = await migrateUserToSupabase(
      normalizedEmail,
      password,
      userId
    )

    if (!migratedUser) {
      return NextResponse.json(
        { error: 'Migration failed. Please try again.' },
        { status: 500 }
      )
    }

    // Now log them into Supabase
    const cookieStore = await cookies()
    const responseHeaders = new Headers()

    const cookieAdapter = {
      get: (name: string) => cookieStore.get(name)?.value,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        const cookie = [
          `${name}=${value}`,
          `Path=${options?.path ?? '/'}`,
          'HttpOnly',
          `SameSite=${options?.sameSite ?? 'Lax'}`,
          options?.secure ? 'Secure' : '',
          options?.maxAge ? `Max-Age=${options.maxAge}` : '',
          options?.domain ? `Domain=${options.domain}` : ''
        ]
          .filter(Boolean)
          .join('; ')
        responseHeaders.append('Set-Cookie', cookie)
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

    // Sign them into Supabase with their new password
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    })

    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Login failed after migration' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        source: 'clerk-migrated',
        redirect: '/chat'
      },
      { status: 200, headers: responseHeaders }
    )
  } catch (error) {
    console.error('[CLERK LOGIN] Error during Clerk login:', error)
    console.error('[CLERK LOGIN] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
