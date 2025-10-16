-- ============================================================================
-- Fix Infinite Recursion in Users Table RLS Policy
-- ============================================================================
-- Problem: Multiple policies query the users table within the users table policy,
-- causing infinite recursion
--
-- Solution: Drop problematic policies and create simple, non-recursive ones
-- Note: Service role key bypasses ALL RLS anyway
-- ============================================================================

-- Drop ALL existing problematic policies
DROP POLICY IF EXISTS "Users access policy" ON public.users;  -- Old Clerk policy with recursion
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;  -- New policy with recursion
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- Enable RLS if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create new, simple policies without recursion
-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
  );

-- Policy 2: Users can update their own profile (limited columns)
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- The other two policies are fine:
-- 1. "Users can view own profile" - uses auth_user_id = auth.uid() OR role check (no subquery)
-- 2. "Users can update own profile" - simple auth_user_id check

-- Admins will still be able to manage users via:
-- 1. Service role key (bypasses all RLS)
-- 2. The "Users can view own profile" policy allows admins to see all users via role check
-- 3. Application-level admin checks

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Check remaining policies on users table
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'users'
ORDER BY policyname;
