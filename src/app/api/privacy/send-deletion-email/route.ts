import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getCurrentUser } from '@/lib/auth'
import { logError } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * API Route: Send Account Deletion Confirmation Email
 * Sends an email with cancellation link when user schedules deletion
 *
 * @route POST /api/privacy/send-deletion-email
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { email, deletionDate, deletionToken } = body

    if (!email || !deletionDate || !deletionToken) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate cancellation magic link
    const cancellationLink = `${process.env.NEXT_PUBLIC_APP_URL}/cancel-deletion/${deletionToken}`

    // Format deletion date
    const formattedDate = new Date(deletionDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    // Calculate days remaining
    const daysRemaining = Math.ceil(
      (new Date(deletionDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    )

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: 'Multiply Tools <noreply@multiplytools.app>',
      to: [email],
      subject: 'Account Deletion Scheduled - You can still cancel',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">Multiply Tools</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Account Deletion Scheduled</p>
            </div>

            <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #ef4444; margin-top: 0;">⚠️ Your Account Deletion is Scheduled</h2>

              <p>We've received your request to delete your Multiply Tools account. Your account is scheduled for permanent deletion on:</p>

              <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
                <p style="font-size: 18px; font-weight: bold; color: #991b1b; margin: 0;">
                  ${formattedDate}
                </p>
                <p style="color: #991b1b; margin: 5px 0 0 0;">
                  ${daysRemaining} days remaining
                </p>
              </div>

              <h3 style="color: #059669;">✅ You Can Cancel At Any Time</h3>

              <p>Changed your mind? You can cancel your account deletion at any time during the 30-day grace period.</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${cancellationLink}"
                   style="display: inline-block; background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Cancel Account Deletion
                </a>
              </div>

              <p style="text-align: center; font-size: 12px; color: #6b7280; margin-top: 10px;">
                Or copy this link: <a href="${cancellationLink}" style="color: #3b82f6; text-decoration: none;">${cancellationLink}</a>
              </p>

              <h3>What happens during the grace period:</h3>
              <ul style="color: #4b5563;">
                <li>You can still log in and use your account normally</li>
                <li>All your data remains accessible</li>
                <li>You can cancel the deletion from your settings page</li>
                <li>After 30 days, all your data will be permanently deleted</li>
              </ul>

              <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #1e3a8a;">
                  <strong>Need help?</strong> If you're deleting your account due to an issue, please contact our support team. We're here to help!
                </p>
              </div>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

              <p style="font-size: 12px; color: #6b7280; text-align: center;">
                This is an automated message from Multiply Tools.<br>
                If you didn't request account deletion, please contact support immediately.
              </p>
            </div>
          </body>
        </html>
      `
    })

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'sendDeletionEmail',
      route: '/api/privacy/send-deletion-email'
    })

    return NextResponse.json(
      { error: 'Failed to send deletion email' },
      { status: 500 }
    )
  }
}
