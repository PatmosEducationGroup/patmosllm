-- Add preferences column to user_preferences table
-- This column stores email preferences and other user settings as JSONB

-- Check if column exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_preferences'
    AND column_name = 'preferences'
  ) THEN
    -- Add the preferences column as JSONB with default empty object
    ALTER TABLE user_preferences
    ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb;

    RAISE NOTICE 'Successfully added preferences column to user_preferences table';
  ELSE
    RAISE NOTICE 'preferences column already exists, skipping';
  END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_preferences'
ORDER BY ordinal_position;
