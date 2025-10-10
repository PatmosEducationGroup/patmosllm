-- ============================================================================
-- MIGRATION 004: Dual-Read Compatibility Layer (Temporary)
-- ============================================================================
-- Purpose: Enable gradual cutover with views and triggers for dual-read pattern
-- Strategy: Application can query auth_user_id while clerk_id still exists
-- Duration: Deploy during Day 3 (compatibility phase)
-- Cleanup: Remove in Migration 008 after 100% cutover
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Helper Function for User Lookup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_by_auth_or_clerk(
  p_auth_user_id UUID DEFAULT NULL,
  p_clerk_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  auth_user_id UUID,
  clerk_id TEXT,
  email TEXT,
  name TEXT,
  role TEXT
) AS $$
BEGIN
  -- Priority 1: Try auth_user_id (migrated users)
  IF p_auth_user_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      u.id,
      u.auth_user_id,
      u.clerk_id,
      u.email,
      u.name,
      u.role::TEXT
    FROM public.users u
    WHERE u.auth_user_id = p_auth_user_id
      AND u.deleted_at IS NULL
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Priority 2: Fallback to clerk_id (unmigrated users)
  IF p_clerk_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      u.id,
      u.auth_user_id,
      u.clerk_id,
      u.email,
      u.name,
      u.role::TEXT
    FROM public.users u
    WHERE u.clerk_id = p_clerk_id
      AND u.deleted_at IS NULL
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.get_user_by_auth_or_clerk IS 'Dual-read helper: lookup user by auth_user_id (preferred) or clerk_id (fallback)';

-- ============================================================================
-- STEP 2: Create Sync Trigger to Keep auth_user_id Updated
-- ============================================================================
-- If clerk_id changes, clear auth_user_id (invalidate mapping)
-- This handles edge cases during migration

CREATE OR REPLACE FUNCTION public.sync_auth_user_id_on_clerk_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If clerk_id changed and auth_user_id exists, log warning
  IF OLD.clerk_id IS DISTINCT FROM NEW.clerk_id AND NEW.auth_user_id IS NOT NULL THEN
    RAISE WARNING 'clerk_id changed for user % from % to %. auth_user_id may be stale.',
      NEW.id, OLD.clerk_id, NEW.clerk_id;

    -- Optional: Clear auth_user_id to force remapping
    -- NEW.auth_user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_auth_user_id_on_clerk_change
  BEFORE UPDATE OF clerk_id ON public.users
  FOR EACH ROW
  WHEN (OLD.clerk_id IS DISTINCT FROM NEW.clerk_id)
  EXECUTE FUNCTION public.sync_auth_user_id_on_clerk_change();

-- ============================================================================
-- STEP 3: Create Migration Status View
-- ============================================================================
CREATE OR REPLACE VIEW public.v_user_migration_status AS
SELECT
  u.id,
  u.email,
  u.clerk_id,
  u.auth_user_id,
  u.role,
  u.created_at,
  CASE
    WHEN u.clerk_id LIKE 'invited_%' THEN 'pending_invitation'
    WHEN u.auth_user_id IS NOT NULL THEN 'migrated'
    ELSE 'needs_migration'
  END AS migration_status,
  CASE
    WHEN u.auth_user_id IS NOT NULL THEN 'auth.users.id'
    ELSE 'clerk_id'
  END AS primary_identifier,
  au.email_confirmed_at IS NOT NULL AS email_confirmed_in_auth
FROM public.users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
WHERE u.deleted_at IS NULL
ORDER BY u.created_at DESC;

COMMENT ON VIEW public.v_user_migration_status IS 'Real-time view of user migration progress';

-- ============================================================================
-- STEP 4: Create Migration Progress Metrics View
-- ============================================================================
CREATE OR REPLACE VIEW public.v_migration_metrics AS
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) AS migrated_users,
  COUNT(*) FILTER (WHERE auth_user_id IS NULL AND NOT clerk_id LIKE 'invited_%') AS pending_migration,
  COUNT(*) FILTER (WHERE clerk_id LIKE 'invited_%') AS pending_invitations,
  ROUND(
    (COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL)::NUMERIC /
     NULLIF(COUNT(*) FILTER (WHERE NOT clerk_id LIKE 'invited_%'), 0)) * 100,
    2
  ) AS migration_percentage,
  MAX(updated_at) FILTER (WHERE auth_user_id IS NOT NULL) AS last_migration_at
FROM public.users
WHERE deleted_at IS NULL;

COMMENT ON VIEW public.v_migration_metrics IS 'High-level migration progress metrics';

