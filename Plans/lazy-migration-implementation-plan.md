# Single-Tier Auth Migration Implementation Plan
## PatmosLLM: Clerk → Supabase Auth with Zero-Downtime Strategy

**Status**: ✅ Phase 3 Complete - Dual-Read Pattern Implemented (OPTION 1 - Single-Tier Architecture)
**Last Updated**: 2025-10-09
**Estimated Timeline**: 4-5 weeks total (Week 1-2 complete)
**Risk Level**: Medium-High (Major architecture change with zero downtime)
**Decision**: Single source of truth with `auth.users.id`

## ✅ **Phase 1 Complete (2025-10-09)**
- ✅ Migrations 001-003 executed successfully
- ✅ 15 active users migrated to auth.users
- ✅ 12 tables updated with auth_user_id columns
- ✅ 13 FK constraints validated with zero downtime
- ✅ Database backup created (64.58 MB, 11,500 records)

## ✅ **Phase 2 Complete (2025-10-09)**
- ✅ Migration 004 executed successfully (compatibility layer)
- ✅ RPC functions deployed (clerk_id → auth_user_id mapping)
- ✅ Compatibility layer verified with test queries
- ✅ Zero downtime - existing code continues working

## ✅ **Phase 3 Complete (2025-10-09)**
- ✅ Dual-read authentication pattern implemented
- ✅ `getCurrentUser()` checks Supabase Auth first, falls back to Clerk
- ✅ All API routes updated to use `getCurrentUser()` only
- ✅ Middleware updated to check Supabase session before Clerk
- ✅ `@supabase/ssr` package installed for server-side sessions
- ✅ Permission helpers updated (`canUpload()` includes SUPER_ADMIN)
- ✅ Critical fixes implemented:
  - Fixed invite user endpoint (`clerk_user_id` NOT NULL constraint)
  - Fixed delete document (admin override for library assets)
  - Fixed web scraping permission check (missing SUPER_ADMIN role)
- ✅ Comprehensive manual testing completed:
  - Login/logout working
  - Chat functionality working
  - Document upload (PDF/DOCX) working
  - Document download working
  - Document deletion working (with admin override)
  - Invite user working
  - Web scraping working
- **Next**: Phase 4 (Webhook-Based Migration Implementation)

## ✅ **Phase 4 Complete (2025-10-09)**
- ✅ Discovered limitation: Clerk Backend SDK doesn't support server-side password verification
  - `signIns.create()` API only available in frontend SDK
  - Cannot verify Clerk passwords server-side for migration
- ✅ Updated migration strategy: **Webhook + Forced Password Reset**
  - Unmigrated users continue using Clerk's sign-in UI
  - Clerk sends `session.created` webhook after successful login
  - Webhook handler creates/updates Supabase Auth shell accounts
  - User immediately redirected to password creation page (forced)
  - After setting password, marked as migrated and redirected to Supabase login
- ✅ Implemented Clerk webhook handler (`/api/webhooks/clerk/route.ts`)
  - Handles `session.created` event
  - Creates Supabase shell accounts with temporary passwords
  - Links auth_user_id to users table
  - Handles `user.deleted` event for soft deletion
- ✅ Updated `/login` page to redirect unmigrated users to Clerk
- ✅ Implemented forced password migration flow:
  - Created `/migrate-password` page with password strength validation
  - Created `/api/auth/complete-migration` endpoint
  - Created `/api/auth/clerk-signout` endpoint
  - Updated `/sign-in` to redirect to `/migrate-password` after Clerk login
  - Updated `/api/auth/check-migration` to accept clerkUserId
  - Added success message on `/login` after migration completion
- **Next Steps**:
  1. Configure Clerk webhook in Clerk Dashboard:
     - URL: `https://multiplytools.app/api/webhooks/clerk`
     - Events: `session.created`, `user.deleted`
     - Add `CLERK_WEBHOOK_SECRET` to environment variables
  2. Test complete migration flow end-to-end:
     - Login with unmigrated user via Clerk UI
     - Verify automatic redirect to `/migrate-password`
     - Set new password with validation (uppercase, lowercase, number, 8+ chars)
     - Verify Clerk sign-out
     - Test login with email → should show Supabase password field
     - Verify migration status in `user_migration` table
  3. Deploy to production after successful testing

**Implemented Migration Flow**:
- ✅ Migrated users → `/login` → Enter email → Show Supabase password field → Success
- ✅ Unmigrated users → `/login` → Enter email → Redirect to `/sign-in` (Clerk) → Login → **IMMEDIATE** redirect to `/migrate-password` → Create password → Sign out of Clerk → Redirect to `/login` with success message → Login with new password → Fully migrated

---

## Executive Summary

This plan details the **zero-downtime migration** from Clerk to Supabase Auth using a **single-tier architecture** where `auth.users.id` becomes the only user identifier throughout the application. This is the architecturally correct approach that eliminates technical debt and fully embraces Supabase Auth's design patterns.

**Key Strategy**: Additive migrations → Dual-read compatibility layer → Gradual cutover → Enforcement → Cleanup

---

## 🎯 ARCHITECTURE DECISION: Single-Tier (CHOSEN)

### Why Single-Tier?

**CHOSEN ARCHITECTURE**: **auth.users.id** as single source of truth

**Benefits**:
- ✅ Architecturally correct (follows Supabase best practices)
- ✅ Zero technical debt post-migration
- ✅ Simplified codebase (one user ID everywhere)
- ✅ Native Supabase Auth RLS integration
- ✅ Better performance (no mapping table lookups)
- ✅ Cost savings: Eliminate Clerk entirely

**Trade-offs**:
- ⚠️ Higher upfront complexity (13 tables need updates)
- ⚠️ More code changes (~500 LOC across 20+ files)
- ⚠️ Longer timeline (4-5 weeks vs 3-4 weeks)
- ⚠️ Requires careful testing at each phase

### What This Means

**BEFORE (Clerk)**:
- `public.users.clerk_id` = primary identifier
- All queries: `.eq('clerk_id', userId)`
- No `auth.users` table used

**AFTER (Supabase Single-Tier)**:
- `auth.users.id` = **ONLY** identifier
- All queries: `.eq('auth_user_id', authUserId)`
- `public.users.auth_user_id REFERENCES auth.users(id)`
- `clerk_id` renamed to `clerk_id_deprecated` (audit trail only)

### Key Differences from Generic Plan

PatmosLLM **already has**:
- ✅ Supabase integration (`@supabase/supabase-js` v2.58.0)
- ✅ Clerk integration (`@clerk/nextjs` v6.31.2, `@clerk/backend` v2.17.0)
- ✅ Environment validation with Zod (`src/lib/env.ts`)
- ✅ Structured logging with Pino (`src/lib/logger.ts`)
- ✅ Security headers in middleware (`src/middleware.ts`)
- ✅ Existing `users` table with `clerk_id` column (PostgreSQL table, not auth.users)
- ✅ Role-based access control (SUPER_ADMIN/ADMIN/CONTRIBUTOR/USER) - 4 roles
- ✅ Email functionality via Resend
- ✅ Vitest + Testing Library setup
- ✅ CI/CD pipeline with GitHub Actions
- ✅ 17-table database schema with audit trails
- ✅ Soft-delete functionality (`deleted_at` column)
- ✅ Invitation system with `clerk_ticket` for user onboarding

---

## Phase 0: Prerequisites (Critical - Must Complete Before Migration)

