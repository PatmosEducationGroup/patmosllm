-- Migration: Fix search_path security vulnerabilities in invitation functions
-- Created: 2025-10-22
-- Description: Adds SET search_path = pg_catalog, pg_temp to all invitation system functions

-- ============================================
-- Fix: cfg_default_invites
-- ============================================
CREATE OR REPLACE FUNCTION cfg_default_invites()
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT 3;
$$;

-- ============================================
-- Fix: is_admin
-- ============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND deleted_at IS NULL
  );
$$;

-- ============================================
-- Fix: accept_invitation_and_link
-- ============================================
CREATE OR REPLACE FUNCTION accept_invitation_and_link(
  p_invitation_id UUID,
  p_invitee_user_id UUID
)
RETURNS TABLE(
  sender_user_id UUID,
  invitation_id UUID,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invitation user_sent_invitations_log%ROWTYPE;
BEGIN
  -- Lock and fetch invitation
  SELECT * INTO v_invitation
  FROM user_sent_invitations_log
  WHERE id = p_invitation_id
  FOR UPDATE;

  -- Validation checks
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Invalid invitation';
    RETURN;
  END IF;

  IF v_invitation.status != 'pending' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false,
      'Invitation already ' || v_invitation.status;
    RETURN;
  END IF;

  IF v_invitation.expires_at < NOW() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Invitation expired';
    RETURN;
  END IF;

  -- Update invitation
  UPDATE user_sent_invitations_log
  SET
    status = 'accepted',
    invited_user_id = p_invitee_user_id,
    accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- Increment sender's quota (unless sent by admin)
  IF NOT v_invitation.sent_by_admin THEN
    UPDATE user_invitation_quotas
    SET invites_used = invites_used + 1
    WHERE user_id = v_invitation.sender_user_id;
  END IF;

  RETURN QUERY SELECT
    v_invitation.sender_user_id,
    v_invitation.id,
    true,
    'Invitation accepted successfully';
END;
$$;

-- ============================================
-- Fix: expire_invitations_and_refund
-- ============================================
CREATE OR REPLACE FUNCTION expire_invitations_and_refund()
RETURNS TABLE(expired_count INTEGER, refunded_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_refunded_count INTEGER := 0;
  expired_rec RECORD;
BEGIN
  -- Find and expire invitations
  FOR expired_rec IN
    SELECT id, sender_user_id, sent_by_admin
    FROM user_sent_invitations_log
    WHERE status = 'pending'
      AND expires_at < NOW()
    FOR UPDATE
  LOOP
    -- Mark as expired
    UPDATE user_sent_invitations_log
    SET status = 'expired'
    WHERE id = expired_rec.id;

    v_expired_count := v_expired_count + 1;

    -- Refund quota (unless sent by admin)
    IF NOT expired_rec.sent_by_admin THEN
      UPDATE user_invitation_quotas
      SET invites_used = GREATEST(invites_used - 1, 0)
      WHERE user_id = expired_rec.sender_user_id;

      v_refunded_count := v_refunded_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_expired_count, v_refunded_count;
END;
$$;

-- ============================================
-- Fix: grant_invites_to_user
-- ============================================
CREATE OR REPLACE FUNCTION grant_invites_to_user(
  p_user_id UUID,
  p_add_invites INTEGER
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_add_invites <= 0 THEN
    RETURN QUERY SELECT false, 'Must grant at least 1 invitation';
    RETURN;
  END IF;

  UPDATE user_invitation_quotas
  SET total_invites_granted = total_invites_granted + p_add_invites
  WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Granted ' || p_add_invites || ' invitations';
  ELSE
    RETURN QUERY SELECT false, 'User quota not found';
  END IF;
END;
$$;

-- ============================================
-- Fix: grant_invites_to_all
-- ============================================
CREATE OR REPLACE FUNCTION grant_invites_to_all(
  p_add_invites INTEGER,
  p_only_role TEXT DEFAULT NULL
)
RETURNS TABLE(users_updated INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
    AND (p_only_role IS NULL OR u.role = p_only_role);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY SELECT v_updated_count,
    'Granted ' || p_add_invites || ' invitations to ' || v_updated_count || ' users';
END;
$$;

-- ============================================
-- Fix: create_user_quota_on_signup
-- ============================================
CREATE OR REPLACE FUNCTION create_user_quota_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO user_invitation_quotas (user_id, auth_user_id)
  VALUES (NEW.id, NEW.auth_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================
-- Fix: update_updated_at_column
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Verify all functions now have search_path set
SELECT
  routine_name,
  routine_type,
  CASE
    WHEN prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type
FROM information_schema.routines r
JOIN pg_proc p ON p.proname = r.routine_name
WHERE routine_schema = 'public'
  AND routine_name IN (
    'cfg_default_invites',
    'is_admin',
    'accept_invitation_and_link',
    'expire_invitations_and_refund',
    'grant_invites_to_user',
    'grant_invites_to_all',
    'create_user_quota_on_signup',
    'update_updated_at_column'
  )
ORDER BY routine_name;
