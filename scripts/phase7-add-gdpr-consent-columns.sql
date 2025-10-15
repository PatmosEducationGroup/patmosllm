-- ============================================================================
-- PHASE 7: ADD GDPR CONSENT COLUMNS TO USERS TABLE
-- ============================================================================
-- This script adds consent tracking columns needed for the invitation system
-- Run this in Supabase SQL Editor (PRODUCTION)
-- ============================================================================

-- Add consent tracking columns (nullable for backward compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cookies_accepted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version VARCHAR(20) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.age_confirmed IS 'User confirmed they are 13+ years old (COPPA compliance)';
COMMENT ON COLUMN users.terms_accepted_at IS 'Timestamp when user accepted Terms of Service';
COMMENT ON COLUMN users.privacy_accepted_at IS 'Timestamp when user accepted Privacy Policy';
COMMENT ON COLUMN users.cookies_accepted_at IS 'Timestamp when user accepted Cookie Policy (optional)';
COMMENT ON COLUMN users.consent_version IS 'Version of T&C/Privacy Policy user agreed to (e.g., "1.0")';

-- Verify columns added successfully
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN (
  'age_confirmed',
  'terms_accepted_at',
  'privacy_accepted_at',
  'cookies_accepted_at',
  'consent_version'
)
ORDER BY column_name;

-- Expected output:
-- age_confirmed        | boolean                  | YES | NULL
-- consent_version      | character varying        | YES | NULL
-- cookies_accepted_at  | timestamp with time zone | YES | NULL
-- privacy_accepted_at  | timestamp with time zone | YES | NULL
-- terms_accepted_at    | timestamp with time zone | YES | NULL

-- ============================================================================
-- Rollback script (if needed):
-- ============================================================================
-- ALTER TABLE users DROP COLUMN IF EXISTS age_confirmed;
-- ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS privacy_accepted_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS cookies_accepted_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS consent_version;
