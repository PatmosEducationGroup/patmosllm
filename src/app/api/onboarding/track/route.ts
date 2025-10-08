// File: src/app/api/onboarding/track/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { trackOnboardingMilestone, MilestoneType } from '@/lib/onboardingTracker'

export async function POST(_request: NextRequest) {
  try {
    // Fix 1: Add await to auth() call
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fix 2: Add proper error handling for JSON parsing
    let milestone: MilestoneType
    let metadata = {}
    
    try {
      const body = await _request.json()
      milestone = body.milestone
      metadata = body.metadata || {}
    } catch (error) {
    logError(error instanceof Error ? error : new Error('Operation failed'), {
      operation: 'API onboarding/track',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Operation failed'
    })
return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
  }

    // Fix 3: Check if milestone is provided
    if (!milestone) {
      return NextResponse.json(
        { error: 'Milestone is required' },
        { status: 400 }
      )
    }

    // Validate milestone type
    const validMilestones: MilestoneType[] = [
      'invited',
      'first_login', 
      'first_document_view',
      'first_document_upload',
      'first_chat',
      'first_successful_answer',
      'onboarding_complete'
    ]

    if (!validMilestones.includes(milestone)) {
      return NextResponse.json(
        { error: `Invalid milestone type. Valid types: ${validMilestones.join(', ')}` },
        { status: 400 }
      )
    }

    // Track the milestone with enhanced metadata
    const success = await trackOnboardingMilestone({
      clerkUserId: userId,
      milestone,
      metadata: {
        ...metadata,
        tracked_at: new Date().toISOString(),
        user_agent: _request.headers.get('user-agent') || 'unknown',
        // Fix 4: Better IP address extraction
        ip_address: _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   _request.headers.get('x-real-ip') ||
                   _request.headers.get('cf-connecting-ip') || // Cloudflare
                   'unknown',
        // Fix 5: Add additional useful metadata
        referer: _request.headers.get('referer') || 'unknown',
        origin: _request.headers.get('origin') || 'unknown'
      }
    })

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to track milestone - database error' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      milestone,
      userId,
      tracked_at: new Date().toISOString()
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API onboarding/track',
      phase: 'request_handling',
      severity: 'medium',
      errorContext: 'Internal server error'
    })
// Fix 6: Better error logging with context
    console.error('Request details:', {
      method: _request.method,
      url: _request.url,
      headers: Object.fromEntries(_request.headers.entries())
    })
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}