import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .eq('clerk_id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'User not found in database' },
        { status: 404 }
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