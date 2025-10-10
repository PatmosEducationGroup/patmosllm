Awesome — here’s the **full end-to-end plan** and the **production-ready code** in the exact order you’ll implement it.

---

# ✅ Master Checklist (do these in order)

## Phase 0 — Prereqs & Env ✅ COMPLETE

1. ✅ Create a Supabase project; get:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY`
2. ✅ Create a Clerk app; get:
   * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_test_ for dev, pk_live_ for production)
   * `CLERK_SECRET_KEY` (sk_test_ for dev, sk_live_ for production)
   * `CLERK_WEBHOOK_SECRET`
3. ⏭️  SKIPPED: Upstash Redis - Using in-memory rate limiting for now
   * Note: Will need distributed cache before scaling to multi-region
4. ✅ Set `NEXT_PUBLIC_APP_URL` (https://multiplytools.app)
5. ✅ Add `.env.local` (development) and `.env.production` (from Vercel) with all vars

## Phase 1 — Packages & Node ✅ COMPLETE

6. ✅ **Node 20** already in `package.json` engines; installed:
   * ✅ @supabase/supabase-js, @supabase/ssr
   * ✅ @clerk/nextjs, svix
   * ⏭️  SKIPPED: @upstash/ratelimit, @upstash/redis (using in-memory for now)
   * ⏭️  TODO: qrcode, @types/qrcode (for MFA setup)
   * ⏭️  TODO: @playwright/test (for E2E tests)

## Phase 2 — DB & SQL (Supabase) ✅ COMPLETE

7. ✅ Run migrations to create:
   * ✅ `user_migration` map table
   * ✅ `migration_log`, `migration_alerts`, `account_lockouts`
   * ✅ Views for dashboard: `v_migration_progress`, `v_migration_last_24h`, `v_migration_by_auth_type`
   * ✅ RPC functions: `ensure_user_mapping`, `get_auth_user_id_by_email`, `is_account_locked`, `record_failed_attempt`, `clear_failed_attempts`
8. ✅ Verified Supabase Auth email provider is enabled
9. ✅ Configured Site URL: https://multiplytools.app

## Phase 3 — Core Library Files ⚠️ PARTIAL

Existing files (already implemented):
   * ✅ `lib/supabase.ts` (clients) - already exists
   * ✅ `lib/logger.ts` (PII-safe logs) - already exists

Still needed:
   * ⏭️  TODO: `lib/env.ts` (env validation with Zod)
   * ⏭️  TODO: `lib/csrf.ts` (CSRF tokens)
   * ⏭️  TODO: `lib/email-utils.ts` (normalize/hash/validate)
   * ⏭️  TODO: `lib/feature-flags.ts` (kill switch)
   * ⏭️  TODO: `lib/security-headers.ts` (CSP/XFO/etc.)

## Phase 4 — Prepopulation ✅ COMPLETE

10. ✅ Created `scripts/prepopulate-production.ts` for production environment
11. ✅ Created `scripts/sync-production-clerk-ids.ts` to fix ID mismatches
12. ✅ Created `scripts/check-user-clerk-id.ts` for diagnostics
13. ✅ Created `scripts/find-user-in-clerk.ts` for verification
14. ✅ **PRODUCTION PREPOPULATION COMPLETE:**
    * ✅ All 15 active production users verified in Clerk
    * ✅ All 15 users mapped to existing Supabase Auth accounts
    * ✅ All mappings created in `user_migration` table
    * ✅ Zero errors - production ready for dual-auth deployment
15. ⏭️  TODO: Add `lib/auth-migration.ts` (migrate on successful Clerk verify) - NOT NEEDED until Phase 5

## Phase 5 — Smart Login Flow Implementation 🚧 IN PROGRESS

**Status:** Testing locally - Clerk authentication failing

**Prerequisites (all complete):**
* ✅ All 15 production users have valid Clerk IDs
* ✅ All users mapped in `user_migration` table
* ✅ Database migrations complete
* ✅ RPC functions deployed
* ✅ Dashboard views created

**Implementation completed:**

✅ **Smart Login UI (`/login` page):**
- Email-first flow: user enters email, system checks migration status
- Adaptive messaging: "Welcome to Multiply Tools" branding
- If unmigrated: shows normal password field, no scary warnings
- If migrated: shows "Welcome back!" message
- Clean, professional design that looks trustworthy

✅ **Migration Check API (`/api/auth/check-migration`):**
- Queries `user_migration` table by email
- Returns `{ migrated: true/false, exists: true/false }`
- Used by login page to determine auth flow

✅ **Clerk Login API (`/api/auth/login-clerk`):**
- Uses Clerk's server-side SignIn API: `signIns.create()` + `attemptFirstFactor()`
- Verifies password with Clerk
- Calls `migrateUserToSupabase()` to update shell account
- Logs user into Supabase with same password
- Marks as migrated in database
- **STATUS:** ⚠️ Currently returning 500 error - needs debugging

✅ **Supabase Login API (`/api/auth/login-supabase`):**
- Direct Supabase Auth login for migrated users
- Sets session cookies properly
- Redirects to `/chat` on success

✅ **Migration Library (`lib/auth-migration.ts`):**
- `migrateUserToSupabase()` function
- Updates Supabase Auth password from Clerk password
- Syncs metadata (name, Clerk ID, migration timestamp)
- Updates `user_migration.migrated = true`
- Logs to `migration_log` table

**Current Issue:**

❌ **Clerk login API returning 500 error** when testing locally
- Error message: "Authentication failed"
- Need to check server logs for detailed error
- Clerk `signIns.create()` or `attemptFirstFactor()` may be failing
- Possible issues:
  - Incorrect Clerk API usage
  - Development keys vs production keys
  - User account not set up for password auth
  - Missing permissions in Clerk dashboard

**Next Steps (when resuming):**

1. ⏭️ **DEBUG:** Check terminal logs for `[CLERK LOGIN]` messages to see exact error
2. ⏭️ **FIX:** Resolve Clerk authentication API issue
3. ⏭️ **TEST:** Verify full migration flow works locally
4. ⏭️ **REPLACE:** Update main sign-in button to use `/login` instead of Clerk modal
5. ⏭️ **DEPLOY:** Push to production
6. ⏭️ **MIGRATE:** Test with own account first
7. ⏭️ **FORCE LOGOUT:** Run `force-clerk-logout.ts` to migrate all users

**Files Created (ready for testing):**
- `/src/app/login/page.tsx` - Smart login form
- `/src/app/api/auth/check-migration/route.ts` - Migration status check
- `/src/app/api/auth/login-clerk/route.ts` - Clerk auth + migration (HAS BUG)
- `/src/app/api/auth/login-supabase/route.ts` - Supabase auth
- `/src/lib/auth-migration.ts` - Migration logic (EXISTS - was created in Phase 4)

**Still TODO:**
- Debug Clerk authentication failure
- Update `/sign-in` route to redirect to `/login`
- Update main page sign-in button
- Test complete flow end-to-end
- Deploy to production

## Phase 6 — UI & UX ⏭️ FUTURE

15. TODO: `app/sign-in/page.tsx` (rotate CSRF, render login form)
16. TODO: `components/LoginForm.tsx` (hidden CSRF + submit to server route)
17. TODO: MFA flow:
    * `app/dashboard/layout.tsx` (redirect to MFA setup if needed)
    * `app/dashboard/setup-mfa/page.tsx` (TOTP enroll + backup codes)
18. TODO: Dashboard:
    * `app/dashboard/migration/page.tsx`
    * `app/dashboard/migration/components/HealthCard.tsx`

## Phase 7 — Tests & Monitoring ⏭️ FUTURE

20. TODO: Playwright config + E2E tests
21. TODO: Build & run tests
22. TODO: Monitor dashboard; track migration progress
23. TODO: Emergency kill switch available: flip `DUAL_AUTH_ENABLED=false` if needed

---

## 📊 Current Status Summary

**Completed:**
* ✅ Database schema and migrations
* ✅ Production user verification and mapping
* ✅ All 15 production users ready for migration
* ✅ Prepopulation scripts tested and working

**Next Steps:**
1. Implement `lib/auth-migration.ts` with lazy migration logic
2. Create dual-auth login route at `app/api/auth/login/route.ts`
3. Update middleware for Supabase-first authentication
4. Deploy to production with `DUAL_AUTH_ENABLED=true`
5. Test first user login to verify migration flow
6. Monitor migration dashboard

**Known Gaps:**
* No distributed rate limiting (using in-memory Map)
* No E2E tests yet
* MFA migration flow not implemented
* Migration dashboard UI not created

---

# 💻 Code (copy-paste by file)

> Use these filenames/paths as indicated.

## 0) `package.json` (Node lock + scripts)

```json
{
  "name": "your-app",
  "version": "0.1.0",
  "engines": { "node": ">=20.0.0 <21.0.0", "npm": ">=10.0.0" },
  "scripts": {
    "preinstall": "node -e \"if(parseInt(process.versions.node.split('.')[0]) < 20) throw new Error('Node 20+ required')\"",
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@types/qrcode": "^1.5.5"
  },
  "dependencies": {
    "@clerk/nextjs": "^5.0.0",
    "@supabase/auth-helpers-nextjs": "^0.10.0",
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "@upstash/ratelimit": "^1.0.0",
    "@upstash/redis": "^1.28.0",
    "qrcode": "^1.5.3",
    "svix": "^1.13.0"
  }
}
```

---

## 1) SQL Migrations (Supabase)

### `migrations/001_user_migration_table.sql`

```sql
create table if not exists user_migration (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  supabase_id uuid not null,
  clerk_id text not null,
  migrated boolean default false,
  migrated_at timestamptz,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists idx_user_migration_email on user_migration(email);
create index if not exists idx_user_migration_migrated on user_migration(migrated);
create index if not exists idx_user_migration_deleted_at on user_migration(deleted_at);
```

### `migrations/002_migration_log.sql`

```sql
create table if not exists migration_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  clerk_user_id text not null,
  supabase_user_id uuid not null,
  migrated_at timestamptz default now()
);