### 0.1 Security Hardening (High Priority)
**Status**: ✅ PARTIALLY COMPLETE / ⚠️ ACTION REQUIRED

**IMPORTANT CORRECTIONS AFTER CODEBASE REVIEW**:

| Issue | Actual Status | Required Action | Priority |
|-------|--------------|----------------|----------|
| **JavaScript files** | ✅ **RESOLVED** - No `.js` files exist in `src/lib/` | All files already TypeScript | ✅ NONE |
| **Structured logging** | ✅ **EXISTS** - Pino-compatible logger at `src/lib/logger.ts` | Already implemented with JSON output | ✅ NONE |
| **Environment validation** | ✅ **EXISTS** - Zod validation at `src/lib/env.ts` | Extend with new migration vars | ⚠️ UPDATE |
| **Rate limiting** | ❌ **NOT FOUND** - No rate limiter file found | Implement from scratch with Upstash | 🚨 CRITICAL |
| **Hardcoded user IDs** | ❌ **UNVERIFIED** - Files don't exist | Cannot verify - may not be an issue | ⚠️ VERIFY |

**CORRECTED Action Items**:
```bash
# 1. Install Upstash Redis (NOT already installed)
npm install @upstash/redis @upstash/ratelimit

# 2. Install additional dependencies
npm install svix  # For Clerk webhook signature verification

# 3. NO JavaScript conversions needed - all files are TypeScript

# 4. Extend existing env.ts validation (see Phase 0.3)
```

**FALSE ASSUMPTIONS CORRECTED**:
- ❌ **WRONG**: "5 JavaScript files in critical paths" - **REALITY**: All `src/lib` files are TypeScript
- ❌ **WRONG**: "Need to implement structured logging" - **REALITY**: Pino-compatible logger already exists
- ❌ **WRONG**: "Need environment validation" - **REALITY**: Zod validation already implemented
- ✅ **CORRECT**: Need Upstash Redis for distributed rate limiting
- ⚠️ **UNCLEAR**: Hardcoded user ID issue - files referenced don't exist

### 0.2 Database Preparation
**Status**: ⚠️ BLOCKER - Schema changes required

**Current State Analysis** (Based on CLAUDE.md - 17 existing tables):

**Existing Tables** (✅):
- ✅ `users` table with `clerk_id` column (256 kB) - Role-based access (SUPER_ADMIN/ADMIN/CONTRIBUTOR/USER)
- ✅ `conversations` table (560 kB) - Already tracks chat history with `user_id` and `session_id`
- ✅ `chat_sessions` table (112 kB) - Session management exists
- ✅ `clerk_webhook_events` table (40 kB) - Already tracking Clerk webhooks
- ✅ `deleted_at` column likely exists (soft-delete implementation completed per CLAUDE.md)

**Memory System Tables** (✅ - Consider for migration analytics):
- ✅ `user_context` (392 kB) - Topic familiarity & preferences (JSONB)
- ✅ `conversation_memory` (264 kB) - Conversation analysis & satisfaction
- ✅ `topic_progression` (72 kB) - Learning progression tracking
- ✅ `question_patterns` (56 kB) - Global query pattern analysis

**Missing Migration Tables** (❌):
- ❌ `user_migration` mapping table - Links Clerk users to Supabase Auth users
- ❌ `migration_log` table - Audit trail for migration events
- ❌ `migration_alerts` table - Error and anomaly tracking
- ❌ `account_lockouts` table - Progressive lockout for failed attempts
- ❌ RPC functions for migration logic

**Important Notes**:
1. **Two User Systems**: PatmosLLM has BOTH:
   - `public.users` table (PostgreSQL) - Application-level user data with roles
   - `auth.users` table (Supabase Auth) - Will be populated during migration
   - The `user_migration` table bridges these two systems

2. **Role System**: PatmosLLM uses 4 roles (SUPER_ADMIN/ADMIN/CONTRIBUTOR/USER), not 3
   - Update migration scripts to use correct `UserRole` type from `src/lib/types.ts`

3. **Integration Required**: Migration must preserve existing relationships:
   - `users.clerk_id` → stays as-is (links to application user)
   - New: `user_migration.supabase_id` → links to `auth.users.id`
   - Existing: `conversations.user_id` → references `public.users.id` (unchanged)

**Leverage Existing Infrastructure**:
1. **Clerk Webhook Events**: Extend existing `clerk_webhook_events` table instead of creating new webhook tracking
2. **User Context**: Use existing `user_context` table for tracking migration-related user preferences
3. **Conversation Memory**: Existing `conversation_memory` can track satisfaction with migration UX
4. **Privacy Audit Log**: Use existing `privacy_audit_log` for GDPR compliance during migration

**Required Schema Changes** (Run in Supabase SQL editor):

```sql
-- 1. Verify soft-delete column exists (likely already present)
-- Run this query first to check:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'deleted_at';

-- If not exists, add it:
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Create user_migration mapping table
CREATE TABLE IF NOT EXISTS user_migration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  supabase_id uuid NOT NULL REFERENCES auth.users(id),
  clerk_id text NOT NULL,
  migrated boolean DEFAULT false,
  migrated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_migration_email ON user_migration(email);
CREATE INDEX IF NOT EXISTS idx_user_migration_migrated ON user_migration(migrated);
CREATE INDEX IF NOT EXISTS idx_user_migration_clerk_id ON user_migration(clerk_id);

-- 3. Create migration_log table
CREATE TABLE IF NOT EXISTS migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  clerk_user_id text NOT NULL,
  supabase_user_id uuid NOT NULL,
  migrated_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_migration_log_timestamp ON migration_log(migrated_at);
CREATE INDEX IF NOT EXISTS idx_migration_log_email ON migration_log(email);

-- 4. Create migration_alerts table
CREATE TABLE IF NOT EXISTS migration_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  clerk_id text NOT NULL,
  alert_type text NOT NULL, -- 'auth_error', 'migration_error', 'rate_limit_hit'
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_alerts_created ON migration_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_migration_alerts_type ON migration_alerts(alert_type);

-- 5. Create account_lockouts table
CREATE TABLE IF NOT EXISTS account_lockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text UNIQUE NOT NULL,
  failed_attempts integer DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_lockouts_email_hash ON account_lockouts(email_hash);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_locked_until ON account_lockouts(locked_until);

-- 6. RPC: Check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM account_lockouts
    WHERE email_hash = p_email_hash
    AND locked_until > now()
  ) INTO v_locked;

  RETURN v_locked;
END;
$$;

-- 7. RPC: Record failed login attempt
CREATE OR REPLACE FUNCTION record_failed_attempt(p_email_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempts int;
  v_lock_duration interval;
BEGIN
  -- Insert or update failed attempts
  INSERT INTO account_lockouts (email_hash, failed_attempts, updated_at)
  VALUES (p_email_hash, 1, now())
  ON CONFLICT (email_hash)
  DO UPDATE SET
    failed_attempts = account_lockouts.failed_attempts + 1,
    updated_at = now();

  -- Get current attempt count
  SELECT failed_attempts INTO v_attempts
  FROM account_lockouts
  WHERE email_hash = p_email_hash;

  -- Calculate lockout duration
  IF v_attempts >= 20 THEN
    v_lock_duration := interval '24 hours';
  ELSIF v_attempts >= 10 THEN
    v_lock_duration := interval '1 hour';
  ELSIF v_attempts >= 5 THEN
    v_lock_duration := interval '15 minutes';
  ELSE
    RETURN; -- No lockout yet
  END IF;

  -- Apply lockout
  UPDATE account_lockouts
  SET locked_until = now() + v_lock_duration
  WHERE email_hash = p_email_hash;

  -- Optional: Send notification (integrate with existing notification system)
  PERFORM pg_notify('account_locked',
    json_build_object(
      'email_hash', p_email_hash,
      'attempts', v_attempts,
      'locked_until', now() + v_lock_duration
    )::text
  );
END;
$$;

-- 8. RPC: Clear failed attempts on successful login
CREATE OR REPLACE FUNCTION clear_failed_attempts(p_email_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM account_lockouts WHERE email_hash = p_email_hash;
END;
$$;

-- 9. RPC: Ensure user mapping (used by prepopulation script)
CREATE OR REPLACE FUNCTION ensure_user_mapping(
  p_email text,
  p_clerk_id text,
  p_supabase_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO user_migration (email, supabase_id, clerk_id, migrated)
  VALUES (p_email, p_supabase_id, p_clerk_id, false)
  ON CONFLICT (email)
  DO UPDATE SET
    supabase_id = EXCLUDED.supabase_id,
    clerk_id = EXCLUDED.clerk_id
  RETURNING supabase_id;
$$;

-- 10. Create migration dashboard views
CREATE OR REPLACE VIEW v_migration_progress AS
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE migrated) as migrated,
  COUNT(*) FILTER (WHERE NOT migrated) as remaining,
  ROUND(
    (COUNT(*) FILTER (WHERE migrated)::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as percentage
FROM user_migration
WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW v_migration_last_24h AS
SELECT
  date_trunc('hour', migrated_at) as hour,
  COUNT(*) as migrated_count
FROM migration_log
WHERE migrated_at >= now() - interval '24 hours'
GROUP BY 1
ORDER BY 1;

CREATE OR REPLACE VIEW v_migration_by_auth_type AS
SELECT
  COALESCE(u.role, 'unknown') as user_role,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE um.migrated) as migrated_count,
  ROUND(
    (COUNT(*) FILTER (WHERE um.migrated)::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as migration_percentage
FROM user_migration um
LEFT JOIN users u ON u.clerk_id = um.clerk_id
GROUP BY 1
ORDER BY 1;
```

