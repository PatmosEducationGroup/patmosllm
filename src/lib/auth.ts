import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from './supabase'
import { User } from './types'

// Get current user from database (server-side)
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return null
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clerk_id', userId)
      .single()

    if (error || !user) {
      return null
    }

    return user
  } catch (_error) {
    return null
  }
}

// Check if user has admin privileges
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'ADMIN'
}

// Check if user can upload (ADMIN or CONTRIBUTOR)
export async function canUpload(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'ADMIN' || user?.role === 'CONTRIBUTOR'
}

// Sync Clerk user with our database
export async function syncUserWithDatabase(clerkUser: {
  id: string
  emailAddresses: Array<{ emailAddress: string }>
  firstName?: string | null
  lastName?: string | null
}): Promise<User | null> {
  try {
    const email = clerkUser.emailAddresses[0]?.emailAddress
    const name = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(' ') || undefined

    // Check if user already exists by clerk_id
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clerk_id', clerkUser.id)
      .single()

    if (existingUser) {
      // Update existing user
      const { data: updatedUser, error } = await supabaseAdmin
        .from('users')
        .update({
          email,
          name,
          updated_at: new Date().toISOString()
        })
        .eq('clerk_id', clerkUser.id)
        .select()
        .single()

      if (error) throw error
      return updatedUser
    } else {
      // Check if user was pre-invited by email
      const { data: invitedUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email?.toLowerCase())
        .single()

      if (invitedUser && invitedUser.clerk_id.startsWith('invited_')) {
        // Update invited user with real Clerk ID
        const { data: activatedUser, error } = await supabaseAdmin
          .from('users')
          .update({
            clerk_id: clerkUser.id,
            name: name || invitedUser.name,
            updated_at: new Date().toISOString()
          })
          .eq('id', invitedUser.id)
          .select()
          .single()

        if (error) throw error
        console.log(`Activated invited user: ${email}`)
        return activatedUser
      }

      // Check if this is the first user (bootstrap case)
      const { count } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })

      if (count === 0) {
        // First user becomes admin
        const { data: newUser, error } = await supabaseAdmin
          .from('users')
          .insert({
            clerk_id: clerkUser.id,
            email,
            name,
            role: 'ADMIN'
          })
          .select()
          .single()

        if (error) throw error
        return newUser
      }

      // User not invited - reject
      console.log(`Rejected non-invited user: ${email}`)
      return null
    }
  } catch (_error) {
    return null
  }
}