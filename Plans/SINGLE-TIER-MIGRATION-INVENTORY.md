# Single-Tier Architecture Migration Inventory
## Comprehensive Codebase Analysis for Zero-Downtime Migration

**Generated**: 2025-10-09
**Purpose**: Complete inventory for migrating from `public.users.clerk_id` to `auth.users.id` as single source of truth

---

## Executive Summary

PatmosLLM currently uses **Clerk authentication** with `public.users.clerk_id` as the primary user identifier throughout the application. This document provides a complete inventory of all tables, code references, and migration requirements for transitioning to **Supabase Auth** with `auth.users.id` as the single source of truth.

### Migration Scale
- **17 database tables** in production
- **13 tables** require `auth_user_id` column addition
- **5 core TypeScript files** with `clerk_id` queries
- **12+ API routes** referencing user identification
- **Estimated LOC Impact**: ~500 lines across 20+ files

---

## Part 1: Database Schema Analysis

### Tables Requiring auth_user_id Column

#### Primary User Table
**Table**: `users`
- **Current**: `clerk_id TEXT` (application-level user ID)
- **Action**: Add `auth_user_id UUID REFERENCES auth.users(id)`
- **Complexity**: HIGH (parent table for all user relationships)
- **Foreign Keys**: Referenced by 12+ child tables
- **RLS Policies**: Need complete rewrite for auth.jwt()

#### Child Tables with user_id Foreign Keys