create index if not exists idx_migration_log_timestamp on migration_log(migrated_at);
```

### `migrations/003_ensure_user_mapping.sql`

```sql
create or replace function ensure_user_mapping(
  p_email text,
  p_clerk_id text,
  p_supabase_id uuid
) returns uuid
language sql
security definer
as $$
  insert into user_migration (email, supabase_id, clerk_id, migrated)
  values (p_email, p_supabase_id, p_clerk_id, false)
  on conflict (email)
  do update set
    supabase_id = excluded.supabase_id,
    clerk_id = excluded.clerk_id
  returning supabase_id;
$$;
```

### `migrations/004_migration_views.sql`

```sql
create or replace view v_migration_progress as
select 
  (select count(*) from user_migration) as total,
  (select count(*) from user_migration where migrated) as migrated,
  (select count(*) from user_migration where not migrated) as remaining,
  round((select count(*) from user_migration where migrated)::numeric / 
        nullif((select count(*) from user_migration), 0) * 100, 2) as percentage;

create or replace view v_migration_last_24h as
select date_trunc('hour', migrated_at) as hour, count(*) as migrated
from user_migration
where migrated and migrated_at >= now() - interval '24 hours'
group by 1
order by 1;

create or replace view v_migration_by_auth_type as
select 
  coalesce(au.raw_user_meta_data->>'clerk_auth_type', 'unknown') as auth_type,
  count(*) as count,
  count(*) filter (where um.migrated) as migrated_count
