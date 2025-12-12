-- ============================================================================
-- Migration 012: Fix RLS Performance Issues
-- Created: 2025-12-10
-- ============================================================================
-- This migration fixes three types of Supabase linter warnings:
--
-- 1. auth_rls_initplan (25 policies) - Wraps auth.uid() in (SELECT auth.uid())
--    to prevent re-evaluation for each row
--
-- 2. multiple_permissive_policies (4 tables) - Consolidates overlapping policies
--    into single policies with OR logic
--
-- 3. duplicate_index (2 tables) - Drops duplicate indexes
--
-- Run this migration in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: FIX auth_rls_initplan WARNINGS
-- ============================================================================
-- The fix is to wrap auth.uid() in (SELECT auth.uid()) so it's evaluated once
-- per query instead of once per row.

-- ============================================
-- 1.1 invitation_tokens (3 policies)
-- ============================================

DROP POLICY IF EXISTS "Admins can view all invitations" ON public.invitation_tokens;
CREATE POLICY "Admins can view all invitations"
ON public.invitation_tokens
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
    AND users.role = 'ADMIN'
  )
);

DROP POLICY IF EXISTS "Admins can create invitations" ON public.invitation_tokens;
CREATE POLICY "Admins can create invitations"
ON public.invitation_tokens
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
    AND users.role = 'ADMIN'
  )
);

DROP POLICY IF EXISTS "Admins can update invitations" ON public.invitation_tokens;
CREATE POLICY "Admins can update invitations"
ON public.invitation_tokens
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid())
    AND users.role = 'ADMIN'
  )
);

-- ============================================
-- 1.2 topic_progression (1 policy)
-- ============================================

DROP POLICY IF EXISTS "Users can insert own topic progression" ON public.topic_progression;
CREATE POLICY "Users can insert own topic progression"
ON public.topic_progression
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- Also fix the "Users can manage own progression" policy if it exists
DROP POLICY IF EXISTS "Users can manage own progression" ON public.topic_progression;
CREATE POLICY "Users can manage own progression"
ON public.topic_progression
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 1.3 users (2 policies)
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile"
ON public.users
FOR SELECT
TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR
  role IN ('ADMIN', 'SUPER_ADMIN')
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 1.4 user_context (1 policy)
-- ============================================

DROP POLICY IF EXISTS "Users can insert own context" ON public.user_context;
CREATE POLICY "Users can insert own context"
ON public.user_context
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- Also fix the upsert policy if it exists
DROP POLICY IF EXISTS "Users can upsert own context" ON public.user_context;
CREATE POLICY "Users can upsert own context"
ON public.user_context
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 1.5 conversation_memory (1 policy)
-- ============================================

DROP POLICY IF EXISTS "Users can insert own conversations" ON public.conversation_memory;
CREATE POLICY "Users can insert own conversations"
ON public.conversation_memory
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- Also fix manage policy if exists
DROP POLICY IF EXISTS "Users can manage own memory" ON public.conversation_memory;
CREATE POLICY "Users can manage own memory"
ON public.conversation_memory
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 1.6 api_usage_internal_log (1 policy)
-- ============================================

DROP POLICY IF EXISTS "admin_only_read" ON public.api_usage_internal_log;
CREATE POLICY "admin_only_read"
ON public.api_usage_internal_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role = 'ADMIN'
  )
);

-- ============================================
-- 1.7 waitlist_signups (2 policies)
-- ============================================

DROP POLICY IF EXISTS "Allow admins to view waitlist signups" ON public.waitlist_signups;
CREATE POLICY "Allow admins to view waitlist signups"
ON public.waitlist_signups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

DROP POLICY IF EXISTS "Allow admins to update waitlist signups" ON public.waitlist_signups;
CREATE POLICY "Allow admins to update waitlist signups"
ON public.waitlist_signups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- ============================================
-- 1.8 user_preferences (1 policy)
-- ============================================

DROP POLICY IF EXISTS "user_prefs_insert" ON public.user_preferences;
CREATE POLICY "user_prefs_insert"
ON public.user_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- Also fix manage policy if exists
DROP POLICY IF EXISTS "Users can manage own preferences" ON public.user_preferences;
CREATE POLICY "Users can manage own preferences"
ON public.user_preferences
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 1.9 data_export_requests (1 policy)
-- ============================================

DROP POLICY IF EXISTS "export_requests_insert" ON public.data_export_requests;
CREATE POLICY "export_requests_insert"
ON public.data_export_requests
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- Also fix other policies if they exist
DROP POLICY IF EXISTS "Users can view own export requests" ON public.data_export_requests;
CREATE POLICY "Users can view own export requests"
ON public.data_export_requests
FOR SELECT
TO authenticated
USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create export requests" ON public.data_export_requests;
CREATE POLICY "Users can create export requests"
ON public.data_export_requests
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can view all export requests" ON public.data_export_requests;
CREATE POLICY "Admins can view all export requests"
ON public.data_export_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = (SELECT auth.uid())
    AND role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- ============================================================================
-- PART 2: FIX multiple_permissive_policies WARNINGS
-- ============================================================================
-- Consolidate overlapping policies into single policies with OR logic

-- ============================================
-- 2.1 daily_donation_estimates
-- ============================================
-- Problem: no_user_writes (FOR ALL) and read_own_estimate (FOR SELECT) conflict
-- Solution: Remove no_user_writes, keep only read_own_estimate (writes blocked by no policy)

DROP POLICY IF EXISTS "no_user_writes" ON public.daily_donation_estimates;
DROP POLICY IF EXISTS "read_own_estimate" ON public.daily_donation_estimates;

