import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logError, logger } from '@/lib/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, church_ministry_affiliation, email_consent, sms_consent } = body

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { success: false, error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Validate email consent is required
    if (!email_consent) {
      return NextResponse.json(
        { success: false, error: 'You must consent to receive emails to join the waitlist' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate name length (reasonable limits)
    if (name.trim().length < 2 || name.trim().length > 100) {
      return NextResponse.json(
        { success: false, error: 'Name must be between 2 and 100 characters' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const { data: existingSignup } = await supabase
      .from('waitlist_signups')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existingSignup) {
      logger.info({
        email: email.toLowerCase().trim(),
        existingId: existingSignup.id
      }, 'Duplicate waitlist signup attempt')

      return NextResponse.json(
        {
          success: false,
          error: "You're already on the waitlist! We'll notify you when we're ready."
        },
        { status: 409 }
      )
    }

    // Insert new waitlist signup
    const { data: newSignup, error: insertError } = await supabase
      .from('waitlist_signups')
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        church_ministry_affiliation: church_ministry_affiliation?.trim() || null,
        email_consent: email_consent === true,
        sms_consent: sms_consent === true,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) {
      logError(insertError, {
        operation: 'waitlist_signup',
        phase: 'insert',
        email: email.toLowerCase().trim()
      })

      return NextResponse.json(
        { success: false, error: 'Failed to add you to the waitlist. Please try again.' },
        { status: 500 }
      )
    }

    logger.info({
      id: newSignup.id,
      email: email.toLowerCase().trim(),
      hasAffiliation: !!church_ministry_affiliation
    }, 'New waitlist signup')

    return NextResponse.json({
      success: true,
      message: "You're on the waitlist! We'll notify you when we're ready to send your invitation."
    })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Waitlist signup failed'), {
      operation: 'waitlist_signup',
      phase: 'request_handling'
    })

    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}

// GET endpoint for admins to view waitlist signups
export async function GET(_req: NextRequest) {
  try {
    // This endpoint requires admin authentication
    // For now, we'll return a simple count
    // You can expand this to return full list with authentication check

    const { count, error } = await supabase
      .from('waitlist_signups')
      .select('*', { count: 'exact', head: true })

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      count: count || 0
    })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to get waitlist count'), {
      operation: 'waitlist_get',
      phase: 'request_handling'
    })

    return NextResponse.json(
      { success: false, error: 'Failed to get waitlist information' },
      { status: 500 }
    )
  }
}