1. **conversations** (560 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: Chat history tracking

2. **chat_sessions** (112 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: Session management

3. **user_context** (392 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: Topic familiarity & preferences (JSONB)

4. **conversation_memory** (264 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: Conversation analysis & satisfaction tracking

5. **topic_progression** (72 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: Learning progression & expertise tracking

6. **question_patterns** (56 kB)
   - Current: No direct user FK (global query patterns)
   - Action: No change required (aggregated data)

7. **user_onboarding_milestones** (136 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)` (inferred)
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: Onboarding progress tracking

8. **user_preferences** (32 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: User settings

9. **data_export_requests** (48 kB)
   - Current FK: `user_id UUID REFERENCES public.users(id)`
   - Action: Keep FK to `public.users.id`, add `auth_user_id` column
   - Child of: `users`
   - Usage: GDPR data export tracking

10. **idempotency_keys** (32 kB)
    - Current FK: `user_id UUID REFERENCES public.users(id)`
    - Action: Keep FK to `public.users.id`, add `auth_user_id` column
    - Child of: `users`
    - Usage: Duplicate request prevention

11. **privacy_audit_log** (32 kB)
    - Current FK: `user_id UUID REFERENCES public.users(id) ON DELETE SET NULL`
    - Action: Keep FK to `public.users.id`, add `auth_user_id` column
    - Child of: `users`
    - Usage: Privacy compliance audit trail

### Tables NOT Requiring auth_user_id

1. **documents** (15 MB)
   - Has: `uploaded_by UUID` (nullable, references users.id)
   - Reason: Indirect relationship via users table
   - Action: No schema change

2. **chunks** (24 MB)
   - Has: No user relationship
   - Reason: Related to documents, not users
   - Action: No schema change

3. **upload_sessions** (944 kB)
   - Has: `user_id UUID` (inferred FK to users)
   - Action: Add `auth_user_id` column

4. **ingest_jobs** (208 kB)
   - Has: No direct user relationship
   - Reason: System-level processing
   - Action: No schema change

5. **clerk_webhook_events** (40 kB)
   - Has: `clerk_user_id TEXT`
   - Action: Deprecate after migration, keep for audit

---

## Part 2: Code Reference Inventory

### Core Authentication Files

#### 1. `src/lib/auth.ts` (PRIMARY)
**Lines with clerk_id**: 18, 68, 80, 94
**Functions affected**:
- `getCurrentUser()` - Line 18: `.eq('clerk_id', userId)`
- `syncUserWithDatabase()` - Lines 68, 80, 94: Clerk ID checks

**Migration Impact**: HIGH
- All functions must support dual-read: check auth.users.id first, fallback to clerk_id
- Add feature flag for gradual cutover

#### 2. `src/lib/onboardingTracker.ts`
**Lines with clerk_id**: 37, 113
**Functions affected**:
- `trackOnboardingMilestone()` - Line 37: `.eq('clerk_id', clerkUserId)`
- `getOnboardingProgress()` - Line 113: `.eq('clerk_id', clerkUserId)`

**Migration Impact**: MEDIUM
- Update to use `auth_user_id` after cutover
- Dual-read during migration period

### API Routes Using clerk_id

#### 3. `src/app/api/auth/route.ts`
**Line 20**: `.eq('clerk_id', userId)`
**Purpose**: Fetch user data by Clerk ID
**Migration Impact**: HIGH
- Critical authentication flow
- Must support dual-read

#### 4. `src/app/api/scrape-website/route.ts`
**Line 1210**: `.eq('clerk_id', userId)`
**Purpose**: User verification for scraping operations
**Migration Impact**: LOW
- Single query update

#### 5. `src/app/api/admin/invite/route.ts`
**Lines**: 90, 113, 324, 424
**Purpose**:
- Line 90: Generate placeholder clerk_id for invited users
- Line 113: Track onboarding with placeholder clerk_id
- Line 324: Check if user is active (not invited_)
- Line 424: Check pending invitation status

**Migration Impact**: HIGH
- Invitation system needs redesign
- Placeholder IDs (`invited_${timestamp}`) must transition

#### 6. `src/app/api/admin/invite/resend/route.ts`
**Purpose**: Check pending invitation status
**Migration Impact**: MEDIUM

#### 7. `src/app/api/admin/system-health/route.ts`
**Purpose**: Filter active vs invited users
**Migration Impact**: LOW

### API Routes Using user_id (FK references)

#### 8. `src/app/api/chat/route.ts`
**Multiple lines**: User ID for conversations, sessions, memory
**Purpose**: Chat functionality with user context
**Migration Impact**: MEDIUM
- Uses `public.users.id` (UUID), not clerk_id
- After migration, verify `auth_user_id` matches

#### 9. `src/app/api/chat/sessions/route.ts`
**Purpose**: Session management per user
**Migration Impact**: LOW
- Uses `user_id` FK (already UUID)

#### 10. `src/app/api/admin/memory/route.ts`
**Purpose**: User memory context queries
**Migration Impact**: LOW
- Uses `user_id` FK

### Frontend Components

#### 11. `src/app/admin/users/page.tsx`
**Purpose**: User management UI
**Migration Impact**: LOW
- Display only, backend handles queries

#### 12. `src/components/OnboardingAnalyticsDashboard.tsx`
**Purpose**: Analytics dashboard
**Migration Impact**: LOW

---

## Part 3: Migration Mapping Strategy

### Mapping Table Schema

```sql
CREATE TABLE clerk_to_auth_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  migrated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clerk_to_auth_clerk ON clerk_to_auth_map(clerk_id);
CREATE INDEX idx_clerk_to_auth_auth ON clerk_to_auth_map(auth_user_id);
CREATE INDEX idx_clerk_to_auth_public ON clerk_to_auth_map(public_user_id);
```

### Backfill Strategy

**Step 1**: Create auth.users entries for all existing users
```sql
-- For each row in public.users:
INSERT INTO auth.users (
  id,  -- Generate new UUID or use public.users.id
  email,
  encrypted_password,  -- Set temporary password or use Clerk's
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
)
SELECT
  gen_random_uuid(),  -- or public.users.id if compatible
  email,
  crypt('temporary_password_' || id::text, gen_salt('bf')),  -- Temporary
  created_at,  -- Auto-confirm since they verified with Clerk
  created_at,
  updated_at,
  jsonb_build_object(
    'clerk_id', clerk_id,
    'migrated_from_clerk', true,
    'role', role,
    'name', name
  )
FROM public.users
WHERE clerk_id NOT LIKE 'invited_%'
  AND deleted_at IS NULL;
```

**Step 2**: Populate mapping table
```sql
INSERT INTO clerk_to_auth_map (clerk_id, auth_user_id, public_user_id)
SELECT
  pu.clerk_id,
  au.id AS auth_user_id,
  pu.id AS public_user_id
FROM public.users pu
INNER JOIN auth.users au ON au.email = pu.email
WHERE pu.clerk_id NOT LIKE 'invited_%'
  AND pu.deleted_at IS NULL;
```

**Step 3**: Add auth_user_id to public.users
```sql
ALTER TABLE public.users
ADD COLUMN auth_user_id UUID REFERENCES auth.users(id);

-- Backfill
UPDATE public.users pu
SET auth_user_id = ctam.auth_user_id
FROM clerk_to_auth_map ctam
WHERE pu.clerk_id = ctam.clerk_id;
```

---

## Part 4: Application Code Changes

### Pattern 1: Replace clerk_id Queries

**BEFORE**:
```typescript
const { data: user } = await supabaseAdmin
  .from('users')
  .select('*')
  .eq('clerk_id', userId)
  .single()
```

**AFTER (Dual-Read with Feature Flag)**:
```typescript
// Try auth_user_id first (migrated users)
let { data: user } = await supabaseAdmin
  .from('users')
  .select('*')
  .eq('auth_user_id', authUserId)
  .single()

// Fallback to clerk_id if DUAL_AUTH_ENABLED
if (!user && DUAL_AUTH_ENABLED) {
  ({ data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('clerk_id', clerkUserId)
    .single())
}
```

**AFTER (Post-Cutover - Single Source of Truth)**:
```typescript
const { data: user } = await supabaseAdmin
  .from('users')
  .select('*')
  .eq('auth_user_id', authUserId)
  .single()
```

### Pattern 2: Update Foreign Key Queries

**BEFORE**:
```typescript
const { data: sessions } = await supabaseAdmin
  .from('chat_sessions')
  .select('*')
  .eq('user_id', user.id)  // Uses public.users.id
```

**AFTER (No Change Required)**:
```typescript
// user.id already refers to public.users.id (UUID)
// After migration, verify auth_user_id matches:
const { data: sessions } = await supabaseAdmin
  .from('chat_sessions')
  .select('*')
  .eq('user_id', user.id)  // Still valid
```

### Pattern 3: Invitation System Refactor

**BEFORE**:
```typescript
clerk_id: `invited_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
```

**AFTER**:
```typescript
// Create auth.users entry immediately with pending status
const { data: authUser } = await supabaseAdmin.auth.admin.createUser({
  email: inviteEmail,
  email_confirm: false,  // Require email confirmation
  user_metadata: {
    invitation_pending: true,
    invited_by: adminUserId,
    role: role
  }
})

// Link to public.users
const { data: publicUser } = await supabaseAdmin
  .from('users')
  .insert({
    email: inviteEmail,
    auth_user_id: authUser.user.id,
    role: role,
    invited_by: adminUserId
  })
```

---

## Part 5: Testing Requirements

### Unit Tests

1. **Mapping Logic** (`tests/unit/auth-mapping.test.ts`)
   - Test clerk_id → auth_user_id lookup
   - Test dual-read fallback
   - Test feature flag behavior

2. **Query Pattern Updates** (`tests/unit/user-queries.test.ts`)
   - Test all `.eq('clerk_id')` → `.eq('auth_user_id')` replacements
   - Mock Supabase responses

### Integration Tests

1. **Auth Flow** (`tests/integration/auth-migration.test.ts`)
   - Test login with Clerk (before migration)
   - Test login with Supabase (after migration)
   - Test dual-auth compatibility

2. **Invitation System** (`tests/integration/invite-system.test.ts`)
   - Test invite creation with auth.users
   - Test invite acceptance flow
   - Test pending invitation status

### E2E Tests

1. **User Login** (`tests/e2e/auth.spec.ts`)
   - Test existing user login (Clerk → Supabase)
   - Test new user signup (Supabase only)
   - Test session persistence

2. **Admin Operations** (`tests/e2e/admin-users.spec.ts`)
   - Test user invitation
   - Test user deletion
   - Test role assignment

---

## Part 6: Zero-Downtime Migration Steps

### Day 1-2: Schema Preparation (Additive Only)

**Migration 001: Add auth_user_id Columns**
- Add `auth_user_id UUID` to 13 tables
- NO NOT NULL constraints yet
- NO foreign keys yet

**Migration 002: Create Mapping Table**
- Create `clerk_to_auth_map`
- Create indexes

**Migration 003: Backfill auth.users**
- Populate auth.users with existing Clerk users
- Populate mapping table

### Day 3: Compatibility Layer

**Migration 004: Add Foreign Keys (NOT VALID)**
- Add FK constraints with `NOT VALID`
- Run `VALIDATE CONSTRAINT` separately (no locks)

**Migration 005: Dual-Read Views**
- Create views for dual-read compatibility
- Triggers to keep mapping in sync

### Day 4: Application Cutover

**Deploy 1**: Enable dual-auth feature flag
- Update `src/lib/auth.ts` with dual-read logic
- Update all API routes with fallback pattern
- Monitor error rates

**Deploy 2**: Flip feature flag to prefer auth_user_id
- Update queries to try `auth_user_id` first
- Fallback to `clerk_id` only if not found

### Day 5: Enforce Single-Tier

**Migration 006: NOT NULL Constraints**
- Add NOT NULL to `auth_user_id` columns
- Verify all rows have values

**Migration 007: Drop clerk_id (Deferred)**
- Rename `clerk_id` to `clerk_id_deprecated`
- Schedule final drop for Week 2

### Week 2: Cleanup

**Migration 008: Final Cleanup**
- Drop `clerk_id_deprecated` columns
- Drop compatibility views/triggers
- Drop `clerk_to_auth_map` (after verification period)

---

## Part 7: Rollback Strategy

### Emergency Rollback (if critical failure)

1. **Disable Dual-Auth Flag**
   ```bash
   # Set in Vercel environment
   DUAL_AUTH_ENABLED=false
   ```

2. **Revert to Clerk-Only**
   - Redeploy previous version
   - All queries fallback to `clerk_id`
   - No schema changes needed (additive migrations safe)

### Gradual Rollback (if Supabase issues)

1. **Keep Dual-Auth Enabled**
   - Switch primary source back to Clerk
   - Supabase as backup

2. **Investigate and Fix**
   - Review `migration_alerts` table
   - Fix auth.users data issues
   - Retry cutover

---

## Part 8: Monitoring & Alerts

### Critical Metrics

1. **Migration Progress**
   - % users with `auth_user_id` populated
   - % logins using Supabase vs Clerk
   - Target: 95% Supabase within 7 days

2. **Error Rates**
   - Auth failures by source (Clerk vs Supabase)
   - Dual-read fallback rate
   - Alert: >5% error rate

3. **Performance**
   - Auth latency P50/P95/P99
   - Baseline: <200ms
   - Alert: >500ms P95

### Sentry Integration

```typescript
// Add context to all auth operations
Sentry.setContext('auth_migration', {
  source: 'supabase' | 'clerk',
  dual_auth_enabled: DUAL_AUTH_ENABLED,
  user_migrated: !!user.auth_user_id
})
```

---

## Part 9: Success Criteria

Migration is **COMPLETE** when:
- [ ] 100% users have `auth_user_id` populated
- [ ] 95%+ logins use Supabase Auth (not Clerk fallback)
- [ ] Auth error rate <1%
- [ ] All E2E tests passing
- [ ] Zero user-reported auth issues
- [ ] Can safely disable Clerk ($0 cost savings)

---

## Appendix A: File Change Checklist

### TypeScript Files Requiring Updates

- [ ] `src/lib/auth.ts` (PRIMARY - 4 locations)
- [ ] `src/lib/onboardingTracker.ts` (2 locations)
- [ ] `src/app/api/auth/route.ts` (1 location)
- [ ] `src/app/api/scrape-website/route.ts` (1 location)
- [ ] `src/app/api/admin/invite/route.ts` (4 locations)
- [ ] `src/app/api/admin/invite/resend/route.ts` (1 location)
- [ ] `src/app/api/admin/system-health/route.ts` (1 location)
- [ ] `src/middleware.ts` (Add Supabase Auth check)

### SQL Migration Files to Create

- [ ] `001_add_auth_user_id_columns.sql`
- [ ] `002_create_mapping_table.sql`
- [ ] `003_backfill_auth_users.sql`
- [ ] `004_add_foreign_keys_not_valid.sql`
- [ ] `005_dual_read_compatibility_layer.sql`
- [ ] `006_enforce_not_null.sql`
- [ ] `007_update_rls_policies.sql`
- [ ] `008_cleanup.sql`

### Test Files to Create

- [ ] `tests/unit/auth-mapping.test.ts`
- [ ] `tests/unit/user-queries.test.ts`
- [ ] `tests/integration/auth-migration.test.ts`
- [ ] `tests/integration/invite-system.test.ts`
- [ ] `tests/e2e/auth.spec.ts`
- [ ] `tests/e2e/admin-users.spec.ts`

---

## Appendix B: Database Table Sizes (Current Production)

| Table | Size | Rows (est) | Priority for Migration |
|-------|------|------------|------------------------|
| chunks | 24 MB | 7,956+ | No change |
| documents | 15 MB | 462 | No change |
| upload_sessions | 944 kB | ~100 | Add auth_user_id |
| conversations | 560 kB | ~1,000 | Add auth_user_id |
| user_context | 392 kB | ~50 | Add auth_user_id |
| conversation_memory | 264 kB | ~500 | Add auth_user_id |
| users | 256 kB | ~50 | **PRIMARY** |
| ingest_jobs | 208 kB | ~500 | No change |
| user_onboarding_milestones | 136 kB | ~200 | Add auth_user_id |
| chat_sessions | 112 kB | ~100 | Add auth_user_id |
| topic_progression | 72 kB | ~100 | Add auth_user_id |
| question_patterns | 56 kB | Global | No change |
| data_export_requests | 48 kB | ~10 | Add auth_user_id |
| clerk_webhook_events | 40 kB | ~100 | Deprecate |
| idempotency_keys | 32 kB | ~50 | Add auth_user_id |
| user_preferences | 32 kB | ~50 | Add auth_user_id |
| privacy_audit_log | 32 kB | ~100 | Add auth_user_id |

---

*This inventory serves as the foundation for the updated implementation plan with single-tier zero-downtime migration strategy.*
