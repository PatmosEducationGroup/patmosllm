-- Migration 014: Remove Clerk-related columns and tables
-- Run this AFTER verifying all Clerk code has been removed from the codebase
--
-- IMPORTANT: This migration removes Clerk authentication support permanently.
-- Ensure all users have been migrated to Supabase Auth before running.

-- ============================================================================
-- STEP 1: Drop indexes on Clerk columns first (if they exist)
-- ============================================================================

DROP INDEX IF EXISTS idx_users_clerk_id;
DROP INDEX IF EXISTS idx_users_clerk_ticket;

-- ============================================================================
-- STEP 2: Remove Clerk columns from users table
-- ============================================================================

-- Remove clerk_id column (primary Clerk identifier)
ALTER TABLE public.users DROP COLUMN IF EXISTS clerk_id;

-- Remove clerk_ticket column (Clerk invitation ticket)
ALTER TABLE public.users DROP COLUMN IF EXISTS clerk_ticket;

-- ============================================================================
-- STEP 3: Drop migration tracking tables (no longer needed)
-- ============================================================================

-- Drop user_migration table used during Clerk -> Supabase migration
DROP TABLE IF EXISTS public.user_migration CASCADE;

-- Drop clerk_webhook_events table (no longer receiving webhooks)
DROP TABLE IF EXISTS public.clerk_webhook_events CASCADE;

-- ============================================================================
-- STEP 4: Remove any Clerk-related database functions (if they exist)
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_user_by_clerk_id(text);
DROP FUNCTION IF EXISTS public.sync_clerk_user(text, text, text);
DROP FUNCTION IF EXISTS public.migrate_clerk_to_supabase(text, uuid);

-- ============================================================================
-- STEP 5: Clean up any remaining Clerk-related data
-- ============================================================================

-- Remove any clerk-related entries from idempotency_keys table
DELETE FROM public.idempotency_keys WHERE key LIKE 'clerk_%';

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify cleanup)
-- ============================================================================

-- Check users table no longer has clerk columns
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'users' AND table_schema = 'public'
-- AND column_name LIKE '%clerk%';

-- Verify user_migration table is dropped
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'user_migration'
-- );

-- Verify clerk_webhook_events table is dropped
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'clerk_webhook_events'
-- );

-- ============================================================================
-- NOTES:
-- - This migration is irreversible. Create a backup before running.
-- - All user authentication now goes through Supabase Auth exclusively.
-- - The auth_user_id column in the users table is the single source of truth.
-- ============================================================================
