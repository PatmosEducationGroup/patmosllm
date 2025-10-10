-- ============================================================================
-- MIGRATION 005: Enforce Single-Tier Architecture
-- ============================================================================
-- Purpose: Make auth_user_id mandatory after 100% migration complete
-- Prerequisites: All users must have auth_user_id populated (verify first!)
-- Timing: Run on Day 5 AFTER feature flag flipped and 95%+ users migrated
-- Rollback: Remove NOT NULL constraints if needed
-- ============================================================================

-- ============================================================================
-- CRITICAL PRE-FLIGHT CHECKS
-- ============================================================================

-- 1. Verify 100% of active users have auth_user_id
DO $$
DECLARE
  v_total_users INTEGER;
  v_migrated_users INTEGER;
  v_unmigrated_users INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE NOT clerk_id LIKE 'invited_%'),
    COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL AND NOT clerk_id LIKE 'invited_%'),
    COUNT(*) FILTER (WHERE auth_user_id IS NULL AND NOT clerk_id LIKE 'invited_%')
  INTO v_total_users, v_migrated_users, v_unmigrated_users
  FROM public.users
  WHERE deleted_at IS NULL;

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'PRE-FLIGHT CHECK: User Migration Status';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Total active users: %', v_total_users;
  RAISE NOTICE 'Migrated users: % (%% complete)', v_migrated_users,
    ROUND((v_migrated_users::NUMERIC / NULLIF(v_total_users, 0)) * 100, 2);
  RAISE NOTICE 'Unmigrated users: %', v_unmigrated_users;
  RAISE NOTICE '==========================================';

  IF v_unmigrated_users > 0 THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: % users still missing auth_user_id. Run Migration 002 backfill first!',
      v_unmigrated_users;
  END IF;

  RAISE NOTICE '✓ All users have auth_user_id. Safe to proceed.';
END $$;

-- 2. Check for orphaned auth_user_id values (should be 0)
DO $$
DECLARE
  v_orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_count
  FROM public.users u
  LEFT JOIN auth.users au ON u.auth_user_id = au.id
  WHERE u.auth_user_id IS NOT NULL
    AND au.id IS NULL;

  IF v_orphaned_count > 0 THEN
    RAISE EXCEPTION 'ORPHANED DATA: % users have invalid auth_user_id references. Fix data integrity first!',
      v_orphaned_count;
  END IF;

  RAISE NOTICE '✓ No orphaned auth_user_id values found.';
END $$;

-- 3. List any users still needing migration (for manual intervention)
SELECT
  id,
  email,
  clerk_id,
  role,
  created_at,
  'NEEDS MIGRATION' AS status
FROM public.users
WHERE auth_user_id IS NULL
  AND NOT clerk_id LIKE 'invited_%'
  AND deleted_at IS NULL
ORDER BY created_at ASC;

-- If any rows returned, DO NOT proceed with this migration!

-- ============================================================================
-- STEP 1: Add NOT NULL Constraints to Primary Table
-- ============================================================================

-- Enforce auth_user_id on users table
ALTER TABLE public.users
  ALTER COLUMN auth_user_id SET NOT NULL;

COMMENT ON COLUMN public.users.auth_user_id IS 'PRIMARY: auth.users.id is now single source of truth (NOT NULL enforced)';

-- ============================================================================
-- STEP 2: Add NOT NULL Constraints to Child Tables
-- ============================================================================
-- Only enforce NOT NULL where relationships are mandatory
-- Some tables may allow NULL if user can be deleted

-- conversations: Require auth_user_id (user must exist for conversations)
ALTER TABLE public.conversations
  ALTER COLUMN auth_user_id SET NOT NULL;

-- chat_sessions: Require auth_user_id (user must exist for sessions)
ALTER TABLE public.chat_sessions
  ALTER COLUMN auth_user_id SET NOT NULL;

-- user_context: Require auth_user_id (1:1 relationship with user)
ALTER TABLE public.user_context
  ALTER COLUMN auth_user_id SET NOT NULL;

-- conversation_memory: Require auth_user_id (user must exist for memory)
ALTER TABLE public.conversation_memory
  ALTER COLUMN auth_user_id SET NOT NULL;

-- topic_progression: Require auth_user_id (user must exist for progression)
ALTER TABLE public.topic_progression
  ALTER COLUMN auth_user_id SET NOT NULL;

-- user_onboarding_milestones: Require auth_user_id (user must exist for milestones)
ALTER TABLE public.user_onboarding_milestones
  ALTER COLUMN auth_user_id SET NOT NULL;

-- user_preferences: Require auth_user_id (user must exist for preferences)
ALTER TABLE public.user_preferences
  ALTER COLUMN auth_user_id SET NOT NULL;

-- data_export_requests: Require auth_user_id (user must exist for export)
ALTER TABLE public.data_export_requests
  ALTER COLUMN auth_user_id SET NOT NULL;

-- idempotency_keys: Require auth_user_id (user must exist for deduplication)
ALTER TABLE public.idempotency_keys
  ALTER COLUMN auth_user_id SET NOT NULL;

-- privacy_audit_log: Keep nullable (audit trail persists after user deletion)
-- ALTER TABLE public.privacy_audit_log
--   ALTER COLUMN auth_user_id SET NOT NULL;
COMMENT ON COLUMN public.privacy_audit_log.auth_user_id IS 'Nullable for audit trail persistence after user deletion';

