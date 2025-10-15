/**
 * API Route: User Email Preferences
 *
 * GET - Fetch user's email preferences
 * POST - Update user's email preferences
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withSupabaseAdmin } from '@/lib/supabase'
import { logError } from '@/lib/logger'

interface EmailPreferences {
  productUpdates: boolean
  activitySummaries: boolean
  tipsAndTricks: boolean
  securityAlerts: boolean
}

const DEFAULT_PREFERENCES: EmailPreferences = {
  productUpdates: true,
  activitySummaries: true,
  tipsAndTricks: false,
  securityAlerts: true
}

export async function GET() {
  try {
    // Get authenticated user
    const user = await getCurrentUser()

    if (!user) {
      console.log('[Email Preferences GET] No authenticated user found')
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    console.log('[Email Preferences GET] User authenticated:', { userId: user.id, email: user.email })

    // Fetch user preferences from database
    const preferences = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.log('[Email Preferences GET] Database error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        // If no preferences exist yet, return defaults
        if (error.code === 'PGRST116') {
          console.log('[Email Preferences GET] No existing preferences found, returning defaults')
          return null
        }
        throw error
      }
      console.log('[Email Preferences GET] Found existing preferences:', data)
      return data
    })

    // Extract email preferences from JSONB or use defaults
    const emailPreferences = preferences?.preferences?.emailPreferences || DEFAULT_PREFERENCES

    return NextResponse.json({
      success: true,
      preferences: emailPreferences
    })

  } catch (error) {
    console.error('[Email Preferences GET] Caught error:', error)
    logError(error instanceof Error ? error : new Error('Email preferences fetch failed'), {
      operation: 'GET /api/user/email-preferences',
      severity: 'medium'
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch email preferences'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getCurrentUser()

    if (!user) {
      console.log('[Email Preferences POST] No authenticated user found')
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    console.log('[Email Preferences POST] User authenticated:', { userId: user.id, email: user.email })

    // Parse request body
    const body = await request.json()
    const { productUpdates, activitySummaries, tipsAndTricks, securityAlerts } = body

    // Validate all fields are booleans
    if (
      typeof productUpdates !== 'boolean' ||
      typeof activitySummaries !== 'boolean' ||
      typeof tipsAndTricks !== 'boolean' ||
      typeof securityAlerts !== 'boolean'
    ) {
      return NextResponse.json({
        success: false,
        error: 'All preferences must be boolean values'
      }, { status: 400 })
    }

    const emailPreferences: EmailPreferences = {
      productUpdates,
      activitySummaries,
      tipsAndTricks,
      securityAlerts
    }

    // Check if user_preferences record exists
    const existingPrefs = await withSupabaseAdmin(async (supabase) => {
      const { data } = await supabase
        .from('user_preferences')
        .select('id, preferences')
        .eq('user_id', user.id)
        .single()
      return data
    })

    if (existingPrefs) {
      // Update existing preferences
      await withSupabaseAdmin(async (supabase) => {
        const { error } = await supabase
          .from('user_preferences')
          .update({
            preferences: {
              ...existingPrefs.preferences,
              emailPreferences
            },
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)

        if (error) throw error
      })
    } else {
      // Create new preferences record
      await withSupabaseAdmin(async (supabase) => {
        const { error } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            auth_user_id: user.auth_user_id,
            preferences: {
              emailPreferences
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (error) throw error
      })
    }

    // Log the preference change
    await withSupabaseAdmin(async (supabase) => {
      await supabase
        .from('privacy_audit_log')
        .insert({
          user_id: user.id,
          auth_user_id: user.auth_user_id,
          action: 'EMAIL_PREFERENCES_UPDATED',
          metadata: {
            preferences: emailPreferences,
            updated_at: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        })
    })

    return NextResponse.json({
      success: true,
      message: 'Email preferences updated successfully',
      preferences: emailPreferences
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Email preferences update failed'), {
      operation: 'POST /api/user/email-preferences',
      severity: 'high'
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to update email preferences'
    }, { status: 500 })
  }
}
