-- Debug Invitation Quota System
-- Run this in Supabase SQL Editor to diagnose quota refund issues

-- ==================================================
-- STEP 1: Check current quota status
-- ==================================================
SELECT
  u.id,
  u.email,
  u.name,
  u.role,
  q.total_invites_granted,
  q.invites_used,
  q.invites_remaining,
  q.created_at,
  q.updated_at
FROM users u
JOIN user_invitation_quotas q ON q.user_id = u.id
WHERE u.deleted_at IS NULL
ORDER BY u.email;

-- ==================================================
-- STEP 2: Check invitation status
-- ==================================================
SELECT
  log.id,
  log.invitee_email,
  log.status,
  log.sent_by_admin,
  log.created_at,
  log.accepted_at,
  log.expires_at,
  sender.email as sender_email,
  sender.name as sender_name
FROM user_sent_invitations_log log
JOIN users sender ON sender.id = log.sender_user_id
ORDER BY log.created_at DESC
LIMIT 20;

-- ==================================================
-- STEP 3: Check if buggy SQL function exists
-- ==================================================
-- This will show if accept_invitation_and_link() has the bug
SELECT
  routine_name,
  CASE
    WHEN routine_definition LIKE '%invites_used = invites_used + 1%' THEN '🚨 BUG EXISTS: Increments on accept'
    WHEN routine_definition LIKE '%invites_used%' THEN '⚠️  WARNING: References invites_used'
    ELSE '✅ OK: Does not modify invites_used'
  END as status,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'accept_invitation_and_link'
  AND routine_type = 'FUNCTION';

-- ==================================================
-- STEP 4: Check if increment_invites_used exists
-- ==================================================
-- This function should exist (created by fix script)
SELECT
  routine_name,
  '✅ EXISTS' as status
FROM information_schema.routines
WHERE routine_name = 'increment_invites_used'
  AND routine_type = 'FUNCTION'
UNION ALL
SELECT
  'increment_invites_used',
  '🚨 MISSING: Fix script not applied' as status
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.routines
  WHERE routine_name = 'increment_invites_used'
    AND routine_type = 'FUNCTION'
);

-- ==================================================
-- STEP 5: Check for triggers that modify quota
-- ==================================================
SELECT
  t.trigger_name,
  t.event_object_table,
  t.action_timing,
  t.event_manipulation,
  p.proname as function_name
FROM information_schema.triggers t
JOIN pg_proc p ON p.oid = t.action_statement::regproc
WHERE t.event_object_table IN ('user_invitation_quotas', 'user_sent_invitations_log', 'users')
  AND t.trigger_schema = 'public'
ORDER BY t.event_object_table, t.trigger_name;

-- ==================================================
-- STEP 6: Test quota increment (safe - uses transaction)
-- ==================================================
-- This tests if increment_invites_used works correctly
-- IMPORTANT: This is wrapped in a transaction and rolled back
DO $$
DECLARE
  test_user_id UUID;
  before_used INTEGER;
  after_used INTEGER;
  test_result TEXT;
BEGIN
  -- Find a user to test with (non-admin)
  SELECT u.id INTO test_user_id
  FROM users u
  JOIN user_invitation_quotas q ON q.user_id = u.id
  WHERE u.deleted_at IS NULL
    AND u.role = 'USER'
  LIMIT 1;

  IF test_user_id IS NULL THEN
    RAISE NOTICE '⚠️  No test user found';
    RETURN;
  END IF;

  -- Get before value
  SELECT invites_used INTO before_used
  FROM user_invitation_quotas
  WHERE user_id = test_user_id;

  -- Test increment
  BEGIN
    PERFORM increment_invites_used(test_user_id);

    -- Get after value
    SELECT invites_used INTO after_used
    FROM user_invitation_quotas
    WHERE user_id = test_user_id;

    IF after_used = before_used + 1 THEN
      RAISE NOTICE '✅ increment_invites_used WORKS CORRECTLY (% → %)', before_used, after_used;
    ELSE
      RAISE NOTICE '🚨 increment_invites_used FAILED (% → %, expected %)', before_used, after_used, before_used + 1;
    END IF;

    -- ROLLBACK to undo test changes
    RAISE EXCEPTION 'Test complete - rolling back changes';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'Test complete%' THEN
        RAISE NOTICE 'Test transaction rolled back successfully';
      ELSE
        RAISE NOTICE '🚨 Test failed with error: %', SQLERRM;
      END IF;
  END;
END $$;

-- ==================================================
-- SUMMARY
-- ==================================================
SELECT '=== DIAGNOSIS SUMMARY ===' as summary;

-- Check 1: Are there any accepted invitations that caused quota issues?
SELECT
  'Accepted invitations in last 7 days' as check_name,
  COUNT(*) as count
FROM user_sent_invitations_log
WHERE status = 'accepted'
  AND accepted_at > NOW() - INTERVAL '7 days';

-- Check 2: Any users with negative invites_used?
SELECT
  'Users with negative invites_used' as check_name,
  COUNT(*) as count
FROM user_invitation_quotas
WHERE invites_used < 0;

-- Check 3: Any users with invites_used > total_invites_granted?
SELECT
  'Users over quota' as check_name,
  COUNT(*) as count
FROM user_invitation_quotas
WHERE invites_used > total_invites_granted;
