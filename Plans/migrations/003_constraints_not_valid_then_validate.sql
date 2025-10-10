-- ============================================================================
-- MIGRATION 003: Add Foreign Key Constraints (NOT VALID + VALIDATE)
-- ============================================================================
-- Purpose: Add FK constraints without locking tables for writes
-- Strategy: Use NOT VALID to skip existing row validation, then VALIDATE separately
-- Why: VALIDATE CONSTRAINT acquires ShareUpdateExclusiveLock (allows reads/writes)
--      ADD CONSTRAINT alone would require full table lock
-- Estimated Time: <1 minute (no existing data validation during ADD)
-- ============================================================================

-- ============================================================================
-- IMPORTANT: PostgreSQL Constraint Validation Strategy
-- ============================================================================
--
-- Traditional approach (BLOCKS writes during validation):
-- ALTER TABLE foo ADD CONSTRAINT fk FOREIGN KEY (col) REFERENCES bar(id);
-- ↑ This validates ALL existing rows immediately with exclusive lock
--
-- Zero-downtime approach (allows writes during validation):
-- 1. ADD CONSTRAINT ... NOT VALID  -- Only checks NEW rows, fast
-- 2. VALIDATE CONSTRAINT           -- Checks existing rows, allows concurrent writes
-- ============================================================================

-- ============================================================================
-- STEP 1: Add Foreign Keys to Mapping Table (NOT VALID)
-- ============================================================================

-- FK: clerk_to_auth_map.auth_user_id → auth.users.id
ALTER TABLE public.clerk_to_auth_map
ADD CONSTRAINT fk_clerk_to_auth_map_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: clerk_to_auth_map.public_user_id → public.users.id
ALTER TABLE public.clerk_to_auth_map
ADD CONSTRAINT fk_clerk_to_auth_map_public_user_id
  FOREIGN KEY (public_user_id)
  REFERENCES public.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- ============================================================================
-- STEP 2: Add Foreign Keys to public.users (NOT VALID)
-- ============================================================================

-- FK: users.auth_user_id → auth.users.id
ALTER TABLE public.users
ADD CONSTRAINT fk_users_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE RESTRICT  -- Prevent accidental auth.users deletion
  NOT VALID;

-- ============================================================================
-- STEP 3: Add Foreign Keys to Child Tables (NOT VALID)
-- ============================================================================

-- FK: conversations.auth_user_id → auth.users.id
ALTER TABLE public.conversations
ADD CONSTRAINT fk_conversations_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: chat_sessions.auth_user_id → auth.users.id
ALTER TABLE public.chat_sessions
ADD CONSTRAINT fk_chat_sessions_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: user_context.auth_user_id → auth.users.id
ALTER TABLE public.user_context
ADD CONSTRAINT fk_user_context_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: conversation_memory.auth_user_id → auth.users.id
ALTER TABLE public.conversation_memory
ADD CONSTRAINT fk_conversation_memory_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: topic_progression.auth_user_id → auth.users.id
ALTER TABLE public.topic_progression
ADD CONSTRAINT fk_topic_progression_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: user_onboarding_milestones.auth_user_id → auth.users.id
ALTER TABLE public.user_onboarding_milestones
ADD CONSTRAINT fk_user_onboarding_milestones_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: user_preferences.auth_user_id → auth.users.id
ALTER TABLE public.user_preferences
ADD CONSTRAINT fk_user_preferences_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: data_export_requests.auth_user_id → auth.users.id
ALTER TABLE public.data_export_requests
ADD CONSTRAINT fk_data_export_requests_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: idempotency_keys.auth_user_id → auth.users.id
ALTER TABLE public.idempotency_keys
ADD CONSTRAINT fk_idempotency_keys_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- FK: privacy_audit_log.auth_user_id → auth.users.id
ALTER TABLE public.privacy_audit_log
ADD CONSTRAINT fk_privacy_audit_log_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL  -- Keep audit trail even if user deleted
  NOT VALID;

-- FK: upload_sessions.auth_user_id → auth.users.id
ALTER TABLE public.upload_sessions
ADD CONSTRAINT fk_upload_sessions_auth_user_id
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

-- ============================================================================
-- STEP 4: Validate All Constraints (Zero Downtime)
-- ============================================================================
-- These commands validate existing data WITHOUT blocking writes
-- Validation happens in background with ShareUpdateExclusiveLock
-- Duration: ~1-5 seconds per table (depends on row count)

-- Validate mapping table constraints
ALTER TABLE public.clerk_to_auth_map
  VALIDATE CONSTRAINT fk_clerk_to_auth_map_auth_user_id;

ALTER TABLE public.clerk_to_auth_map
  VALIDATE CONSTRAINT fk_clerk_to_auth_map_public_user_id;

-- Validate users table constraint
ALTER TABLE public.users
  VALIDATE CONSTRAINT fk_users_auth_user_id;

-- Validate child table constraints
ALTER TABLE public.conversations
  VALIDATE CONSTRAINT fk_conversations_auth_user_id;

