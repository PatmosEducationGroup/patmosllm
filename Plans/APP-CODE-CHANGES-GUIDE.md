## App Code Changes Guide for Single-Tier Migration
### PatmosLLM: clerk_id → auth_user_id Transition

**Last Updated**: 2025-10-09
**Purpose**: Step-by-step guide for updating application code during zero-downtime migration

---

## Table of Contents
1. [Overview](#overview)
2. [Phase 1: Add Dual-Read Support](#phase-1-add-dual-read-support-day-3)
3. [Phase 2: Flip Feature Flag](#phase-2-flip-feature-flag-day-4)
4. [Phase 3: Remove Clerk Dependencies](#phase-3-remove-clerk-dependencies-day-5)
5. [Testing Checklist](#testing-checklist)

---

## Overview

This document provides **exact code changes** needed to migrate from `clerk_id` to `auth_user_id` across the PatmosLLM codebase. Changes are organized by deployment phase to ensure zero downtime.

### Key Principles
- **Additive first**: Add new code alongside old code
- **Feature flags**: Control rollout with `DUAL_AUTH_ENABLED`
- **Gradual cutover**: Prefer auth_user_id, fallback to clerk_id
- **Safety**: Always check both IDs during transition

---

## Phase 1: Add Dual-Read Support (Day 3)

### 1.1 Update Type Definitions

**File**: `src/lib/types.ts`

**BEFORE**:
```typescript
export interface User {
  id: string
  clerk_id: string
  email: string
  name?: string
  role: UserRole
  invited_by?: string
  created_at: string
  updated_at: string
}
```

**AFTER (Phase 1 - Dual Support)**:
```typescript
export interface User {
  id: string
  auth_user_id?: string  // NEW: Supabase auth.users.id (UUID)
  clerk_id: string       // KEEP: For backwards compatibility
  email: string
  name?: string
  role: UserRole
  invited_by?: string
  created_at: string
  updated_at: string
}
```

### 1.2 Update Core Auth Functions

**File**: `src/lib/auth.ts`

**Function**: `getCurrentUser()`

**BEFORE**:
```typescript
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { userId } = await auth()  // Clerk userId

    if (!userId) {
      return null
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clerk_id', userId)
      .is('deleted_at', null)
      .single()

    if (error || !user) {
      return null
    }

    return user
  } catch (error) {
    logError(error, { operation: 'getCurrentUser' })
    return null
  }
}
```

**AFTER (Phase 1 - Dual Support)**:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getCurrentUser(): Promise<User | null> {
  try {
    // STEP 1: Try Supabase Auth first (migrated users)
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookies().get(name)?.value
          }
        }
      }
    )

    const { data: { user: authUser } } = await supabaseAuth.auth.getUser()

    if (authUser) {
      // User is authenticated via Supabase - look up by auth_user_id
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .is('deleted_at', null)
        .single()

      if (!error && user) {
        logger.info({ userId: user.id, authUserId: authUser.id }, 'User found via Supabase Auth')
        return user
      }
    }

    // STEP 2: Fallback to Clerk (unmigrated users or during transition)
    const { userId: clerkUserId } = await auth()  // Clerk auth

    if (!clerkUserId) {
      return null
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clerk_id', clerkUserId)
      .is('deleted_at', null)
      .single()

    if (error || !user) {
      return null
    }

    logger.info({ userId: user.id, clerkId: clerkUserId }, 'User found via Clerk (fallback)')
    return user
  } catch (error) {
    logError(error, { operation: 'getCurrentUser' })
    return null
  }
}
```

**Function**: `syncUserWithDatabase()` - Update to populate `auth_user_id`

**AFTER (Phase 1 - Add auth_user_id population)**:
```typescript
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
      // NEW: Populate auth_user_id if missing
      if (!existingUser.auth_user_id) {
        // Look up auth_user_id from mapping table
        const { data: mapping } = await supabaseAdmin
          .from('clerk_to_auth_map')
          .select('auth_user_id')
          .eq('clerk_id', clerkUser.id)
          .single()

        if (mapping?.auth_user_id) {
          // Update user with auth_user_id
          const { data: updatedUser, error } = await supabaseAdmin
            .from('users')
            .update({
              auth_user_id: mapping.auth_user_id,
              email,
              name,
              updated_at: new Date().toISOString()
            })
            .eq('clerk_id', clerkUser.id)
            .select()
            .single()

          if (error) throw error
          return updatedUser
        }
      }

      // Standard update (auth_user_id already exists)
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
    }

    // ... rest of function unchanged (new user creation) ...
  } catch (error) {
    logError(error, { operation: 'syncUserWithDatabase' })
    return null
  }
}
```

### 1.3 Update Middleware for Dual Auth

**File**: `src/middleware.ts`

**AFTER (Phase 1 - Add Supabase Auth Check)**:
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const isProtectedRoute = createRouteMatcher([
  '/chat(.*)',
  '/admin(.*)',
  '/api/upload',
  '/api/chat',
  // ... other protected routes
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  let response = NextResponse.next()

  // NEW: Check Supabase Auth first for migrated users
  if (isProtectedRoute(req)) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            response.cookies.set(name, value, options)
          },
          remove(name: string, options: any) {
            response.cookies.set(name, '', { ...options, maxAge: 0 })
          }
        }
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // If Supabase user exists, allow access (migrated user)
    if (user) {
      // Add security headers
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      // ... other headers ...

      return response
    }

    // Fallback to Clerk if no Supabase user
    await auth.protect()
  }

  // Add security headers to all responses
  // ... existing security headers ...

  return response
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

### 1.4 Update API Routes (Example: scrape-website)

**File**: `src/app/api/scrape-website/route.ts`

**BEFORE**:
```typescript
const { userId } = await auth()
if (!userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const { data: user } = await supabaseAdmin
  .from('users')
  .select('*')
  .eq('clerk_id', userId)
  .single()
```

**AFTER (Phase 1 - Dual Support)**:
```typescript
// Try getCurrentUser() which now has dual-read support
const user = await getCurrentUser()

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// User object now has both clerk_id and auth_user_id (if migrated)
```

### 1.5 Update Invitation System

**File**: `src/app/api/admin/invite/route.ts`

**AFTER (Phase 1 - Create auth.users entry immediately)**:
```typescript
// BEFORE: Created placeholder clerk_id
// clerk_id: `invited_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// AFTER: Create auth.users entry with pending status
const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
  email: email.toLowerCase(),
  email_confirm: false,  // Require confirmation
  user_metadata: {
    invitation_pending: true,
    invited_by: user.id,
    role: role,
    invited_at: new Date().toISOString()
  }
})