### 0.3 Environment Setup
**Status**: ⚠️ BLOCKER - New environment variables required

**Required Environment Variables** (Add to `.env.local`):
```bash
# Upstash Redis (NEW - Required for distributed rate limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxx...

# Clerk Webhook (NEW - Required for user deletion sync)
CLERK_WEBHOOK_SECRET=whsec_xxx...

# Feature Flags (NEW - Migration control)
DUAL_AUTH_ENABLED=true  # Set to false to disable Clerk fallback (emergency kill switch)

# Existing variables (✅ VERIFIED - already in CLAUDE.md)
NEXT_PUBLIC_APP_URL=https://multiplytools.app  # ✅ Already set
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY # ✅ Already set
CLERK_SECRET_KEY # ✅ Already set
NEXT_PUBLIC_SUPABASE_URL # ✅ Already set
NEXT_PUBLIC_SUPABASE_ANON_KEY # ✅ Not in env.ts schema - ADD
SUPABASE_SERVICE_ROLE_KEY # ✅ Already set
```

**⚠️ CRITICAL FINDING**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is used but NOT validated in `src/lib/env.ts` schema!

**Setup Instructions**:
1. **Create Upstash Redis Database**:
   - Go to https://console.upstash.com/
   - Create new database (Redis)
   - Copy REST URL and token
   - Add to `.env.local`

2. **Configure Clerk Webhook**:
   - Go to Clerk Dashboard → Webhooks
   - Add endpoint: `https://multiplytools.app/api/webhooks/clerk`
   - Select events: `user.deleted`
   - Copy webhook secret
   - Add to `.env.local`

3. **Update Environment Validation** (`src/lib/env.ts`):
```typescript
// ✅ File exists at src/lib/env.ts with Zod validation
// Add these NEW fields to the existing envSchema:

const envSchema = z.object({
  // ... existing fields ...

  // NEW: Migration variables
  UPSTASH_REDIS_REST_URL: z.string().url('Invalid Upstash Redis URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'Upstash Redis token required'),
  CLERK_WEBHOOK_SECRET: z.string().min(1, 'Clerk webhook secret required'),
  DUAL_AUTH_ENABLED: z.enum(['true', 'false']).default('true'),

  // FIX: Missing validation for existing variable
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key required'),
});
```

**⚠️ SECURITY FIX REQUIRED**: Add validation for `NEXT_PUBLIC_SUPABASE_ANON_KEY` which is currently used but not validated!

### 0.4 Testing Infrastructure
**Status**: ✅ READY - Vitest + Testing Library + Playwright already installed

**VERIFIED from package.json**:
- ✅ `vitest`: ^3.2.4 (latest)
- ✅ `@vitest/ui`: ^3.2.4
- ✅ `@vitest/coverage-v8`: Already in dependencies (nested)
- ✅ `@testing-library/react`: ^16.3.0
- ✅ `@testing-library/jest-dom`: ^6.9.1
- ✅ `@testing-library/user-event`: ^14.6.1
- ✅ `playwright`: ^1.21.1 (nested dependency)
- ✅ `happy-dom`: ^19.0.2 (Vitest environment)
- ✅ `husky`: ^9.1.7 (git hooks)
- ✅ `lint-staged`: ^16.2.3

**Scripts Already Configured**:
```json
"test": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest --coverage"
```

**⚠️ RECOMMENDATION**: Install Playwright as direct dependency for E2E migration testing:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Test Coverage Goals Before Migration**:
- [ ] Unit tests for auth functions (80%+ coverage)
- [ ] Integration tests for API routes (70%+ coverage)
- [ ] E2E tests for migration flow (100% critical paths)

---

## Phase 1: Core Library Implementation (Week 1)

### 1.1 Email Utilities
**File**: `src/lib/email-utils.ts` (NEW)

```typescript
import crypto from 'crypto'

/**
 * Normalize email for consistent comparison
 * Handles case sensitivity and whitespace
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Hash email for PII-safe logging and account lockout tracking
 * Uses SHA-256 truncated to 16 characters (sufficient for collision resistance)
 */
export function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeEmail(email))
    .digest('hex')
    .slice(0, 16)
}

/**
 * Validate email format using RFC 5322 compliant regex
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}
```

### 1.2 CSRF Protection
**File**: `src/lib/csrf.ts` (NEW)

```typescript
import crypto from 'crypto'

/**
 * Generate cryptographically secure CSRF token
 * Used in login form to prevent CSRF attacks
 */
export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Used to validate CSRF tokens securely
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a || '')
  const bufferB = Buffer.from(b || '')

  if (bufferA.length !== bufferB.length) {
    return false
  }

  return crypto.timingSafeEqual(bufferA, bufferB)
}
```

### 1.3 Feature Flags
**File**: `src/lib/feature-flags.ts` (NEW)

```typescript
/**
 * Migration control feature flag
 * Set to false to disable Clerk fallback in emergency
 */
export const DUAL_AUTH_ENABLED = process.env.DUAL_AUTH_ENABLED === 'true'

/**
 * Check if dual auth is enabled (Supabase + Clerk fallback)
 * When false, only Supabase auth is used
 */
export function isDualAuthEnabled(): boolean {
  return DUAL_AUTH_ENABLED
}
```

