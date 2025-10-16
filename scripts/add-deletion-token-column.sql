-- ============================================================================
-- Add deletion_token column for magic link cancellation
-- ============================================================================
-- Purpose: Allow users to cancel deletion from email without re-authentication
-- GDPR Compliance: Provides easy access to cancel deletion (Article 17)
-- ============================================================================

-- Add deletion_token column (nullable, unique)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deletion_token uuid UNIQUE;

-- Add deletion_token_expires_at for security
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deletion_token_expires_at timestamptz;

-- Create index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_users_deletion_token
ON public.users(deletion_token)
WHERE deletion_token IS NOT NULL;

-- Verify columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('deletion_token', 'deletion_token_expires_at')
ORDER BY column_name;
