-- GDPR Phase 5: Add consent tracking columns to users table
-- Date: 2025-10-15
-- Purpose: Track user consent for Terms of Service, Privacy Policy, Cookies, and Age Verification
-- Risk: Low - All columns are nullable for backward compatibility with existing users

-- Add consent tracking columns (all nullable for backward compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_accepted_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cookie_consent VARCHAR(20); -- 'all' | 'essential'
ALTER TABLE users ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

-- Verify columns added successfully
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN (
  'terms_accepted_version',
  'terms_accepted_at',
  'privacy_policy_accepted_version',
  'privacy_policy_accepted_at',
  'cookie_consent',
  'cookie_consent_at',
  'age_verified',
  'age_verified_at'
)
ORDER BY column_name;

-- Expected output:
-- age_verified                    | boolean                    | YES | false
-- age_verified_at                 | timestamp with time zone   | YES |
-- cookie_consent                  | character varying          | YES |
-- cookie_consent_at               | timestamp with time zone   | YES |
-- privacy_policy_accepted_at      | timestamp with time zone   | YES |
-- privacy_policy_accepted_version | character varying          | YES |
-- terms_accepted_at               | timestamp with time zone   | YES |
-- terms_accepted_version          | character varying          | YES |

-- Rollback script (if needed):
-- ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_version;
-- ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS privacy_policy_accepted_version;
-- ALTER TABLE users DROP COLUMN IF EXISTS privacy_policy_accepted_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS cookie_consent;
-- ALTER TABLE users DROP COLUMN IF EXISTS cookie_consent_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS age_verified;
-- ALTER TABLE users DROP COLUMN IF EXISTS age_verified_at;
