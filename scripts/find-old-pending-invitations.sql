-- ============================================================================
-- FIND OLD PENDING INVITATIONS (From users table - OLD system)
-- ============================================================================
-- This query finds invitations from the OLD system that are still pending
-- (stored in users table with invitation_token but no auth_user_id)
--
-- Run this in Supabase SQL Editor to see what will be deleted
-- ============================================================================

-- Find all pending invitations from OLD system
SELECT
  id,
  email,
  name,
  role,
  invitation_token,
  invitation_expires_at,
  invited_by,
  created_at,
  auth_user_id,
  CASE
    WHEN auth_user_id IS NOT NULL THEN 'Accepted (Has Auth)'
    WHEN invitation_expires_at IS NOT NULL AND invitation_expires_at < NOW() THEN 'Expired'
    WHEN invitation_token IS NOT NULL AND auth_user_id IS NULL THEN 'Pending (Never Accepted)'
    ELSE 'Unknown'
  END as status
FROM users
WHERE invitation_token IS NOT NULL  -- Has an invitation token
  AND auth_user_id IS NULL           -- Never completed signup
ORDER BY created_at DESC;

-- Count by status
SELECT
  CASE
    WHEN invitation_expires_at IS NOT NULL AND invitation_expires_at < NOW() THEN 'Expired'
    WHEN invitation_token IS NOT NULL AND auth_user_id IS NULL THEN 'Pending'
    ELSE 'Unknown'
  END as status,
  COUNT(*) as count
FROM users
WHERE invitation_token IS NOT NULL
  AND auth_user_id IS NULL
GROUP BY
  CASE
    WHEN invitation_expires_at IS NOT NULL AND invitation_expires_at < NOW() THEN 'Expired'
    WHEN invitation_token IS NOT NULL AND auth_user_id IS NULL THEN 'Pending'
    ELSE 'Unknown'
  END;

-- ============================================================================
-- RESULT INTERPRETATION
-- ============================================================================
-- Status meanings:
-- - "Pending (Never Accepted)" = Invitation sent but user never signed up
-- - "Expired" = Invitation expired and was never used
-- - "Accepted (Has Auth)" = User completed signup (should NOT be in this list)
--
-- Safe to delete: Pending and Expired invitations
-- ============================================================================