if (authError || !authUser?.user) {
  return NextResponse.json(
    { success: false, error: 'Failed to create auth user' },
    { status: 500 }
  )
}

// Create public.users entry with auth_user_id
const { data: invitedUser, error: inviteError } = await supabaseAdmin
  .from('users')
  .insert({
    email: email.toLowerCase(),
    name: name || null,
    role: role,
    invited_by: user.id,
    invitation_token: invitationToken,
    invitation_expires_at: expiresAt.toISOString(),
    auth_user_id: authUser.user.id,  // NEW: Link to auth.users
    clerk_id: `pending_${authUser.user.id}`  // Placeholder for compatibility
  })
  .select()
  .single()
```

---

## Phase 2: Flip Feature Flag (Day 4)

### 2.1 Environment Variable

Add to Vercel/production environment:
```bash
DUAL_AUTH_ENABLED=true  # Enable Supabase primary, Clerk fallback
```

### 2.2 Update Feature Flag Check

**File**: `src/lib/feature-flags.ts` (NEW)

```typescript
export const DUAL_AUTH_ENABLED = process.env.DUAL_AUTH_ENABLED === 'true'

export function isDualAuthEnabled(): boolean {
  return DUAL_AUTH_ENABLED
}

export function logAuthSource(source: 'supabase' | 'clerk', userId: string) {
  // Log to monitoring for metrics
  console.log(`[Auth Source] ${source} - User: ${userId}`)
}
```

### 2.3 Update Login Flow to Log Source

**File**: `src/lib/auth.ts` (update getCurrentUser)

```typescript
// After successful auth
if (authUser) {
  logAuthSource('supabase', authUser.id)
  // ... return user ...
}