from user_migration um
join auth.users au on au.id = um.supabase_id
group by 1
order by 1;
```

### `migrations/005_ttl_policy.sql`

```sql
create or replace function cleanup_old_migration_logs()
returns void
language plpgsql
as $$
begin
  delete from migration_log where migrated_at < now() - interval '180 days';
end;
$$;

select cron.schedule(
  'cleanup-migration-logs',
  '0 2 * * *',
  $$select cleanup_old_migration_logs()$$
);
```

### `migrations/006_migration_alerts.sql`

```sql
create table if not exists migration_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  clerk_id text not null,
  alert_type text not null,
  created_at timestamptz default now()
);

create index if not exists idx_migration_alerts_created on migration_alerts(created_at);
create index if not exists idx_migration_alerts_type on migration_alerts(alert_type);
```

### `migrations/008_account_lockout.sql`

```sql
create table if not exists account_lockouts (
  id uuid primary key default gen_random_uuid(),
  email_hash text unique not null,
  failed_attempts integer default 0,
  locked_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function is_account_locked(p_email_hash text)
returns boolean
language plpgsql
as $$
declare v record;
begin
  select 1 into v
  from account_lockouts
  where email_hash = p_email_hash
    and locked_until > now();
  return found;
end;
$$;

create or replace function record_failed_attempt(p_email_hash text)
returns void
language plpgsql
as $$
declare v_attempts int; v_lock interval;
begin
  insert into account_lockouts (email_hash, failed_attempts, updated_at)
  values (p_email_hash, 1, now())
  on conflict (email_hash)
  do update set failed_attempts = account_lockouts.failed_attempts + 1,
               updated_at = now();

  select failed_attempts into v_attempts
  from account_lockouts where email_hash = p_email_hash;

  if v_attempts >= 20 then v_lock := interval '24 hours';
  elsif v_attempts >= 10 then v_lock := interval '1 hour';
  elsif v_attempts >= 5 then v_lock := interval '15 minutes';
  else return; end if;

  update account_lockouts
  set locked_until = now() + v_lock
  where email_hash = p_email_hash;

  perform pg_notify('account_locked',
    json_build_object('email_hash', p_email_hash, 'attempts', v_attempts, 'locked_until', now()+v_lock)::text);
end;
$$;

create or replace function clear_failed_attempts(p_email_hash text)
returns void
language plpgsql
as $$
begin
  delete from account_lockouts where email_hash = p_email_hash;
end;
$$;
```

---

## 2) Core libs

### `lib/env.ts`

```ts
const required = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
] as const;

export function validateEnv() {
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env vars:\n${missing.map(k => ` - ${k}`).join('\n')}`);
  }
}
validateEnv();
```

### `lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
)

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export function createSupabaseServerClient(cookies: {
  get: (name: string) => string | undefined
  set: (name: string, value: string, options: any) => void
  remove: (name: string, options: any) => void
}) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  )
}
```

### `lib/csrf.ts`

```ts
import crypto from 'crypto'

export function createCsrfToken() {
  return crypto.randomBytes(16).toString('hex')
}
export function constantTimeEqual(a: string, b: string) {
  const A = Buffer.from(a || ''), B = Buffer.from(b || '')
  return A.length === B.length && crypto.timingSafeEqual(A, B)
}
```

### `lib/email-utils.ts`

```ts
import crypto from 'crypto'

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
export function hashEmail(email: string) {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 16)
}
export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
```

### `lib/logger.ts`

```ts
import { hashEmail } from './email-utils'
type Level = 'debug'|'info'|'warn'|'error'
const min = process.env.LOG_LEVEL || 'info'
const order = ['debug','info','warn','error']

function should(level: Level){ return order.indexOf(level) >= order.indexOf(min) }
function sanitize(ctx: any){ const c = { ...ctx }; delete c.email; delete c.password; delete c.token; if(ctx?.email) c.emailHash = hashEmail(ctx.email); return c }

