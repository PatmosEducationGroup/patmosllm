import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const isProtectedRoute = createRouteMatcher([
  '/chat(.*)',
  '/admin(.*)',
  '/api/upload',
  '/api/ingest',
  '/api/chat',
  '/api/chat/clarify',
  '/api/question-assistant',
  '/api/documents'
])

const isPublicRoute = createRouteMatcher([
  '/api/webhooks/clerk(.*)', // Clerk webhooks must bypass auth
  '/api/auth/check-migration(.*)',
  '/api/auth/complete-migration(.*)',
  '/api/auth/clerk-signout(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  '/migrate-password(.*)'
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Quick Win: Request size limit (prevent DoS attacks)
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 10_000_000) { // 10MB limit for API requests
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Create response
  const response = NextResponse.next()

  // Skip auth for public routes (webhooks, login pages, etc.)
  if (isPublicRoute(req)) {
    // Add security headers and return
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://clerk.multiplytools.app https://challenges.cloudflare.com https://va.vercel-scripts.com",
      "worker-src 'self' blob: https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://clerk.multiplytools.app",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://api.openai.com https://*.supabase.co https://*.pinecone.io https://api.voyageai.com https://*.voyageai.com https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://clerk.multiplytools.app https://accounts.multiplytools.app https://challenges.cloudflare.com https://clerk-telemetry.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.sentry.io",
      "frame-src 'self' https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'"
    ]
    response.headers.set('Content-Security-Policy', cspDirectives.join('; '))

    if (process.env.NODE_ENV === 'production') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    return response
  }

  // PHASE 3: Dual-auth pattern - Check Supabase first, then Clerk
  if (isProtectedRoute(req)) {
    // STEP 1: Check for Supabase session (migrated users)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            response.cookies.set(name, value, options)
          },
          remove(name: string, options: Record<string, unknown>) {
            response.cookies.set(name, '', { ...options, maxAge: 0 })
          }
        }
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // If Supabase user exists, allow access (migrated user)
    if (user) {
      // User authenticated via Supabase - allow access
      // Response headers will be added below
    } else {
      // STEP 2: No Supabase session - fall back to Clerk
      await auth.protect()
    }
  }

  // Add security headers to ALL responses
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  
  // Content Security Policy - Updated for Cloudflare Turnstile & Vercel Analytics
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://clerk.multiplytools.app https://challenges.cloudflare.com https://va.vercel-scripts.com",
    "worker-src 'self' blob: https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://clerk.multiplytools.app",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.openai.com https://*.supabase.co https://*.pinecone.io https://api.voyageai.com https://*.voyageai.com https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev https://clerk.multiplytools.app https://accounts.multiplytools.app https://challenges.cloudflare.com https://clerk-telemetry.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.sentry.io",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'"
  ]
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '))
  
  // HSTS only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  
  return response
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}