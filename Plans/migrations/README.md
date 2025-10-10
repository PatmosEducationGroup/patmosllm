# SQL Migrations for Single-Tier Auth Migration
## Clerk → Supabase Auth Zero-Downtime Migration

**Last Updated**: 2025-10-09
**Total Migrations**: 7 files
**Estimated Total Runtime**: 15-30 minutes (depends on data volume)

---

## Overview

This directory contains **production-ready SQL migration files** for migrating PatmosLLM from Clerk authentication to Supabase Auth using a zero-downtime, single-tier architecture.

**Key Principle**: Each migration is designed to be **additive and safe**, with no breaking changes until the final enforcement step.

---

## Migration Files

### Week 1: Database Preparation

#### 001_add_auth_user_id_columns.sql
**Purpose**: Add nullable `auth_user_id UUID` columns to 13 tables
**Runtime**: <1 minute
**Risk**: Minimal (additive only, no data changes)
**Rollback**: Safe (can drop columns, no data loss)

**What it does**:
- Adds `auth_user_id UUID` to: users, conversations, chat_sessions, user_context, conversation_memory, topic_progression, user_onboarding_milestones, user_preferences, data_export_requests, idempotency_keys, privacy_audit_log, upload_sessions
- All columns are nullable (no constraints yet)
- No application changes required

**Verification**:
```sql
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE column_name = 'auth_user_id' AND table_schema = 'public'
ORDER BY table_name;
-- Expected: 13 rows, all nullable = 'YES'
```

---

#### 002_mapping_and_backfill.sql
**Purpose**: Create mapping table and populate `auth.users` with existing Clerk users
**Runtime**: 5-10 minutes for ~50 users
**Risk**: Low (background process, no app impact)
**Rollback**: Can drop tables and clear auth_user_id columns

**What it does**:
1. Creates `clerk_to_auth_map` table for Clerk ID → auth.users.id mapping
2. Creates helper functions:
   - `backfill_auth_user(user_id)` - Migrate single user
   - `backfill_all_auth_users()` - Batch migrate all users
3. Populates `auth.users` with entries for all existing Clerk users
4. Backfills `auth_user_id` in all 13 tables via JOIN to users table

**Critical Functions**:
- `backfill_auth_user()`: Creates auth.users entry with temporary password
- Auto-confirms email (users already verified with Clerk)
- Populates mapping table for audit trail

**Verification**:
```sql
-- Check mapping table
SELECT COUNT(*) FROM clerk_to_auth_map;
-- Expected: ~50 rows (one per active user)

-- Check backfill completion
SELECT
  COUNT(*) AS total,
  COUNT(auth_user_id) AS backfilled,
  ROUND((COUNT(auth_user_id)::NUMERIC / COUNT(*)) * 100, 2) AS percentage
FROM users
WHERE deleted_at IS NULL AND clerk_id NOT LIKE 'invited_%';
-- Expected: 100% backfilled
```

---

### Week 1-2: Add Constraints

#### 003_constraints_not_valid_then_validate.sql
**Purpose**: Add foreign key constraints without locking tables
**Runtime**: <1 minute (uses zero-downtime pattern)
**Risk**: Low (allows concurrent writes during validation)
**Rollback**: Can drop constraints immediately

**What it does**:
1. Adds FK constraints with `NOT VALID` (skips existing row validation)
2. Runs `VALIDATE CONSTRAINT` separately (allows concurrent writes)
3. Links all `auth_user_id` columns to `auth.users(id)` with CASCADE delete rules

**Zero-Downtime Pattern**:
```sql
-- Traditional (BLOCKS writes):
ALTER TABLE foo ADD CONSTRAINT fk FOREIGN KEY (col) REFERENCES bar(id);

-- Zero-downtime (ALLOWS writes):
ALTER TABLE foo ADD CONSTRAINT fk FOREIGN KEY (col) REFERENCES bar(id) NOT VALID;
ALTER TABLE foo VALIDATE CONSTRAINT fk;  -- Non-blocking validation
```

**Verification**:
```sql
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  convalidated AS is_validated
FROM pg_constraint
WHERE contype = 'f' AND conname LIKE '%auth_user_id%'
ORDER BY table_name;
-- Expected: All constraints validated = true
```

---

### Week 2: Compatibility Layer

#### 004_compat_layer.sql
**Purpose**: Create temporary dual-read infrastructure for gradual cutover
**Runtime**: <1 minute
**Risk**: Low (helper functions only, no schema changes)
**Rollback**: Can drop functions/views immediately

**What it does**:
1. **Helper Functions**:
   - `get_user_by_auth_or_clerk()` - Dual-read lookup function
   - `find_user_for_auth()` - JSON-based dual-read for application
2. **Migration Tracking**:
   - `migration_events` table for audit trail
   - Trigger to log when users get `auth_user_id` populated
3. **Admin Views**:
   - `v_user_migration_status` - Real-time migration progress per user
   - `v_migration_metrics` - High-level metrics (% migrated)
