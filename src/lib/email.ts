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
  token: string
) {
  try {
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    
    const { data, error } = await resend.emails.send({
      from: 'Heaven.Earth <noreply@heaven.earth>',
      to: [email],
      subject: 'You\'re invited to join Heaven.Earth',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You're invited to join Heaven.Earth</h2>
          <p>Hello${name ? ` ${name}` : ''},</p>
          <p>${invitedBy} has invited you to join Heaven.Earth as a <strong>${role}</strong>.</p>
          <p>Heaven.Earth is an AI-powered document Q&A system where you can upload documents and ask intelligent questions about their content.</p>
          <div style="margin: 30px 0;">
            <a href="${inviteUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p>Your role as ${role} gives you the following permissions:</p>
          <ul>
            ${role === 'ADMIN' ? '<li>Full system administration</li><li>Upload and manage documents</li><li>Chat with AI</li>' : ''}
            ${role === 'CONTRIBUTOR' ? '<li>Upload documents</li><li>Chat with AI</li>' : ''}
            ${role === 'USER' ? '<li>Chat with AI</li>' : ''}
          </ul>
          <p>This invitation link expires in 7 days.</p>
          <p>If you have any questions, please contact your administrator.</p>
        </div>
      `
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }
  } catch (error) {
    return { success: false, error: 'Failed to send email' }
  }
}