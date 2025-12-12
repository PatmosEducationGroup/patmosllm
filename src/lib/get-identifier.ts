// lib/get-identifier.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Truncate IP address for GDPR compliance (data minimization).
 * Converts full IP to subnet level: 192.168.1.100 -> 192.168.x.x
 *
 * @param ip - Full IP address
 * @returns Truncated IP address (last 2 octets replaced with 'x')
 */
function truncateIP(ip: string): string {
  if (ip === 'unknown') return ip

  const parts = ip.split('.')
  if (parts.length === 4) {
    // IPv4: Keep first 2 octets, anonymize last 2
    return `${parts[0]}.${parts[1]}.x.x`
  }

  // IPv6 or other format: truncate last 4 characters
  return ip.slice(0, -4) + 'xxxx'
}

/**
 * Get a unique identifier for the current request.
 * Attempts to use authenticated user ID first, falls back to IP address.
 *
 * @param request - The incoming HTTP request
 * @returns A string identifier in format "user_{userId}" or "ip_{ipAddress}"
 */
export async function getIdentifier(request: Request): Promise<string> {
  try {
    // Check Supabase Auth
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {}
        }
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (user?.id) {
      return `user_${user.id}`
    }
  } catch (error) {
    // Log auth failures for debugging
    console.error('Auth failed in getIdentifier:', error)
  }

  // Fall back to IP address (GDPR: truncated for privacy)
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || 'unknown'

  return `ip_${truncateIP(ip)}`
}