### 1.4 Distributed Rate Limiting
**File**: `src/lib/rate-limiter.ts` (REPLACE existing)

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { logger } from './logger'

// Initialize Redis client
const redis = Redis.fromEnv()

// Rate limiter configurations
export const rateLimiters = {
  // Login attempts: 5 attempts per 15 minutes per IP+email
  login: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '15 m'),
    analytics: true,
    prefix: 'ratelimit:login'
  }),

  // API calls: 100 requests per minute per user
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    analytics: true,
    prefix: 'ratelimit:api'
  }),

  // Chat: 20 messages per minute per user
  chat: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
    analytics: true,
    prefix: 'ratelimit:chat'
  })
}

/**
 * Check rate limit for a specific identifier
 * Returns { success: boolean, limit: number, remaining: number, reset: number }
 */
export async function checkRateLimit(
  limiter: keyof typeof rateLimiters,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  try {
    const result = await rateLimiters[limiter].limit(identifier)

    if (!result.success) {
      logger.warn({ identifier, limiter, limit: result.limit }, 'Rate limit exceeded')
    }

    return result
  } catch (error) {
    logger.error({ error, identifier, limiter }, 'Rate limit check failed')
    // Fail open: allow request if rate limiter is unavailable
    return { success: true, limit: 0, remaining: 0, reset: 0 }
  }
}

/**
 * Get client IP address from request headers
 * Prioritizes Vercel headers, falls back to standard headers
 */
