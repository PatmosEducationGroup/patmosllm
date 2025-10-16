-- ============================================================================
-- Donation Cost Transparency System (IDEMPOTENT VERSION)
-- ============================================================================
-- Safe to run multiple times - uses IF NOT EXISTS and DROP IF EXISTS
-- ============================================================================

-- Enable pg_cron extension (safe if already exists)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- TABLE 1: daily_donation_estimates (user-facing aggregated data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_donation_estimates (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  current_month_estimate_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_tokens_used BIGINT DEFAULT 0,
  total_operations INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop and recreate policies (to handle changes)
DROP POLICY IF EXISTS read_own_estimate ON daily_donation_estimates;
DROP POLICY IF EXISTS no_user_writes ON daily_donation_estimates;

-- RLS Policies
ALTER TABLE daily_donation_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_own_estimate ON daily_donation_estimates
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY no_user_writes ON daily_donation_estimates
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_estimates_auth_user
  ON daily_donation_estimates (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_daily_estimates_updated
  ON daily_donation_estimates (last_updated);

-- ============================================================================
-- TABLE 2: usage_tracking_consent (opt-out system)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_tracking_consent (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  consent_given_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop and recreate policies
DROP POLICY IF EXISTS read_own_consent ON usage_tracking_consent;
DROP POLICY IF EXISTS update_own_consent ON usage_tracking_consent;

ALTER TABLE usage_tracking_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_own_consent ON usage_tracking_consent
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY update_own_consent ON usage_tracking_consent
  FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consent_auth_user
  ON usage_tracking_consent (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_consent_enabled
  ON usage_tracking_consent (tracking_enabled);

-- ============================================================================
-- TABLE 3: api_usage_internal_log (admin-only raw logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_usage_internal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  total_tokens BIGINT DEFAULT 0,
  operation_count INTEGER DEFAULT 1,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL,
  request_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 months')
);

-- Drop and recreate policies
DROP POLICY IF EXISTS admin_only_read ON api_usage_internal_log;

ALTER TABLE api_usage_internal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_only_read ON api_usage_internal_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'ADMIN'
    )
  );

REVOKE ALL ON api_usage_internal_log FROM PUBLIC;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_internal_log_user
  ON api_usage_internal_log (user_id);

CREATE INDEX IF NOT EXISTS idx_internal_log_created
  ON api_usage_internal_log (created_at);

CREATE INDEX IF NOT EXISTS idx_internal_log_expires
  ON api_usage_internal_log (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_request
  ON api_usage_internal_log (request_id)
  WHERE request_id IS NOT NULL;

-- ============================================================================
-- CRON JOBS
-- ============================================================================

-- Remove existing jobs if they exist
SELECT cron.unschedule('daily-donation-rollup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-donation-rollup'
);

SELECT cron.unschedule('cleanup-expired-logs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-logs'
);

-- Job 1: Daily rollup at 2:00 UTC
SELECT cron.schedule(
  'daily-donation-rollup',
  '0 2 * * *',
  $$
  INSERT INTO daily_donation_estimates (
    user_id,
    auth_user_id,
    current_month_estimate_usd,
    total_tokens_used,
    total_operations,
    last_updated
  )
  SELECT
    l.user_id,
    u.auth_user_id,
    ROUND(SUM(l.estimated_cost_usd)::NUMERIC, 2) AS current_month_estimate_usd,
    SUM(l.total_tokens) AS total_tokens_used,
    SUM(l.operation_count) AS total_operations,
    NOW() AS last_updated
  FROM api_usage_internal_log l
  JOIN users u ON u.id = l.user_id
  WHERE l.created_at >= date_trunc('month', CURRENT_DATE)
    AND u.auth_user_id IS NOT NULL
  GROUP BY l.user_id, u.auth_user_id
  ON CONFLICT (user_id)
  DO UPDATE SET
    current_month_estimate_usd = EXCLUDED.current_month_estimate_usd,
    total_tokens_used = EXCLUDED.total_tokens_used,
    total_operations = EXCLUDED.total_operations,
    last_updated = NOW();
  $$
);

-- Job 2: Cleanup expired logs at 2:15 UTC
SELECT cron.schedule(
  'cleanup-expired-logs',
  '15 2 * * *',
  $$
  DELETE FROM api_usage_internal_log
  WHERE expires_at < NOW();
  $$
);

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Donation tracking system installed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - daily_donation_estimates';
  RAISE NOTICE '  - usage_tracking_consent';
  RAISE NOTICE '  - api_usage_internal_log';
  RAISE NOTICE '';
  RAISE NOTICE 'Cron jobs scheduled:';
  RAISE NOTICE '  - daily-donation-rollup (2:00 UTC)';
  RAISE NOTICE '  - cleanup-expired-logs (2:15 UTC)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run: npx tsx scripts/test-donation-tracking.ts';
  RAISE NOTICE '  2. Visit: http://localhost:3000/settings/donate';
END $$;