ALTER TABLE public.chat_sessions
  VALIDATE CONSTRAINT fk_chat_sessions_auth_user_id;

ALTER TABLE public.user_context
  VALIDATE CONSTRAINT fk_user_context_auth_user_id;

ALTER TABLE public.conversation_memory
  VALIDATE CONSTRAINT fk_conversation_memory_auth_user_id;

ALTER TABLE public.topic_progression
  VALIDATE CONSTRAINT fk_topic_progression_auth_user_id;

ALTER TABLE public.user_onboarding_milestones
  VALIDATE CONSTRAINT fk_user_onboarding_milestones_auth_user_id;

ALTER TABLE public.user_preferences
  VALIDATE CONSTRAINT fk_user_preferences_auth_user_id;

ALTER TABLE public.data_export_requests
  VALIDATE CONSTRAINT fk_data_export_requests_auth_user_id;

ALTER TABLE public.idempotency_keys
  VALIDATE CONSTRAINT fk_idempotency_keys_auth_user_id;

ALTER TABLE public.privacy_audit_log
  VALIDATE CONSTRAINT fk_privacy_audit_log_auth_user_id;

ALTER TABLE public.upload_sessions
  VALIDATE CONSTRAINT fk_upload_sessions_auth_user_id;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 1. Check all FK constraints are valid (no NOT VALID remaining)
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  confrelid::regclass AS referenced_table,
  convalidated AS is_validated,
  CASE WHEN convalidated THEN '✓ Validated' ELSE '⚠ NOT VALID' END AS status
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND conname LIKE '%auth_user_id%'
ORDER BY table_name, constraint_name;

-- Expected: All constraints should show is_validated = true

-- 2. Check for any orphaned auth_user_id values (should be 0)
SELECT
  'users' AS table_name,
  COUNT(*) AS orphaned_rows
FROM public.users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
WHERE u.auth_user_id IS NOT NULL
  AND au.id IS NULL

UNION ALL

SELECT
  'conversations',
  COUNT(*)
FROM public.conversations c
LEFT JOIN auth.users au ON c.auth_user_id = au.id
WHERE c.auth_user_id IS NOT NULL
  AND au.id IS NULL

UNION ALL

SELECT
  'chat_sessions',
  COUNT(*)
FROM public.chat_sessions cs
LEFT JOIN auth.users au ON cs.auth_user_id = au.id
WHERE cs.auth_user_id IS NOT NULL
  AND au.id IS NULL;

-- Expected: 0 orphaned rows for all tables

-- 3. List all FK constraints with their delete rules
SELECT
  conrelid::regclass AS "Table",
  conname AS "Constraint Name",
  confrelid::regclass AS "References",
  confdeltype AS "On Delete",
  CASE confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS "Delete Behavior"
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND conname LIKE '%auth_user_id%'
ORDER BY conrelid::regclass::text;

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
/*
-- WARNING: Removes all FK constraints added in this migration
-- Safe to run if migration needs to be reverted

-- Drop FK constraints from child tables
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS fk_conversations_auth_user_id;
ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS fk_chat_sessions_auth_user_id;
ALTER TABLE public.user_context DROP CONSTRAINT IF EXISTS fk_user_context_auth_user_id;
ALTER TABLE public.conversation_memory DROP CONSTRAINT IF EXISTS fk_conversation_memory_auth_user_id;
ALTER TABLE public.topic_progression DROP CONSTRAINT IF EXISTS fk_topic_progression_auth_user_id;
ALTER TABLE public.user_onboarding_milestones DROP CONSTRAINT IF EXISTS fk_user_onboarding_milestones_auth_user_id;
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS fk_user_preferences_auth_user_id;
ALTER TABLE public.data_export_requests DROP CONSTRAINT IF EXISTS fk_data_export_requests_auth_user_id;
ALTER TABLE public.idempotency_keys DROP CONSTRAINT IF EXISTS fk_idempotency_keys_auth_user_id;
ALTER TABLE public.privacy_audit_log DROP CONSTRAINT IF EXISTS fk_privacy_audit_log_auth_user_id;
ALTER TABLE public.upload_sessions DROP CONSTRAINT IF EXISTS fk_upload_sessions_auth_user_id;

-- Drop FK from users table
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS fk_users_auth_user_id;

-- Drop FK from mapping table
ALTER TABLE public.clerk_to_auth_map DROP CONSTRAINT IF EXISTS fk_clerk_to_auth_map_auth_user_id;
ALTER TABLE public.clerk_to_auth_map DROP CONSTRAINT IF EXISTS fk_clerk_to_auth_map_public_user_id;
*/

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. Run this migration AFTER Migration 002 (backfill must be complete)
-- 2. Monitor validation step - should complete in <1 minute total
-- 3. If validation fails, check for orphaned auth_user_id values
-- 4. Run verification queries to confirm all constraints are valid
-- 5. Proceed to Migration 004 to create compatibility layer
-- ============================================================================
