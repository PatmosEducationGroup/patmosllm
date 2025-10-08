// lib/get-identifier.ts
import { auth } from '@clerk/nextjs/server';

/**
 * Get a unique identifier for the current request.
 * Attempts to use authenticated user ID first, falls back to IP address.
 *
 * @param request - The incoming HTTP request
 * @returns A string identifier in format "user_{userId}" or "ip_{ipAddress}"
 */
export async function getIdentifier(request: Request): Promise<string> {
  try {
    // FIX: Added await to auth() call - this was causing race conditions
    const { userId } = await auth();
    if (userId) {
      return `user_${userId}`;
    }
  } catch (error) {
    // Log auth failures for debugging
    console.error('Auth failed in getIdentifier:', error);
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || 'unknown';

  return `ip_${ip}`;
}
