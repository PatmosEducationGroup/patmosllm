// File: src/app/api/onboarding/track/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { trackOnboardingMilestone, MilestoneType } from '@/lib/onboardingTracker'

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { milestone, metadata = {} } = await request.json()

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
        { error: 'Invalid milestone type' },
        { status: 400 }
      )
    }

    // Track the milestone
    const success = await trackOnboardingMilestone({
      clerkUserId: userId,
      milestone,
      metadata: {
        ...metadata,
        tracked_at: new Date().toISOString(),
        user_agent: request.headers.get('user-agent') || 'unknown',
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 'unknown'
      }
    })

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to track milestone' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      milestone,
      tracked_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in milestone tracking API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}