export function getClientIP(req: Request): string {
  const headers = req.headers

  return (
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}
```

### 1.5 Migration Logic
**File**: `src/lib/auth-migration.ts` (NEW)

```typescript
import { supabaseAdmin } from './supabase'
import { clerkClient } from '@clerk/nextjs/server'
import { logger } from './logger'
import { normalizeEmail } from './email-utils'

/**
 * Migrate user from Clerk to Supabase Auth
 * Called on successful Clerk authentication during lazy migration
 *
 * Process:
 * 1. Verify user exists in user_migration table (pre-created shell)
 * 2. Update Supabase Auth user with password from Clerk verification
 * 3. Copy metadata from Clerk to Supabase
 * 4. Mark as migrated in user_migration table
 * 5. Log migration for audit trail
 *
 * @returns Supabase user object or null on failure
 */
export async function migrateUserToSupabase(
  email: string,
  password: string,
  clerkUserId: string
): Promise<{ id: string; email?: string } | null> {
  const normalizedEmail = normalizeEmail(email)

  try {
    // 1. Get Clerk user metadata
    const clerkUser = await clerkClient.users.getUser(clerkUserId)

    // 2. Find pre-created Supabase shell account via mapping
    const { data: mapRow, error: mapErr } = await supabaseAdmin
      .from('user_migration')
      .select('supabase_id, migrated')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (mapErr || !mapRow?.supabase_id) {
      logger.error({ email: normalizedEmail, clerkUserId }, 'No pre-created Supabase user found')

      // Alert: User attempted login but not in migration map
      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email: normalizedEmail,
          clerk_id: clerkUserId,
          alert_type: 'user_not_mapped',
          error_message: 'User not found in migration mapping table'
        })
        .catch(() => {}) // Don't fail migration if alert fails

      return null
    }

    // 3. Check if already migrated (idempotency)
    if (mapRow.migrated) {
      logger.info({ email: normalizedEmail, clerkUserId }, 'User already migrated')
      return { id: mapRow.supabase_id }
    }

    // 4. Update Supabase Auth user with password + metadata
    const { data: authUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      mapRow.supabase_id,
      {
        password, // Password from successful Clerk verification
        user_metadata: {
          clerk_id: clerkUserId,
          first_name: clerkUser.firstName,
          last_name: clerkUser.lastName,
          migrated: true,
          migrated_at: new Date().toISOString(),
          // Preserve MFA state for migration prompt
          mfa_migration_needed: clerkUser.twoFactorEnabled || false,
          clerk_created_at: clerkUser.createdAt
        }
      }
    )

    if (updateErr || !authUser?.user) {
      logger.error({ error: updateErr, email: normalizedEmail }, 'Failed to update Supabase Auth user')

      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email: normalizedEmail,
          clerk_id: clerkUserId,
          alert_type: 'auth_update_error',
          error_message: updateErr?.message || 'Unknown error'
        })
        .catch(() => {})

      return null
    }

    // 5. Mark as migrated in mapping table
    const { error: mapUpdateErr } = await supabaseAdmin
      .from('user_migration')
      .update({
        migrated: true,
        migrated_at: new Date().toISOString()
      })
      .eq('email', normalizedEmail)

    if (mapUpdateErr) {
      logger.error({ error: mapUpdateErr, email: normalizedEmail }, 'Failed to update migration mapping')
    }

    // 6. Log migration for audit trail
    await supabaseAdmin
      .from('migration_log')
      .insert({
        email: normalizedEmail,
        clerk_user_id: clerkUserId,
        supabase_user_id: mapRow.supabase_id
      })
      .catch((err) => {
        logger.error({ error: err, email: normalizedEmail }, 'Failed to log migration')
      })

    // 7. Sync with PatmosLLM users table (update clerk_id → maintain relationship)
    await supabaseAdmin
      .from('users')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', clerkUserId)
      .catch((err) => {
        logger.error({ error: err, clerkUserId }, 'Failed to sync users table')
      })

    logger.info({ email: normalizedEmail, clerkUserId }, 'User successfully migrated to Supabase')

    return authUser.user
  } catch (error) {
    logger.error({ error, email: normalizedEmail, clerkUserId }, 'Migration failed with exception')

    await supabaseAdmin
      .from('migration_alerts')
      .insert({
        email: normalizedEmail,
        clerk_id: clerkUserId,
        alert_type: 'migration_exception',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .catch(() => {})

    return null
  }
}
```

---

## Phase 2: API Routes (Week 2)

### 2.1 Server-Side Login Route
**File**: `src/app/api/auth/login/route.ts` (NEW)

This is the heart of the lazy migration. It:
1. Validates CSRF token
2. Checks account lockout status
3. Tries Supabase Auth first
4. Falls back to Clerk if enabled
5. Migrates user on successful Clerk verification
6. Logs in to Supabase with migrated credentials

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { clerkClient } from '@clerk/nextjs/server'
import { migrateUserToSupabase } from '@/lib/auth-migration'
import { constantTimeEqual } from '@/lib/csrf'
import { normalizeEmail, hashEmail, isValidEmail } from '@/lib/email-utils'
import { isDualAuthEnabled } from '@/lib/feature-flags'
import { checkRateLimit, getClientIP } from '@/lib/rate-limiter'
import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Server-side login route with lazy migration
 *
 * Flow:
 * 1. CSRF validation
 * 2. Account lockout check
 * 3. Supabase Auth attempt (primary)
 * 4. Clerk fallback (if DUAL_AUTH_ENABLED)
 * 5. Lazy migration on Clerk success
 * 6. Supabase login with migrated credentials
 *
 * Rate limiting: 5 attempts per 15 minutes per IP+email
 */
export async function POST(req: Request) {
  const cookieStore = cookies()

  // 1. CSRF validation
  const headerToken = req.headers.get('x-csrf') || ''
  const cookieToken = cookieStore.get('csrf')?.value || ''

  if (!headerToken || !cookieToken || !constantTimeEqual(headerToken, cookieToken)) {
    logger.warn({ hasHeaderToken: !!headerToken, hasCookieToken: !!cookieToken }, 'CSRF validation failed')
    return NextResponse.json({ success: false, error: 'Invalid CSRF token' }, { status: 403 })
  }

  // 2. Parse and validate request body
  const { email: rawEmail, password } = await req.json()

  if (!isValidEmail(rawEmail)) {
    return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 })
  }

  const email = normalizeEmail(rawEmail)
  const emailHash = hashEmail(email)

  // 3. Check account lockout
  const { data: isLocked } = await supabaseAdmin
    .rpc('is_account_locked', { p_email_hash: emailHash })
    .catch(() => ({ data: false }))

  if (isLocked) {
    logger.warn({ emailHash }, 'Account locked due to failed attempts')
    return NextResponse.json(
      { success: false, error: 'Account temporarily locked. Please try again later.' },
      { status: 423 }
    )
  }

  // 4. Create Supabase client with cookie handling
  const responseHeaders = new Headers()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      global: {
        headers: {
          cookie: req.headers.get('cookie') || ''
        }
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          const cookie = [
            `${name}=${value}`,
            `Path=${options?.path ?? '/'}`,
            'HttpOnly',
            `SameSite=${options?.sameSite ?? 'Lax'}`,
            options?.secure ? 'Secure' : '',
            options?.maxAge ? `Max-Age=${options.maxAge}` : '',
            options?.domain ? `Domain=${options.domain}` : ''
          ]
            .filter(Boolean)
            .join('; ')

          responseHeaders.append('Set-Cookie', cookie)
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: any) {
          const cookie = `${name}=; Path=${options?.path ?? '/'}; Max-Age=0`
          responseHeaders.append('Set-Cookie', cookie)
          cookieStore.delete(name)
        }
      }
    }
  )

  // 5. Try Supabase Auth first (primary path for migrated users)
  const { data: supabaseData, error: supabaseError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (supabaseData?.user) {
    // Success: User already migrated to Supabase
    await supabaseAdmin.rpc('clear_failed_attempts', { p_email_hash: emailHash }).catch(() => {})

    logger.info({ emailHash, userId: supabaseData.user.id }, 'Login successful via Supabase')

    return NextResponse.json(
      {
        success: true,
        source: 'supabase',
        mfa_migration_needed: !!supabaseData.user.user_metadata?.mfa_migration_needed
      },
      { status: 200, headers: responseHeaders }
    )
  }

  // 6. Check if dual auth is enabled (feature flag)
  if (!isDualAuthEnabled()) {
    // Dual auth disabled: Record failure and reject
    await supabaseAdmin.rpc('record_failed_attempt', { p_email_hash: emailHash }).catch(() => {})

    logger.warn({ emailHash }, 'Login failed (dual auth disabled)')
    return NextResponse.json(
      { success: false, error: 'Invalid email or password' },
      { status: 401, headers: responseHeaders }
    )
  }

  // 7. Rate limit Clerk fallback path (prevent abuse)
  const clientIP = getClientIP(req)
  const rateLimitKey = `${clientIP}:${emailHash}`
  const { success: rateLimitOk } = await checkRateLimit('login', rateLimitKey)

  if (!rateLimitOk) {
    await supabaseAdmin
      .from('migration_alerts')
      .insert({
        email,
        clerk_id: 'unknown',
        alert_type: 'rate_limit_hit',
        error_message: `IP: ${clientIP}`
      })
      .catch(() => {})

    logger.warn({ emailHash, clientIP }, 'Rate limit exceeded')
    return NextResponse.json(
      { success: false, error: 'Too many login attempts. Please try again later.' },
      { status: 429 }
    )
  }

  // 8. Try Clerk authentication (fallback for unmigrated users)
  try {
    // Create sign-in attempt
    const signIn = await clerkClient.signIns.create({
      identifier: email,
      strategy: 'password'
    })

    // Verify password
    const attempt = await clerkClient.signIns.attemptFirstFactor({
      signInId: signIn.id,
      strategy: 'password',
      password
    })

    // Check if verification succeeded
    if (attempt.status !== 'complete' || !attempt.createdSessionId || !attempt.userId) {
      await supabaseAdmin.rpc('record_failed_attempt', { p_email_hash: emailHash }).catch(() => {})

      logger.warn({ emailHash }, 'Clerk authentication failed')
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // 9. Revoke Clerk session (we only needed it for verification)
    try {
      await clerkClient.sessions.revokeSession(attempt.createdSessionId)
    } catch (err) {
      logger.error({ error: err }, 'Failed to revoke Clerk session')
    }

    // 10. Migrate user to Supabase
    const migratedUser = await migrateUserToSupabase(email, password, attempt.userId)

    if (!migratedUser) {
      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email,
          clerk_id: attempt.userId,
          alert_type: 'migration_error',
          error_message: 'Failed to migrate user after successful Clerk auth'
        })
        .catch(() => {})

      return NextResponse.json(
        { success: false, error: 'Migration failed. Please contact support.' },
        { status: 500 }
      )
    }

    // 11. Log in to Supabase with migrated credentials
    const { data: finalData, error: finalError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (finalError || !finalData?.user) {
      await supabaseAdmin
        .from('migration_alerts')
        .insert({
          email,
          clerk_id: attempt.userId,
          alert_type: 'post_migration_login_error',
          error_message: finalError?.message || 'Unknown error'
        })
        .catch(() => {})

      return NextResponse.json(
        { success: false, error: 'Login failed after migration. Please try again.' },
        { status: 500 }
      )
    }

    // 12. Clear failed attempts on success
    await supabaseAdmin.rpc('clear_failed_attempts', { p_email_hash: emailHash }).catch(() => {})

    logger.info({ emailHash, userId: finalData.user.id }, 'User migrated and logged in successfully')

    return NextResponse.json(
      {
        success: true,
        source: 'clerk-migrated',
        mfa_migration_needed: !!finalData.user.user_metadata?.mfa_migration_needed
      },
      { status: 200, headers: responseHeaders }
    )
  } catch (error) {
    // Clerk authentication failed (likely invalid credentials)
    await supabaseAdmin.rpc('record_failed_attempt', { p_email_hash: emailHash }).catch(() => {})

    await supabaseAdmin
      .from('migration_alerts')
      .insert({
        email,
        clerk_id: 'unknown',
        alert_type: 'clerk_auth_error',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .catch(() => {})

    logger.warn({ emailHash, error }, 'Clerk authentication exception')
    return NextResponse.json(
      { success: false, error: 'Invalid email or password' },
      { status: 401 }
    )
  }
}
```

### 2.2 Clerk Webhook Handler
**File**: `src/app/api/webhooks/clerk/route.ts` (NEW)

Handle Clerk user deletions to keep migration mapping in sync:

```typescript
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Clerk webhook handler
 * Syncs user deletions from Clerk to migration tracking
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

  if (!webhookSecret) {
    logger.error({}, 'CLERK_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  // Get Svix headers for verification
  const headerPayload = headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 })
  }

  // Get raw body
  const payload = await req.json()
  const body = JSON.stringify(payload)

  // Verify webhook signature
  const webhook = new Webhook(webhookSecret)
  let event: any

  try {
    event = webhook.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature
    })
  } catch (error) {
    logger.error({ error }, 'Webhook signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle user deletion
  if (event.type === 'user.deleted') {
    const clerkId = event.data.id

    // Soft delete in migration mapping
    await supabaseAdmin
      .from('user_migration')
      .update({
        migrated: false,
        deleted_at: new Date().toISOString()
      })
      .eq('clerk_id', clerkId)
      .catch((err) => {
        logger.error({ error: err, clerkId }, 'Failed to mark user as deleted in migration mapping')
      })

    logger.info({ clerkId }, 'User marked as deleted in migration mapping')
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
```

### 2.3 Migration Dashboard Routes
**Files**:
- `src/app/api/migration-stats/route.ts` (NEW)
- `src/app/api/migration-health/route.ts` (NEW)

See generic plan for full implementation - adapt to use PatmosLLM's existing admin auth patterns.

---

## Phase 3: Frontend & UX (Week 2-3)

### 3.1 Sign-In Page with CSRF
**File**: `src/app/sign-in/page.tsx` (REPLACE existing or coexist with Clerk)

**⚠️ CRITICAL DECISION REQUIRED**: Current sign-in uses Clerk's `<SignIn />` component at `src/app/sign-in/[[...sign-in]]/page.tsx`.

**TWO IMPLEMENTATION OPTIONS**:

**Option A: Parallel Routes** (RECOMMENDED for zero-downtime migration)
- Keep existing `/sign-in/[[...sign-in]]` for Clerk users
- Add new `/sign-in-supabase` route for migrated users
- Middleware detects user state and redirects appropriately
- Gradual migration with instant rollback capability

**Option B: Replace Clerk Route** (RISKY - breaks existing auth flow)
- Replace Clerk `<SignIn />` component
- Forces all users to new login flow immediately
- Higher risk, no gradual rollback

**RECOMMENDED: Option A Implementation**

```typescript
// NEW FILE: src/app/sign-in-supabase/page.tsx
import { cookies } from 'next/headers'
import { createCsrfToken } from '@/lib/csrf'
import LoginForm from '@/components/LoginForm'

export default async function SignInSupabasePage() {
  // Generate CSRF token on server
  const token = createCsrfToken()

  // Store in HTTP-only cookie
  cookies().set('csrf', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 15 // 15 minutes
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full">
        <LoginForm csrfToken={token} />
      </div>
    </div>
  )
}
```

**KEEP EXISTING**: `src/app/sign-in/[[...sign-in]]/page.tsx` (Clerk route) for fallback during migration

### 3.2 Login Form Component
**File**: `src/components/LoginForm.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface LoginFormProps {
  csrfToken: string
}

export default function LoginForm({ csrfToken }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaNeeded, setMfaNeeded] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf': csrfToken
        },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Check if MFA migration needed
      if (data.mfa_migration_needed) {
        setMfaNeeded(true)
      }

      // Redirect to dashboard
      router.push('/chat')
      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Sign In</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="csrf" value={csrfToken} />

        {mfaNeeded && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
            ⚠️ Please set up two-factor authentication after logging in for enhanced security.
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-gray-600">
        <a href="/reset-password" className="text-blue-600 hover:text-blue-700">
          Forgot password?
        </a>
      </div>
    </div>
  )
}
```

### 3.3 Update Middleware
**File**: `src/middleware.ts` (UPDATE EXISTING)

**⚠️ CRITICAL**: Current middleware at `src/middleware.ts` already has:
- ✅ Clerk middleware with `createRouteMatcher` for protected routes
- ✅ Security headers (X-Frame-Options, CSP, HSTS, etc.)
- ✅ Request size limits (10MB)
- ✅ Sentry CSP integration

**REQUIRED CHANGES**: Add Supabase session check BEFORE Clerk fallback:

```typescript
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
  // Request size limit
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 10_000_000) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let response = NextResponse.next()

  // Check Supabase session first (for migrated users)
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

    // If Supabase user exists, allow access
    if (user) {
      // Add security headers
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      response.headers.set('X-XSS-Protection', '1; mode=block')
      response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

      // CSP headers
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

    // No Supabase user: Fall back to Clerk
    await auth.protect()
  }

  // Add security headers to all responses
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
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

---

## Phase 4: Pre-Migration Script (Week 3)

### 4.1 Prepopulation Script
**File**: `scripts/prepopulate-users.ts` (NEW)

Creates Supabase shell accounts for all existing Clerk users:

```typescript
import { clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'
import { logger } from '../src/lib/logger'

/**
 * Pre-populate Supabase with shell accounts for all Clerk users
 * Run this BEFORE enabling lazy migration
 *
 * Process:
 * 1. Fetch all Clerk users (paginated)
 * 2. For each user, create Supabase Auth shell with random password
 * 3. Create mapping in user_migration table
 * 4. Report progress and errors
 */

// In-memory cache to avoid duplicate lookups
const emailToSupabaseId = new Map<string, string>()

async function findSupabaseUserByEmail(email: string): Promise<string | null> {
  if (emailToSupabaseId.has(email)) {
    return emailToSupabaseId.get(email)!
  }

  // Search through all Supabase Auth users (paginated)
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    })

    if (error || !data) break

    // Cache all emails in this page
    for (const user of data.users) {
      if (user.email) {
        emailToSupabaseId.set(user.email, user.id)
      }
    }

    if (data.users.length < perPage) break
    page++
  }

  return emailToSupabaseId.get(email) || null
}