// Clerk fallback
if (clerkUserId) {
  logAuthSource('clerk', clerkUserId)
  // ... return user ...
}
```

---

## Phase 3: Remove Clerk Dependencies (Day 5+)

### 3.1 Update Type Definitions (Final)

**File**: `src/lib/types.ts`

**AFTER (Phase 3 - auth_user_id primary)**:
```typescript
export interface User {
  id: string
  auth_user_id: string           // PRIMARY: Now required (NOT NULL in DB)
  clerk_id_deprecated?: string   // DEPRECATED: For audit trail only
  email: string
  name?: string
  role: UserRole
  invited_by?: string
  created_at: string
  updated_at: string
}
```

### 3.2 Update Core Auth (Final)

**File**: `src/lib/auth.ts`

**AFTER (Phase 3 - Supabase Only)**:
```typescript
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookies().get(name)?.value
          }
        }
      }
    )

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return null
    }

    // Look up by auth_user_id only
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .is('deleted_at', null)
      .single()

    if (error || !user) {
      return null
    }

    return user
  } catch (error) {
    logError(error, { operation: 'getCurrentUser' })
    return null
  }
}

// Remove Clerk imports entirely
// import { auth, clerkClient } from '@clerk/nextjs/server'  // DELETE THIS
```

### 3.3 Update Middleware (Final)

**File**: `src/middleware.ts`

**AFTER (Phase 3 - Supabase Only)**:
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = ['/chat', '/admin', '/api/upload', '/api/chat']

export async function middleware(req: NextRequest) {
  let response = NextResponse.next()

  // Check if route is protected
  const isProtected = protectedRoutes.some(route =>
    req.nextUrl.pathname.startsWith(route)
  )

  if (isProtected) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            response.cookies.set(name, value, options)
          },
          remove(name: string, options: any) {
            response.cookies.set(name, '', { ...options, maxAge: 0 })
          }
        }
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Redirect to login
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }
  }

  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // ... other headers ...

  return response
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

### 3.4 Remove Clerk Dependencies from package.json

```bash
npm uninstall @clerk/nextjs @clerk/backend
```

Update `package.json` to remove:
- `@clerk/nextjs`
- `@clerk/backend`

### 3.5 Update All API Routes (Global Find/Replace)

**Search Pattern**: `.eq('clerk_id', userId)`
**Replace With**: `.eq('auth_user_id', authUserId)`

**Files to Update**:
- `src/app/api/scrape-website/route.ts`
- `src/app/api/auth/route.ts` (or deprecate entirely)
- `src/app/api/admin/system-health/route.ts`
- `src/lib/onboardingTracker.ts`

### 3.6 Update Environment Variables

Remove from `.env.local` and Vercel:
```bash
# DELETE THESE
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
```

Keep:
```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

## Testing Checklist

### Phase 1 Testing (After Dual-Read Deployment)
- [ ] Existing Clerk users can still log in
- [ ] Migrated Supabase users can log in
- [ ] `getCurrentUser()` works for both user types
- [ ] API routes work for both auth types
- [ ] No errors in Sentry/logs

### Phase 2 Testing (After Feature Flag Flip)
- [ ] New logins prioritize Supabase Auth
- [ ] Clerk fallback still works
- [ ] Monitor auth source metrics (90%+ Supabase)
- [ ] Performance acceptable (<200ms P95)

### Phase 3 Testing (After Clerk Removal)
- [ ] All users log in via Supabase only
- [ ] No Clerk API calls
- [ ] Middleware redirects work
- [ ] Invitation system works
- [ ] Admin operations work
- [ ] E2E tests pass 100%

---

## Rollback Procedures

### Rollback from Phase 3 to Phase 2
1. Reinstall Clerk packages: `npm install @clerk/nextjs @clerk/backend`
2. Revert `src/lib/auth.ts` to Phase 2 version (dual-read)
3. Revert `src/middleware.ts` to Phase 2 version
4. Restore environment variables
5. Redeploy

### Rollback from Phase 2 to Phase 1
1. Set `DUAL_AUTH_ENABLED=false` in environment
2. Redeploy (no code changes needed)

### Rollback from Phase 1 to Clerk-Only
1. Revert all code changes
2. Remove dual-read logic
3. Use Clerk exclusively
4. Rollback database migrations

---

## Success Metrics

Track these metrics during migration:

1. **Auth Source Split**
   - Day 3: 50/50 Supabase/Clerk
   - Day 4: 80/20 Supabase/Clerk
   - Day 5: 95/5 Supabase/Clerk
   - Week 2: 100/0 Supabase only

2. **Error Rates**
   - Auth errors <1% throughout migration
   - Zero user-reported login issues

3. **Performance**
   - Auth latency P95 <200ms
   - No degradation vs baseline

---

*End of App Code Changes Guide*
