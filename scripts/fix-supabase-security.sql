-- ============================================================================
-- FIX SUPABASE SECURITY ISSUES
-- ============================================================================
-- This script fixes all security issues flagged by Supabase linter
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop the view that exposes auth.users
-- ============================================================================
DROP VIEW IF EXISTS public.v_user_migration_status CASCADE;

-- ============================================================================
-- STEP 2: Drop security definer views (they're not used by migration flow)
-- ============================================================================
DROP VIEW IF EXISTS public.v_migration_metrics CASCADE;
DROP VIEW IF EXISTS public.v_migration_last_24h CASCADE;
DROP VIEW IF EXISTS public.v_migration_by_auth_type CASCADE;
DROP VIEW IF EXISTS public.v_migration_progress CASCADE;

-- ============================================================================
-- STEP 3: Enable RLS on all migration tables
-- ============================================================================
ALTER TABLE public.user_migration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clerk_to_auth_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 4: Create RLS policies for service role access
-- ============================================================================

-- user_migration table
DROP POLICY IF EXISTS "Service role full access" ON public.user_migration;
CREATE POLICY "Service role full access" ON public.user_migration
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- migration_log table
DROP POLICY IF EXISTS "Service role full access" ON public.migration_log;
CREATE POLICY "Service role full access" ON public.migration_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- migration_alerts table
DROP POLICY IF EXISTS "Service role full access" ON public.migration_alerts;
CREATE POLICY "Service role full access" ON public.migration_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- account_lockouts table
DROP POLICY IF EXISTS "Service role full access" ON public.account_lockouts;
CREATE POLICY "Service role full access" ON public.account_lockouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- clerk_to_auth_map table
DROP POLICY IF EXISTS "Service role full access" ON public.clerk_to_auth_map;
CREATE POLICY "Service role full access" ON public.clerk_to_auth_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- migration_events table
DROP POLICY IF EXISTS "Service role full access" ON public.migration_events;
CREATE POLICY "Service role full access" ON public.migration_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check that RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_migration',
    'migration_log',
    'migration_alerts',
    'account_lockouts',
    'clerk_to_auth_map',
    'migration_events'
  )
ORDER BY tablename;

-- Check that policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_migration',
    'migration_log',
    'migration_alerts',
    'account_lockouts',
    'clerk_to_auth_map',
    'migration_events'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ All security issues fixed!';
  RAISE NOTICE '   - Dropped problematic views';
  RAISE NOTICE '   - Enabled RLS on 6 migration tables';
  RAISE NOTICE '   - Created service role policies';
  RAISE NOTICE '';
  RAISE NOTICE '🔄 Next step: Try password migration again';
END $$;