async function ensureUserShell(
  email: string,
  clerkId: string,
  metadata: Record<string, any>
): Promise<string | null> {
  try {
    // Generate secure random password (user will reset on migration)
    const randomPassword = crypto.randomUUID() + crypto.randomUUID()

    // Try to create Supabase Auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Pre-confirmed (they verified with Clerk)
      password: randomPassword,
      user_metadata: metadata
    })

    let supabaseId = created?.user?.id

    // Handle "already registered" error
    if (createErr && /already registered/i.test(createErr.message)) {
      supabaseId = await findSupabaseUserByEmail(email)
    }

    if (!supabaseId) {
      console.error(`❌ Could not resolve Supabase ID for ${email}`)
      return null
    }

    // Create mapping in user_migration table
    const { error: mapErr } = await supabaseAdmin.rpc('ensure_user_mapping', {
      p_email: email,
      p_clerk_id: clerkId,
      p_supabase_id: supabaseId
    })

    if (mapErr) {
      console.error(`❌ Mapping error for ${email}:`, mapErr.message)
      return null
    }

    return supabaseId
  } catch (error) {
    console.error(`❌ Error creating shell for ${email}:`, error)
    return null
  }
}

async function run() {
  console.log('🚀 Starting pre-population...')
  console.log('This will create Supabase shell accounts for all Clerk users\n')

  let offset = 0
  const limit = 100
  let processed = 0
  let created = 0
  let skipped = 0
  let errors = 0

  while (true) {
    const { data: clerkUsers } = await clerkClient.users.getUserList({
      limit,
      offset
    })

    if (!clerkUsers?.length) break

    for (const user of clerkUsers) {
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId
      )?.emailAddress

      if (!primaryEmail) {
        console.log(`⚠️ Skipping ${user.id}: no primary email`)
        skipped++
        continue
      }

      // Determine auth type for analytics
      const hasPassword = user.passwordEnabled
      const hasOAuth = user.externalAccounts.length > 0
      const authType = hasPassword ? 'password' : hasOAuth ? 'oauth' : 'magic_link'

      const metadata = {
        clerk_id: user.id,
        first_name: user.firstName,
        last_name: user.lastName,
        clerk_auth_type: authType,
        has_mfa: user.twoFactorEnabled || false,
        migrated: false,
        clerk_created_at: user.createdAt
      }

      const supabaseId = await ensureUserShell(primaryEmail, user.id, metadata)

      if (supabaseId) {
        created++
        console.log(`✓ ${primaryEmail} [${authType}] → ${supabaseId}`)
      } else {
        errors++
      }

      processed++
    }

    offset += limit
    console.log(`\n📊 Progress: ${processed} users processed...\n`)
  }

  console.log('\n✅ Pre-population complete!')
  console.log(`   Total processed: ${processed}`)
  console.log(`   Successfully created: ${created}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Errors: ${errors}`)

  if (errors > 0) {
    console.log('\n⚠️ Some users failed to create. Review errors above.')
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
```

**Usage**:
```bash
# Run before enabling migration
npm run ts-node scripts/prepopulate-users.ts
```

---

## Phase 5: Testing & Validation (Week 3-4)

### 5.1 Unit Tests
**Files**:
- `tests/unit/email-utils.test.ts` (NEW)
- `tests/unit/csrf.test.ts` (NEW)
- `tests/unit/rate-limiter.test.ts` (NEW)

### 5.2 Integration Tests
**File**: `tests/integration/auth-migration.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabaseAdmin } from '@/lib/supabase'

