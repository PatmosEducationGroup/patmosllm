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

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // IMPORTANT: Skip middleware entirely for webhook routes
  // Webhooks must be completely public (no Clerk processing at all)
  if (req.nextUrl.pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  // Quick Win: Request size limit (prevent DoS attacks)
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 10_000_000) { // 10MB limit for API requests
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Create response object for headers
  const response = NextResponse.next()

  // PHASE 3: Dual-auth pattern - ONLY protect routes that need auth
  // All other routes are public by default (clerkMiddleware behavior)
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

    const { data: { user: supabaseUser } } = await supabase.auth.getUser()

    // If Supabase user exists, allow access (migrated user)
    if (supabaseUser) {
      // User authenticated via Supabase - allow access
      // Response headers will be added below
    } else {
      // STEP 2: No Supabase session - check Clerk
      const { userId } = await auth()

      if (userId) {
        // User has Clerk session - check if they need to migrate
        // Get user email from Clerk to check migration status
        const { clerkClient } = await import('@clerk/nextjs/server')
        const client = await clerkClient()
        const clerkUser = await client.users.getUser(userId)
        const email = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase()

        if (email) {
          // Check migration status
          const { data: migrationStatus } = await supabase
            .from('user_migration')
            .select('migrated')
            .eq('email', email)
            .maybeSingle()

          // If user is NOT migrated, force them to migrate-password page
          if (migrationStatus && !migrationStatus.migrated) {
            // Allow access to migrate-password page itself
            if (!req.nextUrl.pathname.startsWith('/migrate-password')) {
              return NextResponse.redirect(new URL('/migrate-password', req.url))
            }
          }
        }

        // User has valid Clerk session, allow access
      } else {
        // No Clerk or Supabase session - require auth
        await auth.protect()
      }
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
    // API routes EXCEPT webhooks (webhooks must be completely excluded)
    '/((?!api/webhooks)api|trpc)(.*)',
  ],
}