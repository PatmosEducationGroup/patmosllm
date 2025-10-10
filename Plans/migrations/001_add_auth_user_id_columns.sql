-- ============================================================================
-- MIGRATION 001: Add auth_user_id Columns (Additive - Zero Downtime)
-- ============================================================================
-- Purpose: Add auth_user_id columns to all user-related tables
-- Strategy: Additive only - NO breaking changes, NO constraints yet
-- Rollback: Safe - columns nullable, no data loss
-- ============================================================================

-- Table: users (PRIMARY - 256 kB, ~50 rows)
-- Add auth.users.id reference as future single source of truth
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.users.auth_user_id IS 'References auth.users.id - will replace clerk_id as primary identifier';

-- Table: conversations (560 kB, ~1000 rows)
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.conversations.auth_user_id IS 'Denormalized auth.users.id for RLS and query performance';

-- Table: chat_sessions (112 kB, ~100 rows)
ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.chat_sessions.auth_user_id IS 'Denormalized auth.users.id for RLS';

-- Table: user_context (392 kB, ~50 rows)
ALTER TABLE public.user_context
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.user_context.auth_user_id IS 'Denormalized auth.users.id for user preferences';

-- Table: conversation_memory (264 kB, ~500 rows)
ALTER TABLE public.conversation_memory
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.conversation_memory.auth_user_id IS 'Denormalized auth.users.id for memory tracking';

-- Table: topic_progression (72 kB, ~100 rows)
ALTER TABLE public.topic_progression
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.topic_progression.auth_user_id IS 'Denormalized auth.users.id for learning progression';

-- Table: user_onboarding_milestones (136 kB, ~200 rows)
ALTER TABLE public.user_onboarding_milestones
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.user_onboarding_milestones.auth_user_id IS 'Denormalized auth.users.id for onboarding tracking';

-- Table: user_preferences (32 kB, ~50 rows)
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.user_preferences.auth_user_id IS 'Denormalized auth.users.id for user settings';

-- Table: data_export_requests (48 kB, ~10 rows)
ALTER TABLE public.data_export_requests
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.data_export_requests.auth_user_id IS 'Denormalized auth.users.id for GDPR exports';

-- Table: idempotency_keys (32 kB, ~50 rows)
ALTER TABLE public.idempotency_keys
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.idempotency_keys.auth_user_id IS 'Denormalized auth.users.id for request deduplication';

-- Table: privacy_audit_log (32 kB, ~100 rows)
ALTER TABLE public.privacy_audit_log
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.privacy_audit_log.auth_user_id IS 'Denormalized auth.users.id for audit trail';

-- Table: upload_sessions (944 kB, ~100 rows)
ALTER TABLE public.upload_sessions
ADD COLUMN IF NOT EXISTS auth_user_id UUID;

COMMENT ON COLUMN public.upload_sessions.auth_user_id IS 'Denormalized auth.users.id for upload tracking';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify all columns were added successfully
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'auth_user_id'
ORDER BY table_name;

-- Expected result: 13 rows (13 tables with auth_user_id)

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
-- WARNING: Only run if migration needs to be reverted
-- This is safe because no data was modified, only schema changed

/*
ALTER TABLE public.users DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.chat_sessions DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.user_context DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.conversation_memory DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.topic_progression DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.user_onboarding_milestones DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.data_export_requests DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.idempotency_keys DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.privacy_audit_log DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.upload_sessions DROP COLUMN IF EXISTS auth_user_id;
*/

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. Run this migration in Supabase SQL Editor
-- 2. Verify with verification query above
-- 3. No application changes needed yet (additive only)
-- 4. Proceed to Migration 002 to create mapping table
-- ============================================================================
