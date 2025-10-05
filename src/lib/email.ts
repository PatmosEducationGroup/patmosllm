import { Resend } from 'resend'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function sendInvitationEmail(
  email: string,
  name: string,
  role: string,
  invitedBy: string,
  token: string,
  clerkTicket?: string | null
) {
  try {
    let inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`

    // Add Clerk ticket if available (required for Restricted mode)
    if (clerkTicket) {
      inviteUrl += `?__clerk_ticket=${clerkTicket}`
    }
    
    const { data, error } = await resend.emails.send({
      from: `${invitedBy} @ Multiply Tools <noreply-invitations@multiplytools.app>`,
      to: [email],
      subject: 'You\'re invited to join Multiply Tools',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px;">

          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px; font-weight: bold;">Multiply Tools</h1>
            <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Interact. Learn. Multiply.</p>
          </div>

          <!-- Main Content -->
          <div style="background-color: white; border-radius: 12px; padding: 32px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <p style="margin: 0 0 16px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">${invitedBy} has invited you to join Multiply Tools.</p>

            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">Multiply Tools is an AI-powered library for church, prayer, and missions. Instead of reading through thousands of pages, you can interact directly with the resources — ask questions, get clear answers, download materials, and connect with key leaders.</p>

            <p style="margin: 0 0 24px 0; font-size: 15px;">👉 <a href="${inviteUrl}" style="color: #2563eb; text-decoration: none; font-weight: 600;">Join Multiply Tools Library</a></p>

            <!-- Example Question Cards -->
            <p style="margin: 0 0 16px 0; color: #1f2937; font-size: 15px; font-weight: 600;">Try asking questions like:</p>

            <div style="margin-bottom: 12px; background: linear-gradient(135deg, #ef4444 0%, #ec4899 100%); border-radius: 8px; padding: 16px;">
              <div style="display: flex; align-items: start; gap: 16px;">
                <div style="font-size: 20px; flex-shrink: 0;">🤍</div>
                <div>
                  <p style="margin: 0 0 4px 0; color: white; font-weight: 600; font-size: 14px;">Teach me to pray for frontline workers in disaster areas.</p>
                  <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Learn compassionate prayer strategies for those serving in crisis situations</p>
                </div>
              </div>
            </div>

            <div style="margin-bottom: 12px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 8px; padding: 16px;">
              <div style="display: flex; align-items: start; gap: 16px;">
                <div style="font-size: 20px; flex-shrink: 0;">⛪</div>
                <div>
                  <p style="margin: 0 0 4px 0; color: white; font-weight: 600; font-size: 14px;">How can I start a church planting movement in my city?</p>
                  <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Discover practical steps and biblical foundations for church multiplication</p>
                </div>
              </div>
            </div>

            <div style="margin-bottom: 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 16px;">
              <div style="display: flex; align-items: start; gap: 16px;">
                <div style="font-size: 20px; flex-shrink: 0;">🔍</div>
                <div>
                  <p style="margin: 0 0 4px 0; color: white; font-weight: 600; font-size: 14px;">What are the most important areas of research in missions?</p>
                  <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Explore current trends and critical needs in global missions work</p>
                </div>
              </div>
            </div>

            <p style="margin: 0 0 12px 0; color: #1f2937; font-size: 15px; font-weight: 600;">With your account, you'll be able to:</p>
            <ul style="margin: 0 0 24px 0; padding-left: 24px; color: #4b5563; font-size: 14px; line-height: 1.8;">
              <li>Interact with the library through the chat — like talking with a mentor</li>
              <li>Download and use training resources instantly</li>
              <li>Contact the authors and trainers who created the materials directly</li>
            </ul>

            <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 13px;">This invitation link expires in 7 days.</p>

            <!-- CTA Button -->
            <div style="text-align: center;">
              <a href="${inviteUrl}" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.3);">
                Sign Up →
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; color: #9ca3af; font-size: 12px; padding: 16px;">
            <p style="margin: 0;">👉 <a href="${inviteUrl}" style="color: #3b82f6; text-decoration: none;">Click here to accept your invitation</a></p>
          </div>
        </div>
      `
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }
  } catch (_error) {
    return { success: false, error: 'Failed to send email' }
  }
}