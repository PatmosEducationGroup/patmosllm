/**
 * API Route: Check Migration Status
 *
 * Given an email, returns whether the user has migrated to Supabase Auth
 * Used by the login form to decide which password field to show
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, clerkUserId } = await request.json()

    if (!email && !clerkUserId) {
      return NextResponse.json(
        { error: 'Email or Clerk user ID required' },
        { status: 400 }
      )
    }

    let migrationData

    if (clerkUserId) {
      // Check by Clerk user ID
      const { data } = await supabaseAdmin
        .from('user_migration')
        .select('migrated, supabase_id')
        .eq('clerk_id', clerkUserId)
        .maybeSingle()
      migrationData = data
    } else {
      // Check by email
      const normalizedEmail = email.toLowerCase().trim()
      const { data } = await supabaseAdmin
        .from('user_migration')
        .select('migrated, supabase_id')
        .eq('email', normalizedEmail)
        .maybeSingle()
      migrationData = data
    }

    // If no record found, user hasn't been prepopulated (shouldn't happen)
    if (!migrationData) {
      return NextResponse.json({
        migrated: false,
        exists: false
      })
    }

    // Return migration status
    return NextResponse.json({
      migrated: migrationData.migrated,
      exists: true
    })
  } catch (error) {
    console.error('Error checking migration status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
