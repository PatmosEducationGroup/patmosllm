/**
 * API Route: Clerk Sign Out
 *
 * Signs user out of Clerk after migration is complete
 * Ensures clean transition to Supabase Auth
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'

export async function POST(_request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      // Already signed out
      return NextResponse.json({ success: true })
    }

    // Sign out of Clerk by clearing ALL Clerk-related cookies
    const response = NextResponse.json({ success: true })
    const cookieStore = await cookies()

    // Clear all Clerk cookies (including __client, __session, __clerk_db_jwt, etc.)
    const clerkCookiePatterns = ['__client', '__session', '__clerk']

    cookieStore.getAll().forEach(cookie => {
      if (clerkCookiePatterns.some(pattern => cookie.name.includes(pattern))) {
        response.cookies.set(cookie.name, '', {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'lax'
        })
      }
    })

    return response
  } catch (error) {
    console.error('Error signing out of Clerk:', error)
    // Don't fail - user can still continue to login
    return NextResponse.json({ success: true })
  }
}
