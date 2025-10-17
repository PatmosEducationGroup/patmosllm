-- Fix Admin Invitation Quota Features
-- Run this in Supabase SQL Editor

-- Issue 1: Fix type casting error in grant_invites_to_all
-- Issue 2: Add ability to SET quotas (not just ADD) for disable/unlimited

-- ============================================
-- FIX 1: grant_invites_to_all with proper type casting
-- ============================================
CREATE OR REPLACE FUNCTION grant_invites_to_all(
  p_add_invites INTEGER,
  p_only_role TEXT DEFAULT NULL
)
RETURNS TABLE(users_updated INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_add_invites <= 0 THEN
    RETURN QUERY SELECT 0, 'Must grant at least 1 invitation';
    RETURN;
  END IF;

  UPDATE user_invitation_quotas q
  SET total_invites_granted = total_invites_granted + p_add_invites
  FROM users u
  WHERE q.user_id = u.id
    AND u.deleted_at IS NULL
    AND (p_only_role IS NULL OR u.role::text = p_only_role);  -- FIX: Cast enum to text

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY SELECT v_updated_count,
    'Granted ' || p_add_invites || ' invitations to ' || v_updated_count || ' users';
END;
$$;

-- ============================================
-- FIX 2: New function to SET quota (not add)
-- ============================================
-- Allows setting exact quota values for special operations:
-- - SET 0 = Disable invitations (set invites_used to total to make remaining = 0)
-- - SET 999999999 = Unlimited invitations
-- - SET any value = Set total_invites_granted to that exact number

CREATE OR REPLACE FUNCTION set_quota_for_user(
  p_user_id UUID,
  p_set_total INTEGER
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow 0 for disable, or any positive number including 999999999 for unlimited
  IF p_set_total < 0 THEN
    RETURN QUERY SELECT false, 'Quota cannot be negative';
    RETURN;
  END IF;

  -- Special case: Setting to 0 means disable (set used = total)
  IF p_set_total = 0 THEN
    UPDATE user_invitation_quotas
    SET
      total_invites_granted = 0,
      invites_used = 0
    WHERE user_id = p_user_id;
  ELSE
    -- Normal case: Set total, preserve used count
    UPDATE user_invitation_quotas
    SET total_invites_granted = p_set_total
    WHERE user_id = p_user_id;
  END IF;

  IF FOUND THEN
    IF p_set_total = 0 THEN
      RETURN QUERY SELECT true, 'Invitations disabled for user';
    ELSIF p_set_total >= 999999999 THEN
      RETURN QUERY SELECT true, 'Unlimited invitations set for user';
    ELSE
      RETURN QUERY SELECT true, 'Quota set to ' || p_set_total || ' invitations';
    END IF;
  ELSE
    RETURN QUERY SELECT false, 'User quota not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION set_quota_for_all(
  p_set_total INTEGER,
  p_only_role TEXT DEFAULT NULL
)
RETURNS TABLE(users_updated INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Allow 0 for disable, or any positive number including 999999999 for unlimited
  IF p_set_total < 0 THEN
    RETURN QUERY SELECT 0, 'Quota cannot be negative';
    RETURN;
  END IF;

  -- Special case: Setting to 0 means disable
  IF p_set_total = 0 THEN
    UPDATE user_invitation_quotas q
    SET
      total_invites_granted = 0,
      invites_used = 0
    FROM users u
    WHERE q.user_id = u.id
      AND u.deleted_at IS NULL
      AND (p_only_role IS NULL OR u.role::text = p_only_role);
  ELSE
    -- Normal case: Set total, preserve used count
    UPDATE user_invitation_quotas q
    SET total_invites_granted = p_set_total
    FROM users u
    WHERE q.user_id = u.id
      AND u.deleted_at IS NULL
      AND (p_only_role IS NULL OR u.role::text = p_only_role);
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_set_total = 0 THEN
    RETURN QUERY SELECT v_updated_count,
      'Invitations disabled for ' || v_updated_count || ' users';
  ELSIF p_set_total >= 999999999 THEN
    RETURN QUERY SELECT v_updated_count,
      'Unlimited invitations set for ' || v_updated_count || ' users';
  ELSE
    RETURN QUERY SELECT v_updated_count,
      'Quota set to ' || p_set_total || ' for ' || v_updated_count || ' users';
  END IF;
END;
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'grant_invites_to_all' as function_name, 'UPDATED (fixed type casting)' as status
UNION ALL
SELECT 'set_quota_for_user', 'CREATED'
UNION ALL
SELECT 'set_quota_for_all', 'CREATED';
