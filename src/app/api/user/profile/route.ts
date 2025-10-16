/**
 * API Route: User Profile
 *
 * GET - Fetch current user's profile information
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

export async function GET() {
  try {
    // Get authenticated user
    const user = await getCurrentUser()

    if (!user) {
      console.log('[Profile API] No authenticated user found')
      return NextResponse.json({
        success: false,
        error: 'Authentication required. Please log in to view your profile.'
      }, { status: 401 })
    }

    console.log('[Profile API] User authenticated:', { userId: user.id, email: user.email })

    // Fetch user profile from database
    const profile = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('users')
        .select('name, email, role, created_at, deleted_at')
        .eq('id', user.id)
        .single()

      if (error) throw error
      return data
    })

    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'Profile not found'
      }, { status: 404 })
    }

    console.log('[Profile API] Profile data:', {
      userId: user.id,
      hasDeletedAt: !!profile.deleted_at,
      deleted_at: profile.deleted_at
    })

    return NextResponse.json({
      success: true,
      profile: {
        name: profile.name || profile.email?.split('@')[0] || 'User',
        email: profile.email,
        role: profile.role,
        createdAt: profile.created_at,
        deleted_at: profile.deleted_at
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Profile fetch failed'), {
      operation: 'GET /api/user/profile',
      severity: 'high'
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch profile'
    }, { status: 500 })
  }
}
