import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { logger } from '@/lib/logger'

// Cache for the `deleted_at` DB check.
// Key: auth_user_id, Value: { deletedAt: string | null, expiresAt: number }
const DELETION_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface DeletionCacheEntry {
  deletedAt: string | null
  expiresAt: number
}

const deletionCache = new Map<string, DeletionCacheEntry>()

// Routes that require authentication
const protectedRoutes = [
  '/chat',
  '/admin',
  '/settings',
  '/api/upload',
  '/api/ingest',
  '/api/chat',
  '/api/chat/clarify',
  '/api/question-assistant',
  '/api/documents'
]

function isProtectedRoute(pathname: string): boolean {
  return protectedRoutes.some(route => pathname.startsWith(route))
}

export default async function middleware(req: NextRequest) {
  // Skip middleware entirely for webhook routes (must be public)
  if (req.nextUrl.pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  // Skip middleware for Sentry tunnel route (no auth needed, just proxies to Sentry)
  if (req.nextUrl.pathname.startsWith('/monitoring')) {
    return NextResponse.next()
  }

  // Request size limit (prevent DoS attacks) - 10MB limit for API requests
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 10_000_000) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Create response object for headers
  const response = NextResponse.next()

  // Create Supabase clients
  const supabaseAnon = createServerClient(
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

  // Admin client for deletion check (bypasses RLS)
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const { data: { user: supabaseUser } } = await supabaseAnon.auth.getUser()

  logger.debug({ path: req.nextUrl.pathname, hasUser: !!supabaseUser, userId: supabaseUser?.id }, '[MIDDLEWARE] Path check')

  // CRITICAL: Check for scheduled deletion BEFORE any other checks
  if (supabaseUser) {
    const userId = supabaseUser.id
    const now = Date.now()
    const cached = deletionCache.get(userId)

    let deletedAt: string | null

    if (cached && now < cached.expiresAt) {
      // Cache hit - skip the DB query
      logger.debug({ userId }, '[MIDDLEWARE] Deletion check cache hit')
      deletedAt = cached.deletedAt
    } else {
      // Cache miss - query the DB and store the result
      logger.debug({ userId }, '[MIDDLEWARE] Querying users table for deletion status')
      const { data: userData, error: queryError } = await supabaseAdmin
        .from('users')
        .select('deleted_at')
        .eq('auth_user_id', userId)
        .maybeSingle()

      logger.debug({ userId, hasData: !!userData, hasError: !!queryError }, '[MIDDLEWARE] Deletion check result')

      deletedAt = userData?.deleted_at ?? null
      deletionCache.set(userId, { deletedAt, expiresAt: now + DELETION_CACHE_TTL_MS })
    }

    if (deletedAt) {
      logger.debug({ userId, deletedAt }, '[MIDDLEWARE] User has deletion scheduled')

      // User has scheduled deletion - only allow access to deletion-related pages
      const allowedPaths = [
        '/settings/delete-account',
        '/api/privacy/cancel-deletion',
        '/api/privacy/validate-deletion-token',
        '/cancel-deletion',
        '/api/user/profile',
        '/api/user/stats'
      ]

      const isAllowedPath = allowedPaths.some(path => req.nextUrl.pathname.startsWith(path))

      logger.debug({ isAllowedPath, path: req.nextUrl.pathname }, '[MIDDLEWARE] Deletion path check')

      if (!isAllowedPath) {
        logger.debug({ userId, path: req.nextUrl.pathname }, '[MIDDLEWARE] Redirecting to delete-account')
        return NextResponse.redirect(new URL('/settings/delete-account', req.url))
      }
    } else {
      logger.debug({ userId }, '[MIDDLEWARE] No deletion scheduled for user')
    }
  }

  // Check authentication for protected routes
  if (isProtectedRoute(req.nextUrl.pathname)) {
    if (!supabaseUser) {
      // No session - redirect to login
      logger.debug({ path: req.nextUrl.pathname }, '[MIDDLEWARE] No session, redirecting to /login')
      return NextResponse.redirect(new URL('/login', req.url))
    }
    // User is authenticated via Supabase - allow access
  }

  // Add security headers to ALL responses
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

  // GDPR: Cross-Origin security headers
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')

  // Content Security Policy - Updated for Cloudflare Turnstile & Vercel Analytics
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://va.vercel-scripts.com",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.openai.com https://*.supabase.co https://*.pinecone.io https://api.voyageai.com https://*.voyageai.com https://challenges.cloudflare.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.sentry.io",
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
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run middleware on API routes
    '/(api|trpc)(.*)',
  ],
}