-- Single policy: users can only read their own estimate (no write policies = no writes)
CREATE POLICY "read_own_estimate"
ON public.daily_donation_estimates
FOR SELECT
TO authenticated
USING (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 2.2 usage_tracking_consent
-- ============================================
-- Problem: manage_own_consent, read_own_consent, update_own_consent all overlap
-- Solution: Single policy for all operations

DROP POLICY IF EXISTS "manage_own_consent" ON public.usage_tracking_consent;
DROP POLICY IF EXISTS "read_own_consent" ON public.usage_tracking_consent;
DROP POLICY IF EXISTS "update_own_consent" ON public.usage_tracking_consent;

-- Single consolidated policy for all operations
CREATE POLICY "users_manage_own_consent"
ON public.usage_tracking_consent
FOR ALL
TO authenticated
USING (auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ============================================
-- 2.3 user_invitation_quotas
-- ============================================
-- Problem: Two SELECT policies (users own + admins all)
-- Solution: Consolidate into single SELECT policy with OR logic

DROP POLICY IF EXISTS "Users can view their own invitation quota" ON public.user_invitation_quotas;
DROP POLICY IF EXISTS "Admins can view all invitation quotas" ON public.user_invitation_quotas;

-- Consolidated SELECT policy
CREATE POLICY "view_invitation_quotas"
ON public.user_invitation_quotas
FOR SELECT
TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- Fix remaining admin policies with (SELECT auth.uid())
DROP POLICY IF EXISTS "Admins can update invitation quotas" ON public.user_invitation_quotas;
CREATE POLICY "Admins can update invitation quotas"
ON public.user_invitation_quotas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

DROP POLICY IF EXISTS "Admins can insert invitation quotas" ON public.user_invitation_quotas;
CREATE POLICY "Admins can insert invitation quotas"
ON public.user_invitation_quotas
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- ============================================
-- 2.4 user_sent_invitations_log
-- ============================================
-- Problem: Two SELECT policies (users own + admins all)
-- Solution: Consolidate into single SELECT policy with OR logic

DROP POLICY IF EXISTS "Users can view their own sent invitations" ON public.user_sent_invitations_log;
DROP POLICY IF EXISTS "Admins can view all sent invitations" ON public.user_sent_invitations_log;

-- Consolidated SELECT policy
CREATE POLICY "view_sent_invitations"
ON public.user_sent_invitations_log
FOR SELECT
TO authenticated
USING (
  sender_auth_user_id = (SELECT auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- Fix remaining policies with (SELECT auth.uid())
DROP POLICY IF EXISTS "Users can insert their own sent invitations" ON public.user_sent_invitations_log;
CREATE POLICY "Users can insert their own sent invitations"
ON public.user_sent_invitations_log
FOR INSERT
TO authenticated
WITH CHECK (sender_auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can update sent invitations" ON public.user_sent_invitations_log;
CREATE POLICY "Admins can update sent invitations"
ON public.user_sent_invitations_log
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = (SELECT auth.uid())
    AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- ============================================================================
-- PART 3: FIX duplicate_index WARNINGS
-- ============================================================================

-- ============================================
-- 3.1 api_usage_internal_log - drop one of the duplicate expires indexes
-- ============================================
-- idx_internal_expires and idx_internal_log_expires are duplicates
DROP INDEX IF EXISTS public.idx_internal_expires;
-- Keep idx_internal_log_expires

-- ============================================
-- 3.2 daily_donation_estimates - drop one of the duplicate auth_user indexes
-- ============================================
-- idx_daily_estimates_auth_user and idx_donation_auth_user are duplicates
DROP INDEX IF EXISTS public.idx_donation_auth_user;
-- Keep idx_daily_estimates_auth_user

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check policies were created correctly
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'invitation_tokens',
    'topic_progression',
    'users',
    'usage_tracking_consent',
    'user_context',
    'conversation_memory',
    'daily_donation_estimates',
    'api_usage_internal_log',
    'waitlist_signups',
    'user_preferences',
    'data_export_requests',
    'user_invitation_quotas',
    'user_sent_invitations_log'
  )
ORDER BY tablename, policyname;

-- Check no duplicate indexes remain
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('api_usage_internal_log', 'daily_donation_estimates')
ORDER BY tablename, indexname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 012: RLS Performance Issues FIXED';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed Issues:';
  RAISE NOTICE '  1. auth_rls_initplan: 25+ policies now use (SELECT auth.uid())';
  RAISE NOTICE '  2. multiple_permissive_policies: 4 tables consolidated';
  RAISE NOTICE '  3. duplicate_index: 2 duplicate indexes dropped';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Modified:';
  RAISE NOTICE '  - invitation_tokens (3 policies)';
  RAISE NOTICE '  - topic_progression (2 policies)';
  RAISE NOTICE '  - users (2 policies)';
  RAISE NOTICE '  - usage_tracking_consent (1 consolidated policy)';
  RAISE NOTICE '  - user_context (2 policies)';
  RAISE NOTICE '  - conversation_memory (2 policies)';
  RAISE NOTICE '  - daily_donation_estimates (1 policy, 1 index dropped)';
  RAISE NOTICE '  - api_usage_internal_log (1 policy, 1 index dropped)';
  RAISE NOTICE '  - waitlist_signups (2 policies)';
  RAISE NOTICE '  - user_preferences (2 policies)';
  RAISE NOTICE '  - data_export_requests (3 policies)';
  RAISE NOTICE '  - user_invitation_quotas (3 policies consolidated)';
  RAISE NOTICE '  - user_sent_invitations_log (3 policies consolidated)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Step: Re-run Supabase linter to verify all warnings are resolved';
  RAISE NOTICE '============================================================================';
END $$;