export const logger = {
  debug: (m: string, c?: any)=> should('debug') && console.debug(m, sanitize(c)),
  info:  (m: string, c?: any)=> should('info')  && console.info(m, sanitize(c)),
  warn:  (m: string, c?: any)=> should('warn')  && console.warn(m, sanitize(c)),
  error: (m: string, e?: Error, c?: any)=> should('error') && console.error(m, { error:{message:e?.message, stack:e?.stack}, ...sanitize(c) })
}
```

### `lib/feature-flags.ts`

```ts
export const DUAL_AUTH_ENABLED = process.env.DUAL_AUTH_ENABLED === 'true'
```

### `lib/security-headers.ts`

```ts
export function withSecurityHeaders(response: Response) {
  const h = new Headers(response.headers)
  h.set('X-Frame-Options', 'DENY')
  h.set('Referrer-Policy', 'no-referrer')
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  h.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('X-XSS-Protection', '1; mode=block')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h })
}
```

---

## 3) Migration logic

### `lib/auth-migration.ts`

```ts
import { supabaseAdmin } from './supabase'
import { clerkClient } from '@clerk/nextjs/server'
import { logger } from './logger'

export async function migrateUserToSupabase(email: string, password: string, clerkUserId: string) {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId)

    // Find precreated shell via mapping
    const { data: mapRow, error: mapErr } = await supabaseAdmin
      .from('user_migration')
      .select('supabase_id, migrated')
      .eq('email', email)
      .maybeSingle()

    if (mapErr || !mapRow?.supabase_id) {
      logger.error('No precreated Supabase user', undefined, { email })
      return null
    }
    if (mapRow.migrated) return { id: mapRow.supabase_id }

    // Update password + metadata
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(mapRow.supabase_id, {
      password,
      user_metadata: {
        clerk_id: clerkUserId,
        first_name: clerkUser.firstName,
        last_name: clerkUser.lastName,
        migrated: true,
        migrated_at: new Date().toISOString(),
        mfa_migration_needed: clerkUser.twoFactorEnabled || false
      }
    })
    if (error) {
      logger.error('Migration updateUser error', error, { email })
      return null
    }

    await supabaseAdmin.from('user_migration').update({
      migrated: true, migrated_at: new Date().toISOString()
    }).eq('email', email)

    await supabaseAdmin.from('migration_log').insert({
      email, clerk_user_id: clerkUserId, supabase_user_id: mapRow.supabase_id
    })

    return data.user
  } catch (e: any) {
    logger.error('Migration failed', e, { email })
    return null
  }
}
```

### `scripts/prepopulate-users.ts`

```ts
import { clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '../lib/supabase'
import * as crypto from 'crypto'

const emailToId = new Map<string, string>()
async function findSupabaseUserByEmail(email: string) {
  if (emailToId.has(email)) return emailToId.get(email)!
  let page = 1, perPage = 1000
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error || !data) break
    for (const u of data.users) if (u.email) emailToId.set(u.email, u.id)
    if (data.users.length < perPage) break
    page++
  }
  return emailToId.get(email) || null
}

async function ensureUserShell(email: string, clerkId: string, metadata: any) {
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID(), user_metadata: metadata
  })
  let supabaseId = created?.user?.id
  if (createErr && /already registered/i.test(createErr.message)) {
    supabaseId = await findSupabaseUserByEmail(email)
  }
  if (!supabaseId) { console.error(`❌ Could not resolve Supabase ID for ${email}`); return null }
  const { error: mapErr } = await supabaseAdmin.rpc('ensure_user_mapping', {
    p_email: email, p_clerk_id: clerkId, p_supabase_id: supabaseId
  })
  if (mapErr) { console.error(`❌ Mapping error for ${email}:`, mapErr); return null }
  return supabaseId
}

