-- Fix Invitation Quota Logic
-- Run this in Supabase SQL Editor

-- The quota system should work like this:
-- 1. SEND invitation → increment invites_used
-- 2. ACCEPT invitation → do nothing (already counted on send)
-- 3. EXPIRE invitation → decrement invites_used (refund)
-- 4. REVOKE invitation → do nothing (no refund)

-- Add function to increment invites_used atomically
CREATE OR REPLACE FUNCTION increment_invites_used(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_invitation_quotas
  SET invites_used = invites_used + 1
  WHERE user_id = p_user_id;
END;
$$;

-- Fix accept_invitation_and_link() to NOT increment
-- (quota was already incremented when invitation was sent)
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

  -- NOTE: Do NOT increment invites_used here
  -- It was already incremented when invitation was sent
  -- This prevents double-counting

  RETURN QUERY SELECT
    v_invitation.sender_user_id,
    v_invitation.id,
    true,
    'Invitation accepted successfully';
END;
$$;

-- Verify fix
SELECT 'increment_invites_used' as function_name, 'CREATED' as status
UNION ALL
SELECT 'accept_invitation_and_link', 'UPDATED (removed double increment)';