describe('Auth Migration Flow', () => {
  beforeAll(async () => {
    // Setup test users
  })

  afterAll(async () => {
    // Cleanup test users
  })

  it('should migrate user on first login', async () => {
    // Test migration flow
  })

  it('should use Supabase for subsequent logins', async () => {
    // Test post-migration login
  })

  it('should handle rate limiting', async () => {
    // Test rate limit enforcement
  })

  it('should handle account lockout', async () => {
    // Test lockout after failed attempts
  })
})
```

### 5.3 E2E Tests with Playwright
**File**: `tests/e2e/auth-migration.spec.ts` (NEW)

```typescript
import { test, expect } from '@playwright/test'

test.describe('Lazy Migration E2E', () => {
  test('unmigrated user can login and gets migrated', async ({ page }) => {
    // Navigate to sign-in
    await page.goto('/sign-in')

    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'TestPassword123!')

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to chat
    await expect(page).toHaveURL('/chat')

    // User should be migrated (check migration_log table)
  })

  test('migrated user logs in via Supabase', async ({ page }) => {
    // Test post-migration login
  })

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/sign-in')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'WrongPassword')
    await page.click('button[type="submit"]')

    await expect(page.locator('text=Invalid email or password')).toBeVisible()
  })
})
```

---

## Phase 6: Deployment & Monitoring (Week 4)

### 6.1 Deployment Checklist

- [ ] Run database migrations in production Supabase
- [ ] Add all environment variables to Vercel
- [ ] Configure Clerk webhook endpoint
- [ ] Run prepopulation script
- [ ] Deploy to staging
- [ ] Run E2E tests on staging
- [ ] Monitor for 24 hours
- [ ] Deploy to production
- [ ] Monitor migration dashboard

### 6.2 Monitoring Strategy

**Metrics to Track**:
1. **Migration Progress**: `v_migration_progress` view
2. **Error Rate**: `migration_alerts` table
3. **Rate Limit Hits**: Upstash Redis analytics
4. **Account Lockouts**: `account_lockouts` table
5. **Clerk Fallback Rate**: % of logins using Clerk vs Supabase

**Alerting Rules**:
- Auth error rate > 5% → Investigate
- Migration failures > 10 in 1 hour → Page on-call
- Clerk fallback rate > 50% after 1 week → Migration stalled
- Upstash memory > 100MB → Scale up Redis

### 6.3 Rollback Plan

**Emergency Rollback** (if migration fails):
1. Set `DUAL_AUTH_ENABLED=false` in environment variables
2. Redeploy previous version (Clerk-only)
3. Investigate errors in `migration_alerts` table
4. Fix issues and retry

**Gradual Rollback** (if Clerk fallback needed longer):
- Keep `DUAL_AUTH_ENABLED=true`
- Users continue migrating at their own pace
- No action needed

---

## Prerequisites Summary (Critical Path)

### Must Complete BEFORE Migration

#### 1. Security Fixes (Blockers)
- [ ] Fix async `auth()` bug in `src/lib/get-identifier.js`
- [ ] Move hardcoded user IDs to environment variables
- [ ] Convert 5 JavaScript files to TypeScript
- [ ] Implement Redis-backed rate limiting

#### 2. Database Schema
- [ ] Run all 10 SQL migrations in Supabase
- [ ] Verify schema with `check-schema.sql`
- [ ] Test RPC functions manually

#### 3. Environment Setup
- [ ] Create Upstash Redis database
- [ ] Configure Clerk webhook
- [ ] Add all new environment variables
- [ ] Update `src/lib/env.ts` validation

#### 4. Code Implementation
- [ ] Implement all Phase 1 libraries
- [ ] Implement all Phase 2 API routes
- [ ] Implement all Phase 3 frontend components
- [ ] Implement Phase 4 prepopulation script

#### 5. Testing
- [ ] Write unit tests (80%+ coverage)
- [ ] Write integration tests (70%+ coverage)
- [ ] Write E2E tests (100% critical paths)
- [ ] Run full test suite (all passing)

#### 6. Pre-Deployment
- [ ] Run prepopulation script on staging
- [ ] Verify all users have Supabase shells
- [ ] Test login flow on staging
- [ ] Monitor staging for 24 hours

---

## Risk Assessment & Mitigation

### High Risk
| Risk | Mitigation |
|------|-----------|
| Mass migration failure | Dual auth + feature flag (instant rollback) |
| Password hash incompatibility | Clerk verification before migration (proven password) |
| User lockout | Account recovery via admin dashboard |
| Database corruption | Transactions + soft deletes + backups |

### Medium Risk
| Risk | Mitigation |
|------|-----------|
| Rate limiter overwhelmed | Upstash autoscaling + fail-open strategy |
| Webhook delivery failure | Retry logic + manual reconciliation script |
| MFA state loss | Preserve `has_mfa` flag + prompt for re-enrollment |

### Low Risk
| Risk | Mitigation |
|------|-----------|
| Analytics data loss | Migration log preserves all events |
| Session invalidation | New login required (acceptable UX) |

---

## Success Criteria

Migration is considered **successful** when:
- [ ] 95%+ users migrated within 30 days
- [ ] Auth error rate < 1%
- [ ] Zero user-reported login issues
- [ ] All E2E tests passing
- [ ] Clerk fallback rate < 10%
- [ ] Can safely disable Clerk ($0 cost reduction)

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Prerequisites | 1 week | Security fixes, DB schema |
| Phase 1: Libraries | 3 days | Phase 0 complete |
| Phase 2: API Routes | 4 days | Phase 1 complete |
| Phase 3: Frontend | 3 days | Phase 2 complete |
| Phase 4: Prepopulation | 1 day | Phase 3 complete |
| Phase 5: Testing | 1 week | All phases complete |
| Phase 6: Deployment | 3 days | Phase 5 complete |
| **Total** | **3-4 weeks** | - |

---

## Next Steps

1. **Review this plan** with team
2. **Prioritize security fixes** (Phase 0.1)
3. **Create GitHub issues** for each phase
4. **Set up staging environment**
5. **Begin Phase 0 implementation**

---

## Support & Resources

- **Supabase Auth Docs**: https://supabase.com/docs/guides/auth
- **Clerk Migration Guide**: https://clerk.com/docs/migrations
- **Upstash Redis**: https://upstash.com/docs/redis
- **PatmosLLM CLAUDE.md**: See codebase instructions

---

## 🔍 EVALUATION SUMMARY (Updated After Codebase Review)

### 1. Critical Issues Found

#### Architecture Misalignment (BLOCKER)
- **Issue**: Plan assumes clean Supabase Auth integration, but PatmosLLM uses `public.users.clerk_id` throughout
- **Impact**: Creates two-tier user system (application vs auth layer)
- **Recommendation**: Accept two-tier for migration, schedule refactoring post-migration
- **File References**: `src/app/api/auth/route.ts:18`, `src/lib/types.ts:9`

#### Missing Dependencies (CRITICAL)
- **Issue**: `@upstash/redis` and `@upstash/ratelimit` NOT installed
- **Impact**: Rate limiting code in plan won't work without installation
- **Fix**: `npm install @upstash/redis @upstash/ratelimit svix`

#### Environment Validation Gap (SECURITY)
- **Issue**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` used but NOT validated in `env.ts`
- **Impact**: Silent failure if variable missing
- **Fix**: Add to `envSchema` in `src/lib/env.ts:16`

