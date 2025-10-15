-- ============================================================================
-- PHASE 7: MAKE CLERK_ID NULLABLE
-- ============================================================================
-- This script removes the NOT NULL constraint on clerk_id to support
-- Supabase-only user creation (invitation system without Clerk)
-- Run this in Supabase SQL Editor (PRODUCTION)
-- ============================================================================

-- Remove NOT NULL constraint from clerk_id
ALTER TABLE users ALTER COLUMN clerk_id DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN users.clerk_id IS 'Clerk user ID (nullable for Supabase-only users created via invitations)';

-- Verify the change
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name = 'clerk_id';

-- Expected output:
-- clerk_id | text | YES | NULL

-- ============================================================================
-- Context: Phase 7 Migration Strategy
-- ============================================================================
-- Phase 7 introduces Supabase-only invitation system where users are created
-- directly in Supabase Auth without Clerk involvement. This means clerk_id
-- will be NULL for newly invited users.
--
-- Migration phases:
-- - Phase 1-6: Dual auth (Clerk + Supabase), clerk_id required
-- - Phase 7+: Supabase invitations, clerk_id optional
-- - Future: Full Clerk removal, clerk_id can be dropped
-- ============================================================================

-- ============================================================================
-- Rollback script (if needed):
-- ============================================================================
-- WARNING: Only rollback if NO Supabase-only users exist yet!
-- ALTER TABLE users ALTER COLUMN clerk_id SET NOT NULL;
