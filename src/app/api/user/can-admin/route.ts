import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

/**
 * Check if current user has admin access
 * Returns true for SUPER_ADMIN, ADMIN, or CONTRIBUTOR roles
 */
export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ canAdmin: false }, { status: 200 })
    }

    const canAdmin =
      user.role === 'SUPER_ADMIN' ||
      user.role === 'ADMIN' ||
      user.role === 'CONTRIBUTOR'

    return NextResponse.json({ canAdmin }, { status: 200 })
  } catch (error) {
    console.error('Error checking admin access:', error)
    return NextResponse.json({ canAdmin: false }, { status: 200 })
  }
}