### 2. False Assumptions Corrected

| Assumption | Reality | Impact |
|-----------|---------|--------|
| "5 JavaScript files need conversion" | ✅ All files already TypeScript | No conversion needed |
| "Need to implement structured logging" | ✅ Pino-compatible logger exists | Already implemented |
| "Need environment validation" | ✅ Zod validation exists | Just needs extension |
| "Testing infrastructure missing" | ✅ Vitest + Testing Library installed | Ready to use |
| "Hardcoded user IDs at line 69-76" | ❌ Files don't exist | Cannot verify claim |

### 3. Existing Infrastructure Leveraged

**Already Implemented** (No work needed):
- ✅ Supabase client with connection pooling (`src/lib/supabase.ts`)
- ✅ Structured logging with Pino (`src/lib/logger.ts`)
- ✅ Environment validation with Zod (`src/lib/env.ts`)
- ✅ Security headers in middleware (`src/middleware.ts`)
- ✅ Testing suite (Vitest 3.2.4, Testing Library 16.3.0)
- ✅ CI/CD with Husky + lint-staged
- ✅ Sentry error tracking integration
- ✅ 17-table database schema with soft-delete

**Needs Implementation**:
- ❌ Distributed rate limiting (Upstash Redis)
- ❌ CSRF token generation/validation
- ❌ Email utility functions (normalize, hash, validate)
- ❌ Migration logic (lazy migration on login)
- ❌ Webhook handlers (Clerk user deletion sync)

### 4. Integration Risks

#### High Risk
1. **Dual Route Complexity**: Running parallel `/sign-in` (Clerk) and `/sign-in-supabase` routes
   - Mitigation: Clear middleware routing logic
2. **User Mapping Failures**: Shell account creation could fail for some users
   - Mitigation: Alert system + manual reconciliation script
3. **Session Conflicts**: User could have both Clerk and Supabase sessions
   - Mitigation: Explicit session cleanup in migration flow

#### Medium Risk
1. **Password Verification**: Clerk password check before migration adds latency
   - Impact: Login 300-500ms slower during migration period
2. **Rate Limit False Positives**: Shared corporate IPs could trigger lockouts
   - Mitigation: Whitelist + manual unlock capability

### 5. Timeline Validation

**Original Estimate**: 3-4 weeks

**Revised Estimate**: 4-5 weeks

| Phase | Original | Revised | Reason |
|-------|----------|---------|--------|
| Phase 0: Prerequisites | 1 week | 1.5 weeks | Additional architecture decisions |
| Phase 1: Libraries | 3 days | 4 days | Rate limiter more complex than assumed |
| Phase 2: API Routes | 4 days | 5 days | Dual-route implementation |
| Phase 3: Frontend | 3 days | 4 days | Parallel Clerk/Supabase UX |
| Phase 4: Prepopulation | 1 day | 1 day | No change |
| Phase 5: Testing | 1 week | 1.5 weeks | Two-tier architecture testing |
| Phase 6: Deployment | 3 days | 4 days | More complex rollback scenarios |
| **Total** | **3-4 weeks** | **4-5 weeks** | Architecture complexity |

### 6. Success Criteria Updates

**Original Criteria** still valid with additions:

- [ ] 95%+ users migrated within 30 days
- [ ] Auth error rate < 1%
- [ ] Zero user-reported login issues
- [ ] All E2E tests passing
- [ ] Clerk fallback rate < 10%
- [ ] Can safely disable Clerk ($0 cost reduction)
- **NEW**: [ ] Two-tier architecture documented for future refactoring
- **NEW**: [ ] No performance regression (P95 < 200ms auth latency)
- **NEW**: [ ] Rate limiting prevents abuse without false positives

### 7. Deployment Prerequisites (UPDATED)

**Must Complete BEFORE Production Deployment**:

1. **Architecture Decision**
   - [ ] Team approval of two-tier user architecture
   - [ ] Post-migration refactoring scheduled

2. **Security Fixes**
   - [ ] Install Upstash Redis dependencies
   - [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` validation to `env.ts`
   - [ ] Configure Clerk webhook secret

3. **Database Migrations**
   - [ ] Run all 10 SQL migrations in Supabase
   - [ ] Verify foreign key relationships
   - [ ] Test RPC functions manually

4. **Code Implementation**
   - [ ] Implement rate limiting with Upstash
   - [ ] Create CSRF utilities
   - [ ] Build migration logic
   - [ ] Add webhook handlers
   - [ ] Update middleware for dual auth

5. **Testing**
   - [ ] 80%+ unit test coverage for auth functions
   - [ ] 70%+ integration test coverage for API routes
   - [ ] 100% E2E coverage for critical migration paths
   - [ ] Load test with 100+ concurrent users

6. **Monitoring Setup**
   - [ ] Sentry alerts configured
   - [ ] Migration dashboard accessible
   - [ ] Upstash Redis analytics enabled
   - [ ] Custom metrics tracked (migration rate, errors, lockouts)

### 8. Recommended Next Steps

**Immediate (Week 1)**:
1. Team review of architecture findings
2. Decision on two-tier vs refactoring approach
3. Install missing dependencies (`@upstash/redis`, `svix`)
4. Fix `NEXT_PUBLIC_SUPABASE_ANON_KEY` validation gap

**Short-term (Week 2-3)**:
1. Implement rate limiting with Upstash Redis
2. Create database migrations (test in staging first)
3. Build core migration libraries (CSRF, email utils, migration logic)
4. Write unit tests for new utilities

**Medium-term (Week 4-5)**:
1. Implement API routes (login, webhooks, admin)
2. Create frontend components (parallel routes)
3. Update middleware for dual authentication
4. Write integration and E2E tests

**Pre-deployment (Week 6)**:
1. Run prepopulation script in staging
2. Execute E2E test suite
3. Load test with Artillery (100+ concurrent users)
4. Monitor staging for 48 hours
5. Create rollback runbook

**Post-deployment**:
1. Monitor migration dashboard daily
2. Track error rates via Sentry
3. Respond to user feedback within 4 hours
4. Schedule architecture refactoring (6-8 weeks out)

---

*This plan has been thoroughly reviewed against the actual PatmosLLM codebase (commit: 145e97a) and updated with corrections, security findings, and realistic implementation guidance.*
