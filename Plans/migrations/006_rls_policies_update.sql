-- ============================================================================
-- MIGRATION 006: Update RLS Policies for Single-Tier Architecture
-- ============================================================================
-- Purpose: Rewrite Row Level Security policies to use auth.users.id directly
-- Prerequisites: Migration 005 complete (auth_user_id NOT NULL enforced)
-- Timing: Day 5-6 after application cutover
-- Strategy: Drop old policies, create new ones using auth.jwt()
-- ============================================================================

-- ============================================================================
-- STEP 1: Example RLS Pattern for auth.users.id
-- ============================================================================
-- New RLS policies will use auth.uid() to get auth.users.id
-- This replaces the old pattern of joining to clerk_id

-- Example OLD policy (Clerk-based):
/*
CREATE POLICY "Users can view own data" ON public.conversations
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE clerk_id = auth.jwt()->>'sub'
    )
  );
*/

-- Example NEW policy (Supabase Auth-based):
/*
CREATE POLICY "Users can view own data" ON public.conversations
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
  );
*/

-- ============================================================================
-- STEP 2: Update Users Table RLS
-- ============================================================================

-- Drop old policies (if they exist)
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- Enable RLS if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- New policy: Users can view own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR
    -- Admins can view all users
    role IN ('ADMIN', 'SUPER_ADMIN')
  );

-- New policy: Users can update own profile (limited columns)
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- New policy: Admins can manage all users
CREATE POLICY "Admins can manage all users" ON public.users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- STEP 3: Update Conversations Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Users can view own conversations
CREATE POLICY "Users can view own conversations" ON public.conversations
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- Users can create conversations (must match their auth_user_id)
CREATE POLICY "Users can create conversations" ON public.conversations
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

-- Users can update own conversations
CREATE POLICY "Users can update own conversations" ON public.conversations
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Users can delete own conversations
CREATE POLICY "Users can delete own conversations" ON public.conversations
  FOR DELETE
  USING (auth_user_id = auth.uid());

-- ============================================================================
-- STEP 4: Update Chat Sessions Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete own chat sessions" ON public.chat_sessions;

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can create chat sessions" ON public.chat_sessions
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
  FOR DELETE
  USING (auth_user_id = auth.uid());

-- ============================================================================
-- STEP 5: Update User Context Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can update own context" ON public.user_context;

ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own context" ON public.user_context
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can upsert own context" ON public.user_context
  FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ============================================================================
-- STEP 6: Update Conversation Memory Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own memory" ON public.conversation_memory;
DROP POLICY IF EXISTS "Users can create memory" ON public.conversation_memory;

ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memory" ON public.conversation_memory
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can manage own memory" ON public.conversation_memory
  FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ============================================================================
-- STEP 7: Update Topic Progression Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own progression" ON public.topic_progression;

ALTER TABLE public.topic_progression ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own progression" ON public.topic_progression
  FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ============================================================================
-- STEP 8: Update User Preferences Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own preferences" ON public.user_preferences;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences" ON public.user_preferences
  FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ============================================================================
-- STEP 9: Update Data Export Requests Table RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own export requests" ON public.data_export_requests;
DROP POLICY IF EXISTS "Users can create export requests" ON public.data_export_requests;

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own export requests" ON public.data_export_requests
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can create export requests" ON public.data_export_requests
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

-- Admins can view all export requests
CREATE POLICY "Admins can view all export requests" ON public.data_export_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- STEP 10: Update Privacy Audit Log RLS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own audit log" ON public.privacy_audit_log;

ALTER TABLE public.privacy_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view own audit entries
CREATE POLICY "Users can view own audit log" ON public.privacy_audit_log
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- System can insert audit entries (service role only)
CREATE POLICY "System can create audit entries" ON public.privacy_audit_log
  FOR INSERT
  WITH CHECK (true);  -- Service role bypasses RLS

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs" ON public.privacy_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- STEP 11: Documents Table RLS (if not already using auth_user_id)
-- ============================================================================
-- Documents use uploaded_by (UUID) referencing users.id
-- We need to join through users to check auth_user_id

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view documents
CREATE POLICY "All users can view documents" ON public.documents
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only ADMIN/CONTRIBUTOR can upload
CREATE POLICY "Contributors can upload documents" ON public.documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN', 'CONTRIBUTOR')
    )
  );

-- Only uploader or admin can update/delete
CREATE POLICY "Uploaders and admins can manage documents" ON public.documents
  FOR ALL
  USING (
    uploaded_by IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 1. List all RLS policies with their tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'conversations', 'chat_sessions', 'user_context',
    'conversation_memory', 'topic_progression', 'user_preferences',
    'data_export_requests', 'privacy_audit_log', 'documents'
  )
ORDER BY tablename, policyname;

-- 2. Check which tables have RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'conversations', 'chat_sessions', 'user_context',
    'conversation_memory', 'topic_progression', 'user_preferences',
    'data_export_requests', 'privacy_audit_log', 'documents'
  )
ORDER BY tablename;

-- 3. Test policy (run as authenticated user)
-- This should only return the current user's data
SELECT id, email, role
FROM public.users
WHERE deleted_at IS NULL;

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
/*
-- WARNING: This removes all new RLS policies
-- Only run if reverting to Clerk-based authentication

-- Disable RLS on all tables (allows full access - DANGEROUS!)
-- Use only temporarily while fixing issues
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_context DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_memory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_progression DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents DISABLE ROW LEVEL SECURITY;
*/

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. Run this migration AFTER Migration 005 (NOT NULL constraints)
-- 2. Test RLS policies in development environment first
-- 3. Verify auth.uid() returns correct UUID for authenticated users
-- 4. Monitor query performance after deployment (indexes may be needed)
-- 5. Test with different user roles (USER, CONTRIBUTOR, ADMIN)
-- 6. Proceed to Migration 007 for final cleanup
-- ============================================================================
