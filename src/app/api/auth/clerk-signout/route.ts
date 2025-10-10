/**
 * API Route: Clerk Sign Out
 *
 * Signs user out of Clerk after migration is complete
 * Ensures clean transition to Supabase Auth
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function POST(_request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      // Already signed out
      return NextResponse.json({ success: true })
    }

    // Sign out of Clerk by clearing session cookie
    const response = NextResponse.json({ success: true })

    // Clear Clerk session cookies
    response.cookies.delete('__session')
    response.cookies.delete('__clerk_db_jwt')

    return response
  } catch (error) {
    console.error('Error signing out of Clerk:', error)
    // Don't fail - user can still continue to login
    return NextResponse.json({ success: true })
  }
}
