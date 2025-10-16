-- ============================================================================
-- Add name column to users table
-- ============================================================================

-- Check if name column exists, add if it doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.users
    ADD COLUMN name TEXT;

    COMMENT ON COLUMN public.users.name IS 'User''s full name';

    -- Populate name from email prefix for existing users
    UPDATE public.users
    SET name = SPLIT_PART(email, '@', 1)
    WHERE name IS NULL AND email IS NOT NULL;

    RAISE NOTICE 'Added name column to users table and populated from email prefixes';
  ELSE
    RAISE NOTICE 'Name column already exists in users table';
  END IF;
END $$;
