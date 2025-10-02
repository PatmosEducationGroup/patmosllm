// Check if invitation has clerk_ticket
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const token = 'bd98171b758cae851204e567b6c8c429b31f2323302cd578e1cdc7633e547386'

async function checkInvitation() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, clerk_id, invitation_token, clerk_ticket, created_at')
    .eq('invitation_token', token)
    .single()

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('Invitation details:')
  console.log('Email:', data.email)
  console.log('Created:', data.created_at)
  console.log('Has clerk_ticket column:', data.hasOwnProperty('clerk_ticket'))
  console.log('Clerk ticket value:', data.clerk_ticket || 'NULL/MISSING')
}

checkInvitation()
