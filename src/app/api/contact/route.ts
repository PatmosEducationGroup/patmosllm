import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentUser } from '@/lib/auth'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { Resend } from 'resend'
import { logger, logError } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get request data
    const {
      to,
      contactPerson,
      documentTitle,
      senderName,
      senderEmail,
      subject,
      message
    } = await _request.json()

    // Validate required fields
    if (!to || !contactPerson || !documentTitle || !senderName || !senderEmail || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const cleanSenderName = sanitizeInput(senderName)
    const cleanSubject = sanitizeInput(subject)
    const cleanMessage = sanitizeInput(message)

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(senderEmail) || !emailRegex.test(to)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Create email content
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Message about "${documentTitle}"</h2>
        
        <div style="background-color: #f9fafb; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;">
          <p><strong>From:</strong> ${cleanSenderName} (${senderEmail})</p>
          <p><strong>Regarding:</strong> ${documentTitle}</p>
          <p><strong>Subject:</strong> ${cleanSubject}</p>
        </div>
        
        <div style="background-color: white; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.5rem;">
          <h3 style="margin-top: 0;">Message:</h3>
          <p style="white-space: pre-wrap;">${cleanMessage}</p>
        </div>
        
        <div style="margin-top: 1.5rem; padding: 1rem; background-color: #f3f4f6; border-radius: 0.5rem; font-size: 0.875rem; color: #6b7280;">
          <p>This message was sent through the Multiply Tools knowledge base system. You can reply directly to this email to respond to ${cleanSenderName}.</p>
        </div>
      </div>
    `

    // Send email using Resend
    const emailResult = await resend.emails.send({
      from: 'Multiply Tools <noreply@multiplytools.app>',
      to: [to],
      replyTo: senderEmail,
      subject: `[Multiply Tools] ${cleanSubject}`,
      html: emailHtml,
    })

    if (emailResult.error) {
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      )
    }

    logger.info({
      from: senderEmail,
      to,
      documentTitle,
      userId: user.id,
      emailId: emailResult.data?.id
    }, 'Contact email sent successfully')

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully'
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Contact email failed'), {
      operation: 'POST /api/contact',
      phase: 'email_sending',
      severity: 'high',
      errorContext: 'Failed to send contact email via Resend'
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send message'
      },
      { status: 500 }
    )
  }
}