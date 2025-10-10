import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { logError } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  try {
    // PHASE 3: Use getCurrentUser() which supports dual-read (Supabase + Clerk)
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Auth verification failed'), {
      operation: 'GET /api/auth',
      phase: 'user_verification',
      severity: 'critical',
      errorContext: 'Failed to verify user authentication status'
    })
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}