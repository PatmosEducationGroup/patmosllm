-- ============================================================================
-- FIX RLS PERFORMANCE WARNINGS
-- ============================================================================
-- This script fixes RLS policy performance issues flagged by Supabase linter
--
-- Issues fixed:
-- 1. Auth RLS Initialization Plan (23 policies)
--    Problem: auth.uid() is re-evaluated for each row
--    Fix: Wrap with (SELECT auth.uid()) to evaluate once per query
--
-- 2. Multiple Permissive Policies (2 tables)
--    Problem: Multiple SELECT policies for same role cause redundant checks
--    Fix: Combine policies with OR logic
-- ============================================================================

-- First, let's check what the current policies look like
-- Run this query to see all affected policies:
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'conversation_memory',
    'topic_progression',
    'user_context',
    'user_preferences',
    'data_export_requests',
    'privacy_audit_log',
    'idempotency_keys',
    'clerk_webhook_events'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- IMPORTANT INSTRUCTIONS
-- ============================================================================
-- Before running the fixes below, you need to:
-- 1. Review the output of the query above
-- 2. For each policy, identify if it uses auth.uid() or auth.jwt()
-- 3. The fix is to replace:
--      auth.uid()        with  (SELECT auth.uid())
--      auth.jwt()        with  (SELECT auth.jwt())
--
-- Example transformation:
--   OLD: user_id = auth.uid()
--   NEW: user_id = (SELECT auth.uid())
--
-- You'll need to drop and recreate each policy with the corrected expression.
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix conversation_memory policies
-- ============================================================================
-- Example for one policy - repeat pattern for all:

-- DROP POLICY "Users can view own conversations" ON public.conversation_memory;
-- CREATE POLICY "Users can view own conversations"
--   ON public.conversation_memory
--   FOR SELECT
--   USING (user_id = (SELECT auth.uid()));

-- DROP POLICY "Users can insert own conversations" ON public.conversation_memory;
-- CREATE POLICY "Users can insert own conversations"
--   ON public.conversation_memory
--   FOR INSERT
--   WITH CHECK (user_id = (SELECT auth.uid()));

-- DROP POLICY "Users can update own conversations" ON public.conversation_memory;
-- CREATE POLICY "Users can update own conversations"
--   ON public.conversation_memory
--   FOR UPDATE
--   USING (user_id = (SELECT auth.uid()));

-- DROP POLICY "Users can delete own conversations" ON public.conversation_memory;
-- CREATE POLICY "Users can delete own conversations"
--   ON public.conversation_memory
--   FOR DELETE
--   USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- STEP 2: Fix multiple permissive policies
-- ============================================================================
-- For data_export_requests and privacy_audit_log, combine admin and user policies

-- Example for data_export_requests:
-- DROP POLICY "export_requests_select" ON public.data_export_requests;
-- DROP POLICY "export_requests_admin_select" ON public.data_export_requests;

-- CREATE POLICY "export_requests_combined_select"
--   ON public.data_export_requests
--   FOR SELECT
--   USING (
--     user_id = (SELECT auth.uid())
--     OR
--     EXISTS (
--       SELECT 1 FROM public.users
--       WHERE id = (SELECT auth.uid())
--       AND role IN ('ADMIN', 'SUPER_ADMIN')
--     )
--   );

-- ============================================================================
-- AUTOMATED FIX GENERATOR
-- ============================================================================
-- This query generates the DROP/CREATE statements for you:

SELECT
  format(
    E'-- Fix policy: %s.%s\nDROP POLICY IF EXISTS %I ON %I.%I;\nCREATE POLICY %I ON %I.%I\n  FOR %s\n  %s;\n',
    schemaname,
    policyname,
    policyname,
    schemaname,
    tablename,
    policyname,
    schemaname,
    tablename,
    cmd,
    CASE
      WHEN cmd IN ('SELECT', 'DELETE', 'UPDATE') THEN
        'USING (' || replace(replace(qual, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())') || ')'
      WHEN cmd = 'INSERT' THEN
        'WITH CHECK (' || replace(replace(qual, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())') || ')'
      ELSE 'USING (' || replace(replace(qual, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())') ||
           ') WITH CHECK (' || replace(replace(qual, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())') || ')'
    END
  ) as fix_statement
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'conversation_memory',
    'topic_progression',
    'user_context',
    'user_preferences',
    'data_export_requests',
    'privacy_audit_log',
    'idempotency_keys',
    'clerk_webhook_events'
  )
  AND (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%')
ORDER BY tablename, policyname;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. Copy the output from the query above
-- 2. Review each generated statement
-- 3. Run them one by one in SQL Editor
-- 4. Verify with Supabase linter that warnings are resolved
--
-- For multiple permissive policies, you'll need to manually combine them
-- using OR logic as shown in STEP 2 example above.
-- ============================================================================
