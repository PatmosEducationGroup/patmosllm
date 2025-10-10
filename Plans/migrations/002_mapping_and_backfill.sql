-- ============================================================================
-- MIGRATION 002: Create Mapping Table & Backfill auth.users
-- ============================================================================
-- Purpose: Create clerk_to_auth_map and populate auth.users with existing users
-- Strategy: Create mapping infrastructure for zero-downtime migration
-- Estimated Time: 5-10 minutes for ~50 users
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Mapping Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.clerk_to_auth_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  auth_user_id UUID UNIQUE NOT NULL,  -- Will add FK in Migration 003
  public_user_id UUID UNIQUE NOT NULL,  -- Will add FK in Migration 003
  migrated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_clerk_to_auth_clerk
  ON public.clerk_to_auth_map(clerk_id);

CREATE INDEX IF NOT EXISTS idx_clerk_to_auth_auth
  ON public.clerk_to_auth_map(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_clerk_to_auth_public
  ON public.clerk_to_auth_map(public_user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_clerk_to_auth_map_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clerk_to_auth_map_updated_at
  BEFORE UPDATE ON public.clerk_to_auth_map
  FOR EACH ROW
  EXECUTE FUNCTION public.update_clerk_to_auth_map_updated_at();

COMMENT ON TABLE public.clerk_to_auth_map IS 'Mapping between Clerk IDs and Supabase Auth user IDs for zero-downtime migration';

-- ============================================================================
-- STEP 2: Create Function to Backfill Single User
-- ============================================================================
CREATE OR REPLACE FUNCTION public.backfill_auth_user(p_public_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_clerk_id TEXT;
  v_email TEXT;
  v_name TEXT;
  v_role TEXT;
  v_created_at TIMESTAMPTZ;
  v_auth_user_id UUID;
BEGIN
  -- Get user data from public.users
  SELECT clerk_id, email, name, role, created_at
  INTO v_clerk_id, v_email, v_name, v_role, v_created_at
  FROM public.users
  WHERE id = p_public_user_id
    AND deleted_at IS NULL
    AND NOT clerk_id LIKE 'invited_%';  -- Skip pending invitations

  IF NOT FOUND THEN
    RAISE NOTICE 'User % not found or is pending invitation', p_public_user_id;
    RETURN NULL;
  END IF;

  -- Check if auth.users entry already exists by email
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_auth_user_id IS NULL THEN
    -- Create auth.users entry
    -- Note: This requires auth.users insert permission or service role
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',  -- Default instance
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt('MIGRATION_PASSWORD_' || p_public_user_id::text, gen_salt('bf')),  -- Temporary password
      v_created_at,  -- Auto-confirm (they verified with Clerk)
      v_created_at,
      now(),
      jsonb_build_object(
        'clerk_id', v_clerk_id,
        'migrated_from_clerk', true,
        'role', v_role,
        'name', v_name,
        'migration_note', 'User must reset password on first Supabase login'
      ),
      false,
      '',
      ''
    )
    RETURNING id INTO v_auth_user_id;
  END IF;

  -- Insert into mapping table
  INSERT INTO public.clerk_to_auth_map (
    clerk_id,
    auth_user_id,
    public_user_id
  ) VALUES (
    v_clerk_id,
    v_auth_user_id,
    p_public_user_id
  )
  ON CONFLICT (clerk_id) DO NOTHING;

  -- Update public.users with auth_user_id
  UPDATE public.users
  SET auth_user_id = v_auth_user_id,
      updated_at = now()
  WHERE id = p_public_user_id;

  RETURN v_auth_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.backfill_auth_user IS 'Backfill single user from public.users to auth.users with mapping';

-- ============================================================================
-- STEP 3: Batch Backfill All Users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.backfill_all_auth_users()
RETURNS TABLE(
  public_user_id UUID,
  auth_user_id UUID,
  user_email TEXT,
  success BOOLEAN,
  error TEXT
) AS $$
DECLARE
  v_user_record RECORD;
  v_auth_user_id UUID;
BEGIN
  FOR v_user_record IN
    SELECT u.id, u.email
    FROM public.users u
    WHERE u.deleted_at IS NULL
      AND NOT u.clerk_id LIKE 'invited_%'
      AND u.auth_user_id IS NULL  -- Only backfill users without auth_user_id
    ORDER BY u.created_at ASC
  LOOP
    BEGIN
      v_auth_user_id := public.backfill_auth_user(v_user_record.id);

      RETURN QUERY SELECT
        v_user_record.id,
        v_auth_user_id,
        v_user_record.email,
        (v_auth_user_id IS NOT NULL)::BOOLEAN,
        NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT
        v_user_record.id,
        NULL::UUID,
        v_user_record.email,
        false,
        SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.backfill_all_auth_users IS 'Batch backfill all users from public.users to auth.users';

-- ============================================================================
-- STEP 4: Execute Backfill
-- ============================================================================
-- Run this to backfill all existing users
-- Expected: ~50 rows for PatmosLLM
SELECT * FROM public.backfill_all_auth_users();

-- ============================================================================
-- STEP 5: Backfill Child Tables with auth_user_id
-- ============================================================================
-- conversations
UPDATE public.conversations c
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE c.user_id = u.id
  AND c.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- chat_sessions
UPDATE public.chat_sessions cs
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE cs.user_id = u.id
  AND cs.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- user_context
UPDATE public.user_context uc
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE uc.user_id = u.id
  AND uc.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- conversation_memory
UPDATE public.conversation_memory cm
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE cm.user_id = u.id
  AND cm.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- topic_progression
UPDATE public.topic_progression tp
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE tp.user_id = u.id
  AND tp.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- user_onboarding_milestones
UPDATE public.user_onboarding_milestones uom
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE uom.user_id = u.id
  AND uom.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- user_preferences
UPDATE public.user_preferences up
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE up.user_id = u.id
  AND up.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- data_export_requests
UPDATE public.data_export_requests der
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE der.user_id = u.id
  AND der.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- idempotency_keys
UPDATE public.idempotency_keys ik
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE ik.user_id = u.id
  AND ik.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- privacy_audit_log
UPDATE public.privacy_audit_log pal
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE pal.user_id = u.id
  AND pal.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- upload_sessions (if user_id column exists)
UPDATE public.upload_sessions us
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE us.user_id = u.id
  AND us.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check mapping table population
SELECT
  COUNT(*) AS total_mappings,
  COUNT(DISTINCT clerk_id) AS unique_clerk_ids,
  COUNT(DISTINCT auth_user_id) AS unique_auth_users,
  COUNT(DISTINCT public_user_id) AS unique_public_users
FROM public.clerk_to_auth_map;

-- Check auth_user_id population in public.users
SELECT
  COUNT(*) AS total_users,
  COUNT(auth_user_id) AS users_with_auth_id,
  COUNT(*) - COUNT(auth_user_id) AS users_missing_auth_id,
  ROUND(
    (COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS percentage_migrated
FROM public.users
WHERE deleted_at IS NULL
  AND NOT clerk_id LIKE 'invited_%';

-- Check child tables backfill status
SELECT
  'conversations' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(auth_user_id) AS rows_with_auth_id,
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS percentage
FROM public.conversations
UNION ALL
SELECT
  'chat_sessions',
  COUNT(*),
  COUNT(auth_user_id),
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2)
FROM public.chat_sessions
UNION ALL
SELECT
  'user_context',
  COUNT(*),
  COUNT(auth_user_id),
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2)
FROM public.user_context;

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
/*
-- WARNING: This will delete auth.users entries created during backfill
-- Only run if migration needs to be completely reverted

-- 1. Delete auth.users entries created during migration
DELETE FROM auth.users
WHERE raw_user_meta_data->>'migrated_from_clerk' = 'true';

-- 2. Clear auth_user_id from public.users
UPDATE public.users SET auth_user_id = NULL;

-- 3. Drop mapping table
DROP TABLE IF EXISTS public.clerk_to_auth_map CASCADE;

-- 4. Drop functions
DROP FUNCTION IF EXISTS public.backfill_auth_user(UUID);
DROP FUNCTION IF EXISTS public.backfill_all_auth_users();
DROP FUNCTION IF EXISTS public.update_clerk_to_auth_map_updated_at();
*/

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. Run this migration in Supabase SQL Editor with service role
-- 2. Monitor execution time (expected: 5-10 minutes for ~50 users)
-- 3. Verify all users backfilled successfully (check verification queries)
-- 4. If any failures, investigate errors and re-run backfill for specific users
-- 5. Proceed to Migration 003 to add foreign key constraints
-- ============================================================================