4. **Sync Triggers**:
   - Log warnings if `clerk_id` changes (potential stale data)

**Usage in Application Code**:
```sql
-- Dual-read lookup (returns first match)
SELECT * FROM get_user_by_auth_or_clerk(
  p_auth_user_id := 'uuid-here',  -- Try this first
  p_clerk_id := 'clerk-id-here'   -- Fallback
);
```

**Verification**:
```sql
-- Check migration progress
SELECT * FROM v_migration_metrics;

-- View per-user status
SELECT * FROM v_user_migration_status
WHERE migration_status = 'needs_migration';
-- Expected: 0 rows (all users migrated)
```

---

### Week 2-3: Enforcement

#### 005_enforce_single_tier.sql
**Purpose**: Make `auth_user_id` mandatory and deprecate `clerk_id`
**Runtime**: <1 minute
**Risk**: HIGH (breaking change if unmigrated users exist)
**Rollback**: Remove NOT NULL constraints, restore clerk_id name

**CRITICAL PRE-FLIGHT CHECKS**:
```sql
-- Verify 100% users have auth_user_id
SELECT COUNT(*) FROM users
WHERE auth_user_id IS NULL
  AND clerk_id NOT LIKE 'invited_%'
  AND deleted_at IS NULL;
-- MUST return 0 before proceeding!
```

**What it does**:
1. Adds NOT NULL constraints to `auth_user_id` on 12 tables (11 enforced, 1 nullable for audit)
2. Renames `clerk_id` → `clerk_id_deprecated` (keeps for audit trail)
3. Drops unique index on `clerk_id_deprecated`
4. Creates migration milestone marker

**Point of No Return**:
After this migration, application MUST use `auth_user_id` everywhere. Clerk fallback will no longer work.

**Verification**:
```sql
-- Verify NOT NULL enforced
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE column_name = 'auth_user_id'
  AND table_name IN ('users', 'conversations', 'chat_sessions')
ORDER BY table_name;
-- Expected: is_nullable = 'NO' for all

-- Verify clerk_id renamed
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name LIKE '%clerk%';
-- Expected: Only 'clerk_id_deprecated' exists
```

---

#### 006_rls_policies_update.sql
**Purpose**: Rewrite Row Level Security policies for Supabase Auth
**Runtime**: <1 minute
**Risk**: Medium (security policies change)
**Rollback**: Disable RLS temporarily while fixing

**What it does**:
1. Drops old RLS policies (Clerk JWT-based)
2. Creates new RLS policies using `auth.uid()` (native Supabase Auth)
3. Updates policies for: users, conversations, chat_sessions, user_context, conversation_memory, topic_progression, user_preferences, data_export_requests, privacy_audit_log, documents

**Old Pattern (Clerk)**:
```sql
CREATE POLICY "Users view own" ON conversations
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt()->>'sub'
    )
  );
```

**New Pattern (Supabase)**:
```sql
CREATE POLICY "Users view own" ON conversations
  FOR SELECT
  USING (auth_user_id = auth.uid());
```

**Verification**:
```sql
-- List all RLS policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'conversations', 'chat_sessions')
ORDER BY tablename, policyname;

-- Test policy (run as authenticated user)
SELECT id, email FROM users WHERE deleted_at IS NULL;
-- Should only return current user's data
```

---

### Week 4+: Cleanup

#### 007_final_cleanup.sql
**Purpose**: Remove temporary migration infrastructure
**Runtime**: <1 minute
**Risk**: Low (migration complete, just cleanup)
**Rollback**: Re-run 004_compat_layer.sql

**CRITICAL: DO NOT RUN UNTIL**:
- [ ] 2+ weeks of stable operation
- [ ] Zero auth errors
- [ ] 100% users migrated
- [ ] Team approval
- [ ] Database backup completed

**What it does**:
1. Drops dual-read helper functions
2. Drops migration tracking views
3. Drops migration event triggers
4. Optionally archives `migration_events` table
5. Runs VACUUM FULL to reclaim space

**What to KEEP for 6 months**:
- `clerk_to_auth_map` table (audit trail)
- `clerk_id_deprecated` column (audit trail)
- `migration_events` table (historical log)

**Final Cleanup (Month 6+)**:
```sql
-- After 6 months, run:
DROP TABLE clerk_to_auth_map CASCADE;
ALTER TABLE users DROP COLUMN clerk_id_deprecated;
DROP TABLE migration_events CASCADE;
```

**Verification**:
```sql
-- Check remaining migration objects
SELECT 'view' AS type, viewname AS name
FROM pg_views
WHERE schemaname = 'public' AND viewname LIKE '%migration%'
UNION ALL
SELECT 'function', proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE '%migration%';
-- Expected: No views/functions (all dropped)
```

---

## Execution Order

**CRITICAL**: Run migrations in exact numerical order!