-- ============================================================================
-- STEP 5: Create RPC Function for Application Dual-Read
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_user_for_auth(
  p_auth_user_id UUID DEFAULT NULL,
  p_clerk_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_result JSONB;
BEGIN
  -- Try dual-read lookup
  SELECT * INTO v_user
  FROM public.get_user_by_auth_or_clerk(p_auth_user_id, p_clerk_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found',
      'tried_auth_user_id', p_auth_user_id,
      'tried_clerk_id', p_clerk_id
    );
  END IF;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'auth_user_id', v_user.auth_user_id,
      'clerk_id', v_user.clerk_id,
      'email', v_user.email,
      'name', v_user.name,
      'role', v_user.role
    ),
    'source', CASE
      WHEN v_user.auth_user_id IS NOT NULL THEN 'auth.users'
      ELSE 'clerk'
    END,
    'migrated', v_user.auth_user_id IS NOT NULL
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.find_user_for_auth IS 'Application-facing dual-read function with JSON response';

-- ============================================================================
-- STEP 6: Create Trigger to Log Migration Events
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.migration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- 'user_migrated', 'dual_read_fallback', 'auth_lookup_failed'
  user_id UUID,
  auth_user_id UUID,
  clerk_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_migration_events_created_at ON public.migration_events(created_at DESC);
CREATE INDEX idx_migration_events_type ON public.migration_events(event_type);
CREATE INDEX idx_migration_events_user ON public.migration_events(user_id);

-- Trigger to log when auth_user_id is populated
CREATE OR REPLACE FUNCTION public.log_user_migration_event()
RETURNS TRIGGER AS $$
BEGIN
  -- User just got auth_user_id populated (migrated)
  IF OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NOT NULL THEN
    INSERT INTO public.migration_events (
      event_type,
      user_id,
      auth_user_id,
      clerk_id,
      metadata
    ) VALUES (
      'user_migrated',
      NEW.id,
      NEW.auth_user_id,
      NEW.clerk_id,
      jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'previous_auth_user_id', OLD.auth_user_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_user_migration
  AFTER UPDATE OF auth_user_id ON public.users
  FOR EACH ROW
  WHEN (OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id)
  EXECUTE FUNCTION public.log_user_migration_event();

-- ============================================================================
-- STEP 7: Create Admin Dashboard Helper Functions
-- ============================================================================

-- Function: Get migration timeline (last 24 hours)
CREATE OR REPLACE FUNCTION public.get_migration_timeline()
RETURNS TABLE(
  hour TIMESTAMPTZ,
  migrations_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('hour', created_at) AS hour,
    COUNT(*) AS migrations_count
  FROM public.migration_events
  WHERE event_type = 'user_migrated'
    AND created_at >= now() - interval '24 hours'
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get users needing migration (for manual intervention)
CREATE OR REPLACE FUNCTION public.get_users_needing_migration()
RETURNS TABLE(
  id UUID,
  email TEXT,
  clerk_id TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  days_since_creation INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.clerk_id,
    u.role::TEXT,
    u.created_at,
    EXTRACT(DAY FROM now() - u.created_at)::INTEGER AS days_since_creation
  FROM public.users u
  WHERE u.auth_user_id IS NULL
    AND NOT u.clerk_id LIKE 'invited_%'
    AND u.deleted_at IS NULL
  ORDER BY u.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 1. Check migration status
SELECT * FROM public.v_migration_metrics;

-- 2. View user migration status
SELECT * FROM public.v_user_migration_status
ORDER BY migration_status, created_at DESC
LIMIT 20;

-- 3. Test dual-read function
SELECT public.find_user_for_auth(
  p_auth_user_id := NULL,
  p_clerk_id := 'user_xxxxx'  -- Replace with actual clerk_id
);

-- 4. Check migration events (last 100)
SELECT
  event_type,
  user_id,
  auth_user_id,
  clerk_id,
  metadata->>'email' AS email,
  created_at
FROM public.migration_events
ORDER BY created_at DESC
LIMIT 100;

-- 5. Get migration timeline
SELECT * FROM public.get_migration_timeline();

-- 6. Get users still needing migration
SELECT * FROM public.get_users_needing_migration();

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
/*
-- WARNING: Removes compatibility layer
-- Only run if reverting to Clerk-only

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_log_user_migration ON public.users;
DROP TRIGGER IF EXISTS trigger_sync_auth_user_id_on_clerk_change ON public.users;

-- Drop functions
DROP FUNCTION IF EXISTS public.log_user_migration_event();
DROP FUNCTION IF EXISTS public.sync_auth_user_id_on_clerk_change();
DROP FUNCTION IF EXISTS public.find_user_for_auth(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_user_by_auth_or_clerk(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_migration_timeline();
DROP FUNCTION IF EXISTS public.get_users_needing_migration();

-- Drop views
DROP VIEW IF EXISTS public.v_migration_metrics;
DROP VIEW IF EXISTS public.v_user_migration_status;

-- Drop migration events table
DROP TABLE IF EXISTS public.migration_events;
*/

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. Run this migration AFTER Migration 003 (constraints must be in place)
-- 2. Deploy application code with dual-read logic BEFORE flipping feature flag
-- 3. Monitor migration_events table to track cutover progress
-- 4. Use v_migration_metrics view in admin dashboard
-- 5. Proceed to Migration 005 after application deployment
-- ============================================================================
