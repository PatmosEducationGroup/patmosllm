-- ============================================================================
-- Migration 013: Cleanup Duplicate RLS Policies
-- Created: 2025-12-10
-- ============================================================================
-- The previous migration added consolidated policies but didn't drop all
-- pre-existing conflicting policies. This migration removes all duplicates.
-- ============================================================================

-- ============================================
-- 1. conversation_memory
-- ============================================
-- Conflicting: "Users can delete own conversations", "Users can insert own conversations",
--              "Users can view own conversations", "Users can update own conversations",
--              "Users can manage own memory"
-- Keep ONLY: "Users can manage own memory" (FOR ALL)

DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversation_memory;
DROP POLICY IF EXISTS "Users can insert own conversations" ON public.conversation_memory;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversation_memory;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversation_memory;
DROP POLICY IF EXISTS "Users can view own memory" ON public.conversation_memory;
DROP POLICY IF EXISTS "Users can manage own memory" ON public.conversation_memory;

-- Create single consolidated policy
CREATE POLICY "Users can manage own memory"
ON public.conversation_memory
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 2. data_export_requests
-- ============================================
-- Conflicting: "Users can create export requests", "export_requests_insert",
--              "Admins can view all export requests", "Users can view own export requests",
--              "export_requests_combined_select"
-- Keep ONLY: Separate SELECT (combined) and INSERT policies

DROP POLICY IF EXISTS "Users can create export requests" ON public.data_export_requests;
DROP POLICY IF EXISTS "export_requests_insert" ON public.data_export_requests;
DROP POLICY IF EXISTS "Admins can view all export requests" ON public.data_export_requests;
DROP POLICY IF EXISTS "Users can view own export requests" ON public.data_export_requests;
DROP POLICY IF EXISTS "export_requests_combined_select" ON public.data_export_requests;
DROP POLICY IF EXISTS "export_requests_select" ON public.data_export_requests;

-- Single SELECT policy (users see own, admins see all)
CREATE POLICY "view_export_requests"
ON public.data_export_requests
FOR SELECT
TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = (SELECT auth.uid())
    AND role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- Single INSERT policy
CREATE POLICY "create_export_requests"
ON public.data_export_requests
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 3. topic_progression
-- ============================================
-- Conflicting: "Users can delete own topic progression", "Users can insert own topic progression",
--              "Users can view own topic progression", "Users can update own topic progression",
--              "Users can manage own progression"
-- Keep ONLY: "Users can manage own progression" (FOR ALL)

DROP POLICY IF EXISTS "Users can delete own topic progression" ON public.topic_progression;
DROP POLICY IF EXISTS "Users can insert own topic progression" ON public.topic_progression;
DROP POLICY IF EXISTS "Users can view own topic progression" ON public.topic_progression;
DROP POLICY IF EXISTS "Users can update own topic progression" ON public.topic_progression;
DROP POLICY IF EXISTS "Users can manage own progression" ON public.topic_progression;

-- Create single consolidated policy
CREATE POLICY "Users can manage own progression"
ON public.topic_progression
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 4. user_context
-- ============================================
-- Conflicting: "Users can delete own context", "Users can insert own context",
--              "Users can view own context", "Users can update own context",
--              "Users can upsert own context"
-- Keep ONLY: "Users can upsert own context" (FOR ALL)

DROP POLICY IF EXISTS "Users can delete own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can insert own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can view own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can update own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can upsert own context" ON public.user_context;

-- Create single consolidated policy
CREATE POLICY "Users can manage own context"
ON public.user_context
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 5. user_preferences
-- ============================================
-- Conflicting: "Users can manage own preferences", "user_prefs_delete",
--              "user_prefs_insert", "user_prefs_select", "user_prefs_update"
-- Keep ONLY: Single FOR ALL policy

DROP POLICY IF EXISTS "Users can manage own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "user_prefs_delete" ON public.user_preferences;
DROP POLICY IF EXISTS "user_prefs_insert" ON public.user_preferences;
DROP POLICY IF EXISTS "user_prefs_select" ON public.user_preferences;
DROP POLICY IF EXISTS "user_prefs_update" ON public.user_preferences;

-- Create single consolidated policy
CREATE POLICY "Users can manage own preferences"
ON public.user_preferences
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check policies on fixed tables
SELECT
  tablename,
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'conversation_memory',
    'data_export_requests',
    'topic_progression',
    'user_context',
    'user_preferences'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 013: Duplicate Policies Cleaned Up';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables fixed:';
  RAISE NOTICE '  - conversation_memory: 1 policy (was 5)';
  RAISE NOTICE '  - data_export_requests: 2 policies (was 5)';
  RAISE NOTICE '  - topic_progression: 1 policy (was 5)';
  RAISE NOTICE '  - user_context: 1 policy (was 5)';
  RAISE NOTICE '  - user_preferences: 1 policy (was 5)';
  RAISE NOTICE '';
  RAISE NOTICE 'Re-run Supabase linter to verify all warnings are resolved.';
  RAISE NOTICE '============================================================================';
END $$;
