/**
 * API Route: Update User Password
 *
 * POST - Change user's password after verifying current password
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
    const { currentPassword, newPassword } = body

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return NextResponse.json({
        success: false,
        error: 'Current password and new password are required'
      }, { status: 400 })
    }

    // Password validation
    if (newPassword.length < 8) {
      return NextResponse.json({
        success: false,
        error: 'New password must be at least 8 characters long'
      }, { status: 400 })
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({
        success: false,
        error: 'New password must be different from current password'
      }, { status: 400 })
    }

    // Verify current password and update to new password
    const updateResult = await withSupabaseAdmin(async (supabase) => {
      if (!user.auth_user_id) {
        throw new Error('Auth user ID not found')
      }

      // Get user's email for sign-in verification
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single()

      if (userError || !userData) {
        throw new Error('User not found')
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: currentPassword
      })

      if (signInError) {
        return { success: false, error: 'Current password is incorrect' }
      }

      // Update password using admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.auth_user_id,
        { password: newPassword }
      )

      if (updateError) {
        throw updateError
      }

      return { success: true }
    })

    if (!updateResult.success) {
      return NextResponse.json({
        success: false,
        error: updateResult.error
      }, { status: 401 })
    }

    // Log the password change
    await withSupabaseAdmin(async (supabase) => {
      await supabase
        .from('privacy_audit_log')
        .insert({
          user_id: user.id,
          auth_user_id: user.auth_user_id,
          action: 'PASSWORD_CHANGED',
          metadata: {
            changed_at: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        })
    })

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully'
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Password update failed'), {
      operation: 'POST /api/user/update-password',
      severity: 'high'
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to update password'
    }, { status: 500 })
  }
}