async function run() {
  let offset = 0, limit = 100, processed = 0, created = 0
  console.log('🚀 Starting pre-population...')
  while (true) {
    const { data } = await clerkClient.users.getUserList({ limit, offset })
    if (!data?.length) break
    for (const user of data) {
      const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
      if (!primaryEmail) { console.log(`⚠️ Skipping ${user.id}: no primary email`); continue }
      const hasPassword = user.passwordEnabled
      const hasOAuth = user.externalAccounts.length > 0
      const authType = hasPassword ? 'password' : hasOAuth ? 'oauth' : 'magic_link'
      const id = await ensureUserShell(primaryEmail, user.id, {
        clerk_id: user.id, first_name: user.firstName, last_name: user.lastName,
        clerk_auth_type: authType, has_mfa: user.twoFactorEnabled || false, migrated: false, created_at: user.createdAt
      })
      if (id) { created++; console.log(`✓ ${primaryEmail} [${authType}]`) }
      processed++
    }
    offset += limit
    console.log(`📊 Processed ${processed} users...`)
  }
  console.log(`✅ Done. processed=${processed} created=${created}`)
}
run().catch(console.error)
```

---

## 4) API routes

### `app/api/auth/login/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { clerkClient } from '@clerk/nextjs/server'
import { migrateUserToSupabase } from '@/lib/auth-migration'
import { constantTimeEqual } from '@/lib/csrf'
import { cookies as nextCookies } from 'next/headers'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeEmail, hashEmail, isValidEmail } from '@/lib/email-utils'
import { DUAL_AUTH_ENABLED } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(5, '15 m') })
function getClientIP(req: Request) {
  const h = req.headers
  return h.get('x-vercel-ip') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function POST(req: Request) {
  const headerToken = req.headers.get('x-csrf') || ''
  const cookieToken = nextCookies().get('csrf')?.value || ''
  if (!headerToken || !cookieToken || !constantTimeEqual(headerToken, cookieToken))
    return new NextResponse(JSON.stringify({ success:false, error:'Bad CSRF token' }), { status: 403 })

  let { email, password } = await req.json()
  if (!isValidEmail(email)) return new NextResponse(JSON.stringify({ success:false, error:'Invalid email format' }), { status: 400 })
  email = normalizeEmail(email)
  const emailHash = hashEmail(email)

  const resHeaders = new Headers()
  const cookieAdapter = {
    get: () => undefined,
    set: (name: string, value: string, options: any) => {
      const cookie = [`${name}=${value}`, `Path=${options?.path ?? '/'}`, 'HttpOnly', `SameSite=${options?.sameSite ?? 'Lax'}`,
        options?.secure ? 'Secure':'', options?.maxAge?`Max-Age=${options.maxAge}`:'', options?.domain?`Domain=${options.domain}`:''
      ].filter(Boolean).join('; ')
      resHeaders.append('Set-Cookie', cookie)
    },
    remove: (name: string, options: any) => resHeaders.append('Set-Cookie', `${name}=; Path=${options?.path ?? '/'}; Max-Age=0`)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: cookieAdapter as any }
  )

  // Account locked?
  const locked = await supabaseAdmin.rpc('is_account_locked', { p_email_hash: emailHash }).then(r=>r.data).catch(()=>false)
  if (locked) return new NextResponse(JSON.stringify({ success:false, error:'Account temporarily locked. Try later.' }), { status: 423 })

  // Supabase first
  const { data: s1 } = await supabase.auth.signInWithPassword({ email, password })
  if (s1?.user) {
    await supabaseAdmin.rpc('clear_failed_attempts', { p_email_hash: emailHash }).catch(()=>{})
    return new NextResponse(JSON.stringify({ success:true, source:'supabase', mfa_migration_needed: !!s1.user.user_metadata?.mfa_migration_needed }), { status: 200, headers: resHeaders })
  }

  if (!DUAL_AUTH_ENABLED) {
    await supabaseAdmin.rpc('record_failed_attempt', { p_email_hash: emailHash }).catch(()=>{})
    return new NextResponse(JSON.stringify({ success:false, error:'Invalid credentials' }), { status: 401, headers: resHeaders })
  }

  // Rate limit (Clerk fallback path)
  const ip = getClientIP(req)
  const { success: ok } = await ratelimit.limit(`${ip}:${email}`)
  if (!ok) {
    await supabaseAdmin.from('migration_alerts').insert({ email, clerk_id:'unknown', alert_type:'rate_limit_hit' }).catch(()=>{})
    return new NextResponse(JSON.stringify({ success:false, error:'Too many attempts' }), { status: 429 })
  }

  // Clerk verify (server SDK)
  try {
    const signIn = await clerkClient.signIns.create({ identifier: email })
    const attempt = await clerkClient.signIns.attemptFirstFactor({ signInId: signIn.id, strategy: 'password', password })
    if (attempt.status !== 'complete' || !attempt.createdSessionId) {
      await supabaseAdmin.from('migration_alerts').insert({ email, clerk_id:'unknown', alert_type:'auth_error' }).catch(()=>{})
      await supabaseAdmin.rpc('record_failed_attempt', { p_email_hash: emailHash }).catch(()=>{})
      return new NextResponse(JSON.stringify({ success:false, error:'Invalid credentials' }), { status: 401 })
    }

    try { await clerkClient.sessions.revokeSession(attempt.createdSessionId) } catch {}

    const migrated = await migrateUserToSupabase(email, password, attempt.userId)
    if (!migrated) {
      await supabaseAdmin.from('migration_alerts').insert({ email, clerk_id:attempt.userId, alert_type:'migration_error' }).catch(()=>{})
      return new NextResponse(JSON.stringify({ success:false, error:'Migration failed' }), { status: 500 })
    }

    const { data: s2, error: s2err } = await supabase.auth.signInWithPassword({ email, password })
    if (s2err) {
      await supabaseAdmin.from('migration_alerts').insert({ email, clerk_id:attempt.userId, alert_type:'auth_error' }).catch(()=>{})
      return new NextResponse(JSON.stringify({ success:false, error:'Login failed after migration' }), { status: 500 })
    }

    await supabaseAdmin.rpc('clear_failed_attempts', { p_email_hash: emailHash }).catch(()=>{})
    return new NextResponse(JSON.stringify({ success:true, source:'clerk-migrated', mfa_migration_needed: !!s2.user?.user_metadata?.mfa_migration_needed }), { status: 200, headers: resHeaders })
  } catch {
    await supabaseAdmin.from('migration_alerts').insert({ email, clerk_id:'unknown', alert_type:'auth_error' }).catch(()=>{})
    await supabaseAdmin.rpc('record_failed_attempt', { p_email_hash: emailHash }).catch(()=>{})
    return new NextResponse(JSON.stringify({ success:false, error:'Authentication failed' }), { status: 401 })
  }
}
```

### `app/api/webhooks/clerk/route.ts`

```ts
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) throw new Error('CLERK_WEBHOOK_SECRET missing')

  const h = headers()
  const id = h.get('svix-id'), ts = h.get('svix-timestamp'), sig = h.get('svix-signature')
  if (!id || !ts || !sig) return new NextResponse('Missing svix headers', { status: 400 })

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(secret)
  let evt: any
  try { evt = wh.verify(body, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig }) }
  catch { return new NextResponse('Invalid signature', { status: 400 }) }

  if (evt.type === 'user.deleted') {
    const clerkId = evt.data.id
    await supabaseAdmin.from('user_migration').update({ migrated:false, deleted_at: new Date().toISOString() }).eq('clerk_id', clerkId).catch(()=>{})
  }

  return new NextResponse('OK', { status: 200 })
}
```

### `app/api/migration-stats/route.ts`

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { count: migrated } = await supabaseAdmin.from('user_migration').select('*', { count:'exact', head:true }).eq('migrated', true)
  let clerkTotal = null // (Optional) fetch via Clerk pagination if you want exact totals
  return NextResponse.json({ migrated_users: migrated || 0, clerk_total_unknown: clerkTotal === null })
}
```