```bash
# Week 1: Database Preparation
psql -d patmosllm -f 001_add_auth_user_id_columns.sql
psql -d patmosllm -f 002_mapping_and_backfill.sql

# Week 2: Constraints + Compat Layer
psql -d patmosllm -f 003_constraints_not_valid_then_validate.sql
psql -d patmosllm -f 004_compat_layer.sql

# Week 2-3: Enforcement (AFTER app code deployed)
psql -d patmosllm -f 005_enforce_single_tier.sql
psql -d patmosllm -f 006_rls_policies_update.sql

# Week 4+: Cleanup (AFTER 2+ weeks stable)
psql -d patmosllm -f 007_final_cleanup.sql
```

---

## Rollback Procedures

Each migration file includes a commented `ROLLBACK SCRIPT` section at the bottom. To rollback:

```sql
-- Example: Rollback Migration 005
/*
ALTER TABLE users ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE users RENAME COLUMN clerk_id_deprecated TO clerk_id;
CREATE UNIQUE INDEX idx_users_clerk_id ON users(clerk_id);
*/
```

**Emergency Rollback (Complete Revert)**:
1. Run rollback scripts in REVERSE order (007 → 006 → ... → 001)
2. Restore from database backup if needed
3. Redeploy Clerk-based application code

---

## Verification Queries

### Check Overall Migration Status
```sql
SELECT
  milestone,
  completed_at,
  metadata
FROM migration_milestones
ORDER BY completed_at DESC;
```

### Check User Migration Progress
```sql
SELECT * FROM v_migration_metrics;
-- Expected after backfill: 100% migration_percentage
```

### Check All Foreign Keys
```sql
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  confrelid::regclass AS references,
  convalidated AS is_valid
FROM pg_constraint
WHERE contype = 'f' AND conname LIKE '%auth_user_id%'
ORDER BY table_name;
```

### Check RLS Policies
```sql
SELECT
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
```

---

## Performance Considerations

### Connection Pooling
PatmosLLM already uses connection pooling (25 max connections). No changes needed.

### Index Strategy
All `auth_user_id` columns are indexed via foreign key constraints. Additional indexes created:
- `idx_clerk_to_auth_clerk` on `clerk_to_auth_map(clerk_id)`
- `idx_clerk_to_auth_auth` on `clerk_to_auth_map(auth_user_id)`
- `idx_migration_events_created_at` on `migration_events(created_at DESC)`

### Query Performance
Expected auth query performance:
- **Before**: `.eq('clerk_id', 'xxx')` → 10-50ms (indexed)
- **After**: `.eq('auth_user_id', 'uuid')` → 5-20ms (UUID primary key, faster)

---

## Troubleshooting

### Issue: Backfill fails for some users
**Symptom**: `backfill_all_auth_users()` returns errors for certain users
**Diagnosis**:
```sql
SELECT * FROM backfill_all_auth_users()
WHERE success = false;
```
**Solution**:
- Check if users have valid email addresses
- Verify no duplicate emails in `public.users`
- Manually backfill problem users: `SELECT backfill_auth_user('user-uuid-here')`

### Issue: Constraint validation fails
**Symptom**: `VALIDATE CONSTRAINT` returns foreign key violation error
**Diagnosis**:
```sql
SELECT u.id, u.auth_user_id, u.email
FROM users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
WHERE u.auth_user_id IS NOT NULL AND au.id IS NULL;
```
**Solution**:
- Re-run backfill for orphaned users
- Check if auth.users entries were accidentally deleted

### Issue: RLS policies block legitimate access
**Symptom**: Users can't access own data after Migration 006
**Diagnosis**:
```sql
-- Check if auth.uid() returns correct value
SELECT auth.uid();  -- Should return UUID of current user
```
**Solution**:
- Verify Supabase Auth session is valid
- Check if `auth_user_id` matches `auth.uid()`
- Temporarily disable RLS for debugging: `ALTER TABLE foo DISABLE ROW LEVEL SECURITY;`

---

## Success Checklist

Before marking migration complete, verify:
- [ ] All 7 migrations executed successfully
- [ ] All verification queries return expected results
- [ ] 100% users have `auth_user_id` populated
- [ ] No orphaned `auth_user_id` values
- [ ] All FK constraints validated
- [ ] RLS policies working correctly
- [ ] Application code updated to use `auth_user_id`
- [ ] Zero auth errors for 7 consecutive days
- [ ] Performance metrics acceptable (P95 <200ms)

---

## Support & Resources

- **Migration Guide**: [../MIGRATION-EXECUTIVE-SUMMARY.md](../MIGRATION-EXECUTIVE-SUMMARY.md)
- **Code Changes**: [../APP-CODE-CHANGES-GUIDE.md](../APP-CODE-CHANGES-GUIDE.md)
- **Inventory**: [../SINGLE-TIER-MIGRATION-INVENTORY.md](../SINGLE-TIER-MIGRATION-INVENTORY.md)
- **Full Plan**: [../lazy-migration-implementation-plan.md](../lazy-migration-implementation-plan.md)

---

*Generated by Claude Code (Sonnet 4.5) on 2025-10-09*
