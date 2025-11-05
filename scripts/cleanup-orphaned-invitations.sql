-- ============================================================================
-- CLEANUP ORPHANED INVITATIONS
-- ============================================================================
-- This script cleans up:
-- 1. Expired invitations in invitation_tokens table
-- 2. Orphaned Supabase Auth users (created via inviteUserByEmail but never accepted)
--
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: SAFETY CHECKS (Run First - Verify No Active Users Affected)
-- ============================================================================

-- SAFETY CHECK 1: Verify no active users will be affected by deletion
DO $$
DECLARE
  v_unsafe_count INTEGER;
BEGIN
  -- Check if any expired invitations belong to active users
  SELECT COUNT(*) INTO v_unsafe_count
  FROM invitation_tokens it
  INNER JOIN users u ON u.email = it.email
  WHERE it.accepted_at IS NULL
    AND it.expires_at < NOW() - INTERVAL '7 days';

  IF v_unsafe_count > 0 THEN
    RAISE EXCEPTION '⚠️  UNSAFE: % expired invitations belong to active users! Aborting.', v_unsafe_count;
  ELSE
    RAISE NOTICE '✅ SAFETY CHECK PASSED: No active users will be affected';
  END IF;
END $$;

-- SAFETY CHECK 2: Count active users by role
SELECT
  role,
  COUNT(*) as active_users,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) as non_deleted_users
FROM users
WHERE deleted_at IS NULL
GROUP BY role
ORDER BY role;

-- ============================================================================
-- PART 2: ANALYZE ORPHANED DATA (View Before Deleting)
-- ============================================================================

-- View expired invitations
SELECT
  id,
  email,
  name,
  role,
  expires_at,
  accepted_at,
  created_at,
  CASE
    WHEN accepted_at IS NOT NULL THEN 'Accepted'
    WHEN expires_at < NOW() THEN 'Expired'
    ELSE 'Pending'
  END as status
FROM invitation_tokens
WHERE accepted_at IS NULL
  AND expires_at < NOW()
ORDER BY expires_at DESC;

-- View orphaned auth users (in auth.users but not in users table)
SELECT
  au.id as auth_user_id,
  au.email,
  au.created_at as auth_created_at,
  au.last_sign_in_at,
  au.email_confirmed_at
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.auth_user_id
WHERE u.id IS NULL  -- No corresponding user record
  AND au.last_sign_in_at IS NULL  -- Never signed in
ORDER BY au.created_at DESC;

-- ============================================================================
-- PART 3: DELETE EXPIRED INVITATIONS (Safe - Verified Above)
-- ============================================================================

-- Delete invitations that:
-- - Were never accepted (accepted_at IS NULL)
-- - Are older than 7 days past expiration
-- - Do NOT belong to any active user (safety check passed above)
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM invitation_tokens
  WHERE accepted_at IS NULL
    AND expires_at < NOW() - INTERVAL '7 days'
    -- EXTRA SAFETY: Exclude any emails that exist in users table
    AND email NOT IN (SELECT email FROM users WHERE deleted_at IS NULL);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Deleted % expired invitations', v_deleted_count;
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- PART 4: CLEANUP ORPHANED AUTH USERS (MANUAL STEP - REVIEW ONLY)
-- ============================================================================

-- NOTE: Supabase doesn't allow direct deletion of auth.users via SQL
-- You must use the Supabase Admin SDK or do this via the application code

-- To clean up orphaned auth users, run this API endpoint:
-- POST /api/admin/cleanup-orphaned-auth-users

-- Or manually in Supabase Dashboard:
-- 1. Go to Authentication > Users
-- 2. Filter by users with no last sign-in
-- 3. Check if they have a corresponding record in public.users
-- 4. Delete manually if orphaned

-- ============================================================================
-- PART 5: PREVENT FUTURE ORPHANS (Optional Automatic Cleanup)
-- ============================================================================

-- Create a function to expire old pending invitations automatically
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS TABLE(expired_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  -- Mark invitations as expired (don't delete, for audit trail)
  -- This is optional - you can also just delete them
  UPDATE invitation_tokens
  SET accepted_at = NULL  -- Keep as NULL to show never accepted
  WHERE accepted_at IS NULL
    AND expires_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN QUERY SELECT v_expired_count;
END;
$$;

-- Optional: Create a cron job to run this weekly
-- In Supabase Dashboard > Database > Cron Jobs:
-- Schedule: 0 2 * * 0 (Every Sunday at 2 AM)
-- SQL: SELECT expire_old_invitations();

-- ============================================================================
-- PART 6: VERIFICATION QUERIES (After Cleanup)
-- ============================================================================

-- Verify no more expired invitations exist
SELECT COUNT(*) as expired_invitations_count
FROM invitation_tokens
WHERE accepted_at IS NULL
  AND expires_at < NOW() - INTERVAL '7 days';

-- Count invitation statuses
SELECT
  CASE
    WHEN accepted_at IS NOT NULL THEN 'Accepted'
    WHEN expires_at < NOW() THEN 'Expired (Recent)'
    ELSE 'Pending'
  END as status,
  COUNT(*) as count
FROM invitation_tokens
GROUP BY
  CASE
    WHEN accepted_at IS NOT NULL THEN 'Accepted'
    WHEN expires_at < NOW() THEN 'Expired (Recent)'
    ELSE 'Pending'
  END
ORDER BY count DESC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Invitation cleanup script completed!';
  RAISE NOTICE '   - Expired invitations deleted (7+ days old)';
  RAISE NOTICE '   - View remaining invitations above';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  MANUAL STEP REQUIRED:';
  RAISE NOTICE '   - Clean up orphaned auth users via API or Supabase Dashboard';
  RAISE NOTICE '   - See PART 3 comments above for instructions';
  RAISE NOTICE '';
END $$;