### `app/api/migration-health/route.ts`

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Redis } from '@upstash/redis'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const redis = Redis.fromEnv()
    const dayAgoISO = new Date(Date.now()-24*60*60*1000).toISOString()
    const info = await redis.info()
    const m = info.match(/used_memory_human:(\d+\.?\d*)([KMG])/)
    const factor: any = { K:1/1024, M:1, G:1024 }
    const usedMB = m ? parseFloat(m[1]) * (factor[m[2]] ?? 1) : 0

    const { count: totalAttempts } = await supabaseAdmin.from('migration_log').select('*',{count:'exact',head:true}).gte('migrated_at', dayAgoISO)
    const { count: errorCount } = await supabaseAdmin.from('migration_alerts').select('*',{count:'exact',head:true}).eq('alert_type','auth_error').gte('created_at', dayAgoISO)
    const authErrorRate = totalAttempts ? (errorCount!/totalAttempts!)*100 : 0

    const { count: migrated24h } = await supabaseAdmin.from('user_migration').select('*',{count:'exact',head:true}).eq('migrated', true).gte('migrated_at', dayAgoISO)
    const { data: progress } = await supabaseAdmin.from('v_migration_progress').select('*').single()
    const clerkFallbackRate = progress?.total ? ((progress.total - progress.migrated)/progress.total)*100 : 0

    return NextResponse.json({
      upstash_used_mb: Math.round(usedMB*10)/10,
      auth_error_rate: Math.round(authErrorRate*100)/100,
      migration_rate_24h: migrated24h || 0,
      clerk_fallback_rate: Math.round(clerkFallbackRate*10)/10
    })
  } catch (e) {
    return NextResponse.json({ error:'Health check failed' }, { status: 500 })
  }
}
```

---

## 5) Middleware & Security

### `middleware.ts`

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authMiddleware } from '@clerk/nextjs'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { withSecurityHeaders } from './lib/security-headers'

const PUBLIC_ROUTES = ['/', '/sign-in(.*)', '/sign-up(.*)', '/api/auth/(.*)']
const PROTECTED_AUTH_ROUTES = ['/sign-in', '/sign-up', '/api/auth/login']
function shouldSecure(path: string){ return PROTECTED_AUTH_ROUTES.some(r => path.startsWith(r)) }

export default authMiddleware({
  publicRoutes: PUBLIC_ROUTES,
  async beforeAuth(req: NextRequest) {
    let res = NextResponse.next()
    if (shouldSecure(req.nextUrl.pathname)) res = withSecurityHeaders(res) as any
    const supabase = createMiddlewareClient({ req, res })
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return res
    return
  },
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ],
}
```

---

## 6) Sign-in & MFA

### `app/sign-in/page.tsx`

```tsx
import { cookies } from 'next/headers'
import { createCsrfToken } from '@/lib/csrf'
import LoginForm from '@/components/LoginForm'

export default async function SignInPage() {
  const token = createCsrfToken()
  cookies().set('csrf', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path:'/', maxAge: 60*15
  })
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full"><LoginForm csrfToken={token} /></div>
    </div>
  )
}
```