-- upload_sessions: Require auth_user_id (user must exist for uploads)
ALTER TABLE public.upload_sessions
  ALTER COLUMN auth_user_id SET NOT NULL;

-- ============================================================================
-- STEP 3: Rename clerk_id to clerk_id_deprecated
-- ============================================================================
-- Keep clerk_id for audit trail but signal it's no longer primary identifier

ALTER TABLE public.users
  RENAME COLUMN clerk_id TO clerk_id_deprecated;

-- Update column comment
COMMENT ON COLUMN public.users.clerk_id_deprecated IS 'DEPRECATED: Legacy Clerk ID for audit trail only. Use auth_user_id.';

-- Drop unique index on clerk_id (if exists)
DROP INDEX IF EXISTS idx_users_clerk_id;

-- Create regular index for audit queries (not unique)
CREATE INDEX IF NOT EXISTS idx_users_clerk_id_deprecated
  ON public.users(clerk_id_deprecated)
  WHERE clerk_id_deprecated IS NOT NULL;

-- ============================================================================
-- STEP 4: Update User Type in Application (Documentation)
-- ============================================================================
-- This is a code change, not a migration
-- Document required change to src/lib/types.ts:

/*
// BEFORE:
export interface User {
  id: string
  clerk_id: string  // ← Remove
  email: string
  // ...
}

// AFTER:
export interface User {
  id: string
  auth_user_id: string  // ← Add (UUID from auth.users.id)
  clerk_id_deprecated?: string  // ← Make optional for legacy data
  email: string
  // ...
}
*/

-- ============================================================================
-- STEP 5: Create Migration Completion Marker
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.migration_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone TEXT UNIQUE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB
);

INSERT INTO public.migration_milestones (milestone, metadata)
VALUES (
  'single_tier_enforced',
  jsonb_build_object(
    'migration_date', now(),
    'auth_user_id_not_null', true,
    'clerk_id_deprecated', true,
    'total_users_migrated', (
      SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL
    )
  )
)
ON CONFLICT (milestone) DO UPDATE
  SET completed_at = now(),
      metadata = EXCLUDED.metadata;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 1. Verify NOT NULL constraints are in place
SELECT
  table_name,
  column_name,
  is_nullable,
  CASE
    WHEN is_nullable = 'NO' THEN '✓ NOT NULL enforced'
    ELSE '⚠ Still nullable'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'auth_user_id'
  AND table_name IN (
    'users', 'conversations', 'chat_sessions', 'user_context',
    'conversation_memory', 'topic_progression', 'user_onboarding_milestones',
    'user_preferences', 'data_export_requests', 'idempotency_keys',
    'upload_sessions'
  )
ORDER BY table_name;

-- Expected: All should show 'NOT NULL enforced' except privacy_audit_log

-- 2. Verify clerk_id was renamed
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('clerk_id', 'clerk_id_deprecated', 'auth_user_id')
ORDER BY column_name;

-- Expected:
-- - clerk_id_deprecated (text, YES)
-- - auth_user_id (uuid, NO)
-- - clerk_id should NOT exist

-- 3. Check migration milestone
SELECT * FROM public.migration_milestones
WHERE milestone = 'single_tier_enforced';

-- 4. Final migration metrics
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) AS users_with_auth_id,
  COUNT(*) FILTER (WHERE clerk_id_deprecated LIKE 'invited_%') AS pending_invitations,
  ROUND(
    (COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS migration_percentage
FROM public.users
WHERE deleted_at IS NULL;

-- Expected: 100% migration_percentage

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
/*
-- WARNING: This reverts single-tier enforcement
-- Run if you need to re-enable dual-tier (e.g., rollback to Clerk)

-- 1. Remove NOT NULL constraints
ALTER TABLE public.users ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.chat_sessions ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.user_context ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.conversation_memory ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.topic_progression ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.user_onboarding_milestones ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.user_preferences ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.data_export_requests ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.idempotency_keys ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.upload_sessions ALTER COLUMN auth_user_id DROP NOT NULL;

-- 2. Restore clerk_id column name
ALTER TABLE public.users RENAME COLUMN clerk_id_deprecated TO clerk_id;

-- 3. Restore unique index on clerk_id
CREATE UNIQUE INDEX idx_users_clerk_id ON public.users(clerk_id);
DROP INDEX IF EXISTS idx_users_clerk_id_deprecated;

-- 4. Update migration milestone
UPDATE public.migration_milestones
SET metadata = jsonb_set(metadata, '{rolled_back}', 'true'::jsonb)
WHERE milestone = 'single_tier_enforced';
*/

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. CRITICAL: Verify 100% migration complete before running
-- 2. Run verification queries FIRST to check pre-flight conditions
-- 3. If any users missing auth_user_id, DO NOT PROCEED
-- 4. Deploy application code updates BEFORE running this migration:
--    - Update src/lib/types.ts (User interface)
--    - Remove all .eq('clerk_id') queries
--    - Use auth_user_id everywhere
-- 5. Monitor error rates for 24 hours after deployment
-- 6. Proceed to Migration 006 to update RLS policies
-- ============================================================================
