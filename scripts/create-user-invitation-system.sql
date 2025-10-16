-- User Invitation System - Database Migration
-- Phase 2: Tables, Functions, Triggers, Indexes
-- Run this in Supabase SQL Editor

-- ============================================
-- PART 1: Configuration Functions
-- ============================================

-- Default invitation quota per user
CREATE OR REPLACE FUNCTION cfg_default_invites()
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT 3;
$$;

-- Check if current user is admin (Supabase Auth only)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND deleted_at IS NULL
  );
$$;

-- ============================================
-- PART 2: Tables
-- ============================================

-- Table 1: User Invitation Quotas
CREATE TABLE IF NOT EXISTS user_invitation_quotas (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auth_user_id UUID,  -- Nullable during migration period
  total_invites_granted INTEGER NOT NULL DEFAULT 3,
  invites_used INTEGER NOT NULL DEFAULT 0,
  invites_remaining INTEGER GENERATED ALWAYS AS (
    GREATEST(total_invites_granted - invites_used, 0)
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_total_positive CHECK (total_invites_granted >= 0),
  CONSTRAINT check_used_nonnegative CHECK (invites_used >= 0)
);

-- Table 2: User Sent Invitations Log
CREATE TABLE IF NOT EXISTS user_sent_invitations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_auth_user_id UUID,  -- Nullable during migration
  invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invitee_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_by_admin BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  CONSTRAINT check_email_format CHECK (position('@' IN invitee_email) > 1)
);

-- ============================================
-- PART 3: Indexes
-- ============================================

-- Quota lookups by user_id (primary key already indexed)
-- Quota lookups by auth_user_id
CREATE INDEX IF NOT EXISTS idx_quotas_auth_user_id ON user_invitation_quotas(auth_user_id);

-- Invitation lookups by sender
CREATE INDEX IF NOT EXISTS idx_invitations_sender ON user_sent_invitations_log(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_sender_auth ON user_sent_invitations_log(sender_auth_user_id);

-- Invitation lookups by email (for checking duplicates)
CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_sent_invitations_log(invitee_email);

-- Invitation lookups by status (for expiration queries)
CREATE INDEX IF NOT EXISTS idx_invitations_status ON user_sent_invitations_log(status);

-- Invitation lookups by invited_user_id (for tracking accepted invitations)
CREATE INDEX IF NOT EXISTS idx_invitations_invited_user ON user_sent_invitations_log(invited_user_id);

-- ============================================
-- PART 4: Core Business Logic Functions
-- ============================================

-- Function: Accept invitation and link to user account
-- Called when new user signs up with invitation token
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

-- Function: Auto-expire invitations and refund quotas
-- Called on every GET /api/user/invitations request (no cron needed)
CREATE OR REPLACE FUNCTION expire_invitations_and_refund()
RETURNS TABLE(expired_count INTEGER, refunded_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Function: Grant invitations to specific user (admin only)
CREATE OR REPLACE FUNCTION grant_invites_to_user(
  p_user_id UUID,
  p_add_invites INTEGER
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Function: Grant invitations to all users (admin only)
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
    AND (p_only_role IS NULL OR u.role = p_only_role);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY SELECT v_updated_count,
    'Granted ' || p_add_invites || ' invitations to ' || v_updated_count || ' users';
END;
$$;

-- ============================================
-- PART 5: Triggers
-- ============================================

-- Trigger: Auto-create quota on user signup
CREATE OR REPLACE FUNCTION create_user_quota_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_invitation_quotas (user_id, auth_user_id)
  VALUES (NEW.id, NEW.auth_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_quota_on_signup ON users;
CREATE TRIGGER trigger_create_quota_on_signup
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_quota_on_signup();

-- Trigger: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_quota_updated_at ON user_invitation_quotas;
CREATE TRIGGER trigger_quota_updated_at
  BEFORE UPDATE ON user_invitation_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 6: Backfill Existing Users
-- ============================================

-- Create quota rows for existing users
INSERT INTO user_invitation_quotas (user_id, auth_user_id)
SELECT id, auth_user_id
FROM users
WHERE deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- PART 7: Verification
-- ============================================

-- Verify table creation
SELECT 'user_invitation_quotas' as table_name, COUNT(*) as row_count FROM user_invitation_quotas
UNION ALL
SELECT 'user_sent_invitations_log', COUNT(*) FROM user_sent_invitations_log;

-- Verify functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
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

-- Verify indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('user_invitation_quotas', 'user_sent_invitations_log')
ORDER BY tablename, indexname;

-- Verify triggers
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('trigger_create_quota_on_signup', 'trigger_quota_updated_at')
ORDER BY trigger_name;