### `components/LoginForm.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ csrfToken }: { csrfToken: string }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [mfaNeeded, setMfaNeeded] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const resp = await fetch('/api/auth/login', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'x-csrf': csrfToken },
        body: JSON.stringify({ email, password })
      })
      const data = await resp.json()
      if (!resp.ok) { setError(data.error || 'Login failed'); setLoading(false); return }
      if (data.mfa_migration_needed) setMfaNeeded(true)
      router.push('/dashboard'); router.refresh()
    } catch { setError('An error occurred'); setLoading(false) }
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">Sign In</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="csrf" value={csrfToken} />
        {mfaNeeded && <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm">⚠️ Please set up 2FA after logging in</div>}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" required/>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" required/>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">{error}</div>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium">
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
```

### `app/dashboard/layout.tsx`

```tsx
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const supabase = createSupabaseServerClient({
    get: (n) => cookieStore.get(n)?.value,
    set: (n,v,o) => cookieStore.set(n,v,o),
    remove: (n,o) => cookieStore.set(n,'',o)
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const mfaNeeded = user.user_metadata?.mfa_migration_needed
  const defers = user.user_metadata?.mfa_deferred_count || 0
  if (mfaNeeded && defers < 3) redirect('/dashboard/setup-mfa')

  return <>{children}</>
}
```

### `app/dashboard/setup-mfa/page.tsx`

```tsx
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import crypto from 'crypto'

function generateBackupCodes(n = 10){ return Array.from({length:n}, ()=> crypto.randomBytes(4).toString('hex').toUpperCase()) }

export default function SetupMFAPage() {
  const [qr, setQr] = useState(''); const [secret, setSecret] = useState(''); const [code, setCode] = useState('')
  const [backup, setBackup] = useState<string[]>([]); const [showBackup, setShowBackup] = useState(false)
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const router = useRouter()

  async function start() {
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' })
    if (error) { setError(error.message); setLoading(false); return }
    setQr(await QRCode.toDataURL(data.totp.qr_code)); setSecret(data.totp.secret); setLoading(false)
  }

  async function verify() {
    setLoading(true); setError('')
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.[0]; if (!totp) { setError('No enrollment found'); setLoading(false); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code })
    if (error) { setError(error.message); setLoading(false); return }

    const codes = generateBackupCodes()
    const hashed = codes.map(c => crypto.createHash('sha256').update(c).digest('hex'))
    await supabase.auth.updateUser({ data: { mfa_migration_needed:false, mfa_enrolled_at: new Date().toISOString(), mfa_backup_codes: hashed } })
    setBackup(codes); setShowBackup(true); setLoading(false)
  }

  function defer() {
    supabase.auth.getUser().then(async ({ data:{user} })=>{
      const cur = user?.user_metadata?.mfa_deferred_count || 0
      await supabase.auth.updateUser({ data: { mfa_deferred_count: cur+1 } })
      router.push('/dashboard'); router.refresh()
    })
  }

  function download() {
    const blob = new Blob([backup.join('\n')], { type:'text/plain' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'backup-codes.txt'; a.click()
  }

  if (showBackup) return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Save Your Backup Codes</h1>
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6 text-sm">
        ⚠️ Save these codes now. Each code can be used once.
      </div>
      <div className="bg-gray-50 border rounded p-6 mb-6 grid grid-cols-2 gap-2 font-mono text-sm">
        {backup.map((c,i)=><div key={i} className="bg-white p-2 rounded border">{c}</div>)}
      </div>
      <div className="flex gap-4">
        <button onClick={download} className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700">Download Codes</button>
        <button onClick={()=>router.push('/dashboard')} className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700">I've Saved My Codes</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Set Up Two-Factor Authentication</h1>
      {!qr ? (
        <button onClick={start} disabled={loading} className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Loading...' : 'Start MFA Setup'}
        </button>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Step 1: Scan QR Code</h2>
            <img src={qr} alt="QR Code" className="border rounded p-4"/>
            <p className="text-xs text-gray-500 mt-2">Secret: <code className="bg-gray-100 px-2 py-1 rounded">{secret}</code></p>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Step 2: Verify</h2>
            <input type="text" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"
              className="w-full max-w-xs px-4 py-2 border rounded text-center text-2xl tracking-widest" maxLength={6}/>
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">{error}</div>}
          <div className="flex gap-4">
            <button onClick={verify} disabled={loading || code.length!==6} className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Verifying...' : 'Enable 2FA'}
            </button>
            <button onClick={defer} className="bg-gray-200 text-gray-700 px-6 py-3 rounded hover:bg-gray-300">Remind Me Later</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## 7) Dashboard

### `app/dashboard/migration/components/HealthCard.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
interface Health { upstash_used_mb: number; auth_error_rate: number; migration_rate_24h: number; clerk_fallback_rate: number }
const fmt = (v?: number, s='') => (v===undefined||v===null||isNaN(v)) ? '—' : `${v}${s}`

export function HealthCard() {
  const [m, setM] = useState<Health| null>(null); const [loading, setLoading] = useState(true); const [err, setErr] = useState(false)
  useEffect(()=>{ const go=async()=>{ try{ const r=await fetch('/api/migration-health'); if(!r.ok) throw 0; setM(await r.json()); setErr(false) } catch{ setErr(true) } finally{ setLoading(false) } }; go(); const t=setInterval(go,30000); return ()=>clearInterval(t) },[])
  if (loading) return <div className="bg-white p-6 rounded-lg shadow animate-pulse h-48" />
  if (err || !m) return <div className="bg-red-50 border border-red-200 p-6 rounded-lg shadow text-red-600">⚠️ Health metrics unavailable</div>
  const highErr = m.auth_error_rate > 5, highFallback = m.clerk_fallback_rate > 50
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">System Health</h2>
      <div className="grid grid-cols-2 gap-4">
        <div><div className="text-sm text-gray-600">Upstash Memory</div><div className="text-2xl font-bold">{fmt(m.upstash_used_mb,' MB')}</div></div>
        <div><div className="text-sm text-gray-600">Auth Error Rate</div><div className="text-2xl font-bold">{fmt(m.auth_error_rate,'%')}</div>
          <div className={`text-xs ${highErr?'text-red-600':'text-green-600'}`}>{highErr?'⚠️ Elevated':'✓ Normal'}</div></div>
        <div><div className="text-sm text-gray-600">Migration Rate (24h)</div><div className="text-2xl font-bold">{fmt(m.migration_rate_24h)}</div><div className="text-xs text-blue-600">users/day</div></div>
        <div><div className="text-sm text-gray-600">Clerk Fallback Rate</div><div className="text-2xl font-bold">{fmt(m.clerk_fallback_rate,'%')}</div>
          <div className={`text-xs ${highFallback?'text-orange-600':'text-blue-600'}`}>{highFallback?'⚠️ Still high':'Migrating well'}</div></div>
      </div>
    </div>
  )
}
```

### `app/dashboard/migration/page.tsx`

```tsx
import { supabaseAdmin } from '@/lib/supabase'
import { HealthCard } from './components/HealthCard'
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'

async function getStats() {
  const [progress, last24h, byType] = await Promise.all([
    supabaseAdmin.from('v_migration_progress').select('*').single(),
    supabaseAdmin.from('v_migration_last_24h').select('*'),
    supabaseAdmin.from('v_migration_by_auth_type').select('*'),
  ])
  return { progress: progress.data, last24h: last24h.data || [], byType: byType.data || [] }
}

export default async function MigrationDashboard() {
  const stats = await getStats()
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Migration Dashboard</h1>
      <div className="mb-8"><HealthCard /></div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg shadow"><div className="text-sm text-gray-600">Total Users</div><div className="text-3xl font-bold">{stats.progress?.total || 0}</div></div>
        <div className="bg-green-50 p-6 rounded-lg shadow"><div className="text-sm text-gray-600">Migrated</div><div className="text-3xl font-bold text-green-600">{stats.progress?.migrated || 0}</div></div>
        <div className="bg-orange-50 p-6 rounded-lg shadow"><div className="text-sm text-gray-600">Remaining</div><div className="text-3xl font-bold text-orange-600">{stats.progress?.remaining || 0}</div></div>
        <div className="bg-blue-50 p-6 rounded-lg shadow"><div className="text-sm text-gray-600">Progress</div><div className="text-3xl font-bold text-blue-600">{stats.progress?.percentage || 0}%</div></div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-semibold mb-4">Migrations (Last 24h)</h2>
        <div className="space-y-2">
          {stats.last24h.map((h:any)=>(
            <div key={h.hour} className="flex items-center gap-4">
              <div className="text-sm text-gray-600 w-32">{new Date(h.hour).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-6">
                <div className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.min(h.migrated * 10, 100)}%` }}>
                  <span className="text-xs text-white font-semibold">{h.migrated}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Migration by Auth Type</h2>
        <table className="w-full">
          <thead><tr className="border-b"><th className="text-left py-2">Auth Type</th><th className="text-right py-2">Total</th><th className="text-right py-2">Migrated</th><th className="text-right py-2">%</th></tr></thead>
          <tbody>
            {stats.byType.map((t:any)=>(
              <tr key={t.auth_type} className="border-b">
                <td className="py-2 capitalize">{t.auth_type || 'unknown'}</td>
                <td className="text-right">{t.count}</td>
                <td className="text-right text-green-600">{t.migrated_count}</td>
                <td className="text-right">{((t.migrated_count / t.count) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

## 8) Tests

### `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: { baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI }
})
```

### `tests/auth-migration.spec.ts`

```ts
import { test, expect } from '@playwright/test'

test.describe('Auth Migration Flow', () => {
  test('requires CSRF', async ({ page }) => {
    const res = await page.request.post('/api/auth/login', { data: { email: 'a@b.com', password: 'x' } })
    expect(res.status()).toBe(403)
  })

  test('rate limiting enforced', async ({ page }) => {
    await page.goto('/sign-in')
    const csrf = await page.locator('input[name="csrf"]').inputValue()
    const posts = []
    for (let i=0;i<6;i++) posts.push(page.request.post('/api/auth/login', { headers:{'x-csrf':csrf}, data:{ email:`t${i}@x.com`, password:'wrong' } }))
    await Promise.all(posts)
    const res = await page.request.post('/api/auth/login', { headers:{'x-csrf':csrf}, data:{ email:'t@x.com', password:'wrong' } })
    expect(res.status()).toBe(429)
  })

  test('invalid credentials show message', async ({ page }) => {
    await page.goto('/sign-in')
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'Wrong!')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Invalid credentials')).toBeVisible()
  })
})
```

---

## 9) Environment file

### `.env.local` (example)

```bash
NEXT_PUBLIC_APP_URL=https://your-app.com

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

DUAL_AUTH_ENABLED=true
LOG_LEVEL=info
NODE_ENV=production
```

---

# 🚀 Launch Steps

1. **Run migrations** (via Supabase CLI or SQL editor) in order `001` → `008`.
2. **Build & test**

   ```
   npm run build
   npm run test:e2e
   ```
3. **Deploy** (Vercel or your platform).
4. **Prepopulate shells**

   ```
   ts-node scripts/prepopulate-users.ts
   ```
5. **Smoke test**: migrated user → Supabase-first; unmigrated user → lazy migrate → Supabase.
6. **Watch dashboard**; confirm metrics and alerts.
7. Optional: disable public signups for invite-only; send invites using Admin API `generateLink`.

---

If you want, I can tailor the invite-only flow (tokens + accept-invite page) or add SSO/SCIM notes.
