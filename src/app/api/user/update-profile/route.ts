/**
 * API Route: Update User Profile
 *
 * POST - Update user's name and email
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { name, email } = body

    // Validate inputs
    if (!name || !email) {
      return NextResponse.json({
        success: false,
        error: 'Name and email are required'
      }, { status: 400 })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 })
    }

    const isEmailChanged = email !== user.email

    // If email is changing, check if new email is already in use
    if (isEmailChanged) {
      const existingUser = await withSupabaseAdmin(async (supabase) => {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .neq('id', user.id)
          .single()
        return data
      })

      if (existingUser) {
        return NextResponse.json({
          success: false,
          error: 'Email address is already in use'
        }, { status: 409 })
      }
    }

    // Update profile in database
    await withSupabaseAdmin(async (supabase) => {
      const { error } = await supabase
        .from('users')
        .update({
          name,
          email,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error
    })

    // If email changed, update in Supabase Auth
    if (isEmailChanged) {
      await withSupabaseAdmin(async (supabase) => {
        if (!user.auth_user_id) {
          throw new Error('Auth user ID not found')
        }

        const { error } = await supabase.auth.admin.updateUserById(
          user.auth_user_id,
          { email }
        )

        if (error) throw error
      })
    }

    // Log the change
    await withSupabaseAdmin(async (supabase) => {
      await supabase
        .from('privacy_audit_log')
        .insert({
          user_id: user.id,
          auth_user_id: user.auth_user_id,
          action: 'PROFILE_UPDATED',
          metadata: {
            name_changed: true,
            email_changed: isEmailChanged,
            old_email: isEmailChanged ? user.email : undefined,
            new_email: isEmailChanged ? email : undefined
          },
          created_at: new Date().toISOString()
        })
    })

    return NextResponse.json({
      success: true,
      message: isEmailChanged
        ? 'Profile updated. Please check your new email for verification.'
        : 'Profile updated successfully',
      emailChanged: isEmailChanged
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Profile update failed'), {
      operation: 'POST /api/user/update-profile',
      severity: 'high'
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to update profile'
    }, { status: 500 })
  }
}
