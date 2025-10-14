import { NextRequest, NextResponse } from 'next/server'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { Resend } from 'resend'
import { logger, logError } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    // Get request data
    const { name, email, subject, message } = await request.json()

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const cleanName = sanitizeInput(name)
    const cleanSubject = sanitizeInput(subject)
    const cleanMessage = sanitizeInput(message)

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Create email content
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Feedback from User</h2>

        <div style="background-color: #f9fafb; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;">
          <p><strong>From:</strong> ${cleanName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${cleanSubject}</p>
        </div>

        <div style="background-color: white; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.5rem;">
          <h3 style="margin-top: 0;">Message:</h3>
          <p style="white-space: pre-wrap;">${cleanMessage}</p>
        </div>

        <div style="margin-top: 1.5rem; padding: 1rem; background-color: #f3f4f6; border-radius: 0.5rem; font-size: 0.875rem; color: #6b7280;">
          <p>This feedback was sent through the Multiply Tools feedback form. You can reply directly to this email to respond to ${cleanName}.</p>
        </div>
      </div>
    `

    // Send email using Resend
    const emailResult = await resend.emails.send({
      from: 'Multiply Tools <noreply@multiplytools.app>',
      to: ['admin@multiplytools.app'],
      replyTo: email,
      subject: `[Feedback] ${cleanSubject}`,
      html: emailHtml,
    })

    if (emailResult.error) {
      logError(new Error('Failed to send feedback email'), {
        operation: 'POST /api/feedback',
        phase: 'email_sending',
        severity: 'high',
        errorContext: 'Resend API error',
        details: emailResult.error
      })
      return NextResponse.json(
        { success: false, error: 'Failed to send feedback' },
        { status: 500 }
      )
    }

    logger.info({
      from: email,
      name: cleanName,
      emailId: emailResult.data?.id
    }, 'Feedback email sent successfully')

    return NextResponse.json({
      success: true,
      message: 'Feedback sent successfully'
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Feedback submission failed'), {
      operation: 'POST /api/feedback',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Failed to process feedback submission'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send feedback'
      },
      { status: 500 }
    )
  }
}
