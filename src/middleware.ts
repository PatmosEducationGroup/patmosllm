import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

  console.log('[MIDDLEWARE] Path:', req.nextUrl.pathname, 'Has Supabase user:', !!supabaseUser, 'User ID:', supabaseUser?.id)

  // CRITICAL: Check for scheduled deletion BEFORE any other checks
  if (supabaseUser) {
    console.log('[MIDDLEWARE] Querying users table for auth_user_id:', supabaseUser.id)
    const { data: userData, error: queryError } = await supabaseAdmin
      .from('users')
      .select('deleted_at')
      .eq('auth_user_id', supabaseUser.id)
      .maybeSingle()

    console.log('[MIDDLEWARE] Deletion check - userData:', JSON.stringify(userData), 'error:', JSON.stringify(queryError))

    if (userData?.deleted_at) {
      console.log('[MIDDLEWARE] User has deletion scheduled:', userData.deleted_at)

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

      console.log('[MIDDLEWARE] Is allowed path:', isAllowedPath, 'for path:', req.nextUrl.pathname)

      if (!isAllowedPath) {
        console.log('[MIDDLEWARE] REDIRECTING to /settings/delete-account')
        return NextResponse.redirect(new URL('/settings/delete-account', req.url))
      }
    } else {
      console.log('[MIDDLEWARE] No deletion scheduled for user')
    }
  }

  // Check authentication for protected routes
  if (isProtectedRoute(req.nextUrl.pathname)) {
    if (!supabaseUser) {
      // No session - redirect to login
      console.log('[MIDDLEWARE] No session, redirecting to /login')
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
