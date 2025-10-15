-- ============================================================================
-- PHASE 7: CREATE INVITATION TOKENS TABLE
-- ============================================================================
-- This script creates the invitation_tokens table for Supabase invite-only auth
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Create invitation_tokens table
CREATE TABLE IF NOT EXISTS public.invitation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CONTRIBUTOR', 'USER')),
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON public.invitation_tokens(token);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_email ON public.invitation_tokens(email);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_expires_at ON public.invitation_tokens(expires_at);

-- Enable Row Level Security
ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all invitations
CREATE POLICY "Admins can view all invitations"
ON public.invitation_tokens
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'ADMIN'
  )
);

-- RLS Policy: Admins can create invitations
CREATE POLICY "Admins can create invitations"
ON public.invitation_tokens
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'ADMIN'
  )
);

-- RLS Policy: Admins can update invitations
CREATE POLICY "Admins can update invitations"
ON public.invitation_tokens
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'ADMIN'
  )
);

-- RLS Policy: Public can read invitations by token (needed for acceptance page)
CREATE POLICY "Public can read invitations by token"
ON public.invitation_tokens
FOR SELECT
TO anon
USING (
  expires_at > NOW()
  AND accepted_at IS NULL
);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_invitation_tokens_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create trigger to call the function
DROP TRIGGER IF EXISTS trigger_update_invitation_tokens_updated_at ON public.invitation_tokens;
CREATE TRIGGER trigger_update_invitation_tokens_updated_at
BEFORE UPDATE ON public.invitation_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_invitation_tokens_updated_at();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify table was created
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invitation_tokens'
ORDER BY ordinal_position;

-- Verify indexes were created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'invitation_tokens'
  AND schemaname = 'public';

-- Verify RLS is enabled
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'invitation_tokens'
  AND schemaname = 'public';

-- Verify policies were created
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'invitation_tokens';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Phase 7: invitation_tokens table created successfully!';
  RAISE NOTICE '   - Table created with proper schema';
  RAISE NOTICE '   - 3 indexes created for fast lookups';
  RAISE NOTICE '   - RLS enabled with 4 policies';
  RAISE NOTICE '   - Auto-update trigger configured';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next Step: Create invitation token generation API';
END $$;
