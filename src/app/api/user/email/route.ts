/**
 * API Route: Get Current User's Email
 *
 * Returns the authenticated user's email address
 * Used by the migration page to pre-fill the email field
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const primaryEmail = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )?.emailAddress

    if (!primaryEmail) {
      return NextResponse.json({ error: 'No email found' }, { status: 404 })
    }

    return NextResponse.json({ email: primaryEmail })
  } catch (error) {
    console.error('Error fetching user email:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
