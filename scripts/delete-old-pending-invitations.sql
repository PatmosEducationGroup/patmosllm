-- ============================================================================
-- DELETE OLD PENDING INVITATIONS (From users table - OLD system)
-- ============================================================================
-- This script deletes pending invitations from the OLD system
-- (stored in users table with invitation_token but no auth_user_id)
--
-- ⚠️  IMPORTANT: Run find-old-pending-invitations.sql FIRST to review what will be deleted
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- SAFETY CHECK 1: Verify no accepted invitations will be deleted
-- ============================================================================
DO $$
DECLARE
  v_unsafe_count INTEGER;
BEGIN
  -- Check if any invitations to be deleted have auth_user_id (accepted)
  SELECT COUNT(*) INTO v_unsafe_count
  FROM users
  WHERE invitation_token IS NOT NULL
    AND auth_user_id IS NOT NULL;  -- This should be 0 for the DELETE query

  IF v_unsafe_count > 0 THEN
    RAISE NOTICE '⚠️  WARNING: % users have both invitation_token AND auth_user_id', v_unsafe_count;
    RAISE NOTICE '    These are accepted invitations and will NOT be deleted';
  ELSE
    RAISE NOTICE '✅ SAFETY CHECK PASSED: No accepted invitations will be affected';
  END IF;
END $$;

-- ============================================================================
-- SAFETY CHECK 2: Show what will be deleted
-- ============================================================================
SELECT
  COUNT(*) as invitations_to_delete,
  COUNT(*) FILTER (WHERE invitation_expires_at < NOW()) as expired_count,
  COUNT(*) FILTER (WHERE invitation_expires_at >= NOW() OR invitation_expires_at IS NULL) as pending_count
FROM users
WHERE invitation_token IS NOT NULL
  AND auth_user_id IS NULL;

-- ============================================================================
-- DELETE OLD PENDING INVITATIONS
-- ============================================================================
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete users table records that:
  -- 1. Have invitation_token (were created via OLD invitation system)
  -- 2. Have NO auth_user_id (never completed signup)
  DELETE FROM users
  WHERE invitation_token IS NOT NULL
    AND auth_user_id IS NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Deleted % old pending invitations from users table', v_deleted_count;
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- VERIFICATION: Check remaining invitations
-- ============================================================================
-- Should return 0 rows
SELECT COUNT(*) as remaining_old_invitations
FROM users
WHERE invitation_token IS NOT NULL
  AND auth_user_id IS NULL;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Old invitation cleanup completed!';
  RAISE NOTICE '   - Deleted all pending invitations from users table (OLD system)';
  RAISE NOTICE '   - Going forward, use invitation_tokens table (NEW system)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 NEXT STEPS:';
  RAISE NOTICE '   1. Create new invitations via /admin/users';
  RAISE NOTICE '   2. Invitations will be stored in invitation_tokens table';
  RAISE NOTICE '   3. Use scripts/cleanup-orphaned-invitations.sql for future cleanup';
  RAISE NOTICE '';
END $$;
