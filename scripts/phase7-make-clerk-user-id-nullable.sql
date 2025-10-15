-- ============================================================================
-- PHASE 7: MAKE CLERK_USER_ID NULLABLE
-- ============================================================================
-- This script removes the NOT NULL constraint on clerk_user_id to support
-- Supabase-only user creation (invitation system without Clerk)
-- Run this in Supabase SQL Editor (PRODUCTION)
-- ============================================================================

-- Remove NOT NULL constraint from clerk_user_id
ALTER TABLE users ALTER COLUMN clerk_user_id DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN users.clerk_user_id IS 'Clerk user ID (nullable for Supabase-only users created via invitations)';

-- Verify the change
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name = 'clerk_user_id';

-- Expected output:
-- clerk_user_id | text | YES | NULL

-- ============================================================================
-- Context: Both clerk_id and clerk_user_id need to be nullable
-- ============================================================================
-- The users table has two Clerk-related columns:
-- - clerk_id: Original Clerk identifier
-- - clerk_user_id: Secondary Clerk identifier (possibly from migration)
--
-- Both need to be nullable for Phase 7 Supabase-only invitations.
-- ============================================================================
