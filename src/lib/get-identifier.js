// lib/get-identifier.js
import { auth } from '@clerk/nextjs/server';

export function getIdentifier(request) {
  try {
    // Try to get the user ID from Clerk first
    const { userId } = auth();
    if (userId) {
      return `user_${userId}`;
    }
  } catch (error) {
    // If auth fails, fall back to IP
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded 
    ? forwarded.split(',')[0].trim() 
    : request.headers.get('x-real-ip') || 'unknown';
    
  return `ip_${ip}`;
}