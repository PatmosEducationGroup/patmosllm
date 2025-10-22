-- ============================================================================
-- ADD NAME COLUMN TO INVITATION_TOKENS TABLE
-- ============================================================================
-- This script adds a name column to the invitation_tokens table
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add name column to invitation_tokens table
ALTER TABLE public.invitation_tokens
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add comment to document the column
COMMENT ON COLUMN public.invitation_tokens.name IS 'Optional name for the invitee';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invitation_tokens'
  AND column_name = 'name';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Name column added to invitation_tokens table successfully!';
  RAISE NOTICE '   - Column: name (TEXT, nullable)';
  RAISE NOTICE '';
END $$;
