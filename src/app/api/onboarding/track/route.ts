// File: src/app/api/onboarding/track/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { trackOnboardingMilestone, MilestoneType } from '@/lib/onboardingTracker'

export async function POST(request: NextRequest) {
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
      const body = await request.json()
      milestone = body.milestone
      metadata = body.metadata || {}
    } catch (parseError) {
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
        user_agent: request.headers.get('user-agent') || 'unknown',
        // Fix 4: Better IP address extraction
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   request.headers.get('x-real-ip') || 
                   request.headers.get('cf-connecting-ip') || // Cloudflare
                   'unknown',
        // Fix 5: Add additional useful metadata
        referer: request.headers.get('referer') || 'unknown',
        origin: request.headers.get('origin') || 'unknown'
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
    console.error('Error in milestone tracking API:', error)
    
    // Fix 6: Better error logging with context
    console.error('Request details:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    })
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}