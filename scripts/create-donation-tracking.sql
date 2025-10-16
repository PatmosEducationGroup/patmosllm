-- ============================================================================
-- Donation Cost Transparency System
-- ============================================================================
-- Purpose: Track aggregated service usage for donation transparency (NOT billing)
-- Privacy: No prompt storage, opt-out available, user-facing data only
-- Design: Daily rollup aggregation (2:00 UTC), 24-month internal log retention
-- ============================================================================

-- ============================================================================
-- TABLE 1: daily_donation_estimates (user-facing aggregated data)
-- ============================================================================
-- Stores monthly cost estimate updated once daily via cron job
-- Users see this via /api/user/donation-estimate
-- RLS: Users can only read their own estimate

CREATE TABLE IF NOT EXISTS daily_donation_estimates (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  current_month_estimate_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_tokens_used BIGINT DEFAULT 0,
  total_operations INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE daily_donation_estimates IS 'Aggregated monthly donation estimates shown to users';
COMMENT ON COLUMN daily_donation_estimates.current_month_estimate_usd IS 'Total estimated cost for current calendar month (no floor/cap applied at storage)';
COMMENT ON COLUMN daily_donation_estimates.total_tokens_used IS 'Total LLM tokens consumed this month (input + output)';
COMMENT ON COLUMN daily_donation_estimates.total_operations IS 'Total operations this month (Pinecone queries, emails, etc.)';
COMMENT ON COLUMN daily_donation_estimates.last_updated IS 'Last rollup execution timestamp (should be ~2:00 UTC daily)';

-- ============================================================================
-- TABLE 2: usage_tracking_consent (privacy controls)
-- ============================================================================
-- Stores user consent for usage tracking (opt-out system, default enabled)
-- Users manage via /settings/privacy
-- RLS: Users can read and update their own consent

CREATE TABLE IF NOT EXISTS usage_tracking_consent (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  tracking_enabled BOOLEAN DEFAULT true,
  consent_given_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE usage_tracking_consent IS 'User consent for donation cost transparency tracking (opt-out available)';
COMMENT ON COLUMN usage_tracking_consent.tracking_enabled IS 'If false, no usage data logged for this user';

-- ============================================================================
-- TABLE 3: api_usage_internal_log (admin/debugging only)
-- ============================================================================
-- Stores raw usage events for aggregation and debugging
-- NOT exposed to users (service role only, no RLS policies for clients)
-- Expires after 24 months, cleaned daily via cron job
-- Idempotency: request_id with unique constraint prevents duplicate logs

CREATE TABLE IF NOT EXISTS api_usage_internal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- 'openai', 'voyage', 'pinecone', 'resend', 'supabase'
  total_tokens INTEGER DEFAULT 0, -- 0 for non-token operations
  operation_count INTEGER DEFAULT 1, -- 1 for token ops, varies for non-token
  estimated_cost_usd NUMERIC(10, 6), -- Raw cost (no floor/cap, can be $0.000001)
  request_id UUID, -- For idempotency (nullable for legacy/non-critical logs)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 months')
);

COMMENT ON TABLE api_usage_internal_log IS 'Internal usage log for donation rollup aggregation (admin only, 24-month retention)';
COMMENT ON COLUMN api_usage_internal_log.service IS 'Service identifier: openai, voyage, pinecone, resend, supabase';
COMMENT ON COLUMN api_usage_internal_log.total_tokens IS 'LLM tokens consumed (0 for non-token operations like Pinecone/email)';
COMMENT ON COLUMN api_usage_internal_log.operation_count IS 'Number of operations (1 for token ops, can be >1 for batch operations)';
COMMENT ON COLUMN api_usage_internal_log.estimated_cost_usd IS 'Raw calculated cost (no display floor/cap applied)';
COMMENT ON COLUMN api_usage_internal_log.request_id IS 'Idempotency key (prevents duplicate logs on retries)';
COMMENT ON COLUMN api_usage_internal_log.expires_at IS 'Auto-deletion timestamp (24 months from creation)';

-- ============================================================================
-- INDEXES (created AFTER tables, not inline)
-- ============================================================================

-- Donation estimates: lookup by auth_user_id for RLS checks
CREATE INDEX IF NOT EXISTS idx_donation_auth_user
  ON daily_donation_estimates (auth_user_id);

-- Consent: lookup by auth_user_id for privacy checks
CREATE INDEX IF NOT EXISTS idx_consent_auth_user
  ON usage_tracking_consent (auth_user_id);

-- Internal log: monthly rollup queries (user + date range)
CREATE INDEX IF NOT EXISTS idx_internal_user_month
  ON api_usage_internal_log (user_id, created_at DESC);

-- Internal log: cleanup job (delete expired logs)
CREATE INDEX IF NOT EXISTS idx_internal_expires
  ON api_usage_internal_log (expires_at);

-- Internal log: idempotency enforcement (unique request_id)
-- Partial index: only enforce uniqueness for non-null request_ids
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_request
  ON api_usage_internal_log (request_id)
  WHERE request_id IS NOT NULL;

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE daily_donation_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_internal_log ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can read their own donation estimate
CREATE POLICY read_own_estimate ON daily_donation_estimates
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Policy 2: Users can manage their own consent (read + update)
CREATE POLICY manage_own_consent ON usage_tracking_consent
  FOR ALL
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Policy 3: Internal log is admin-only (NO client access)
-- Revoke all public access (service role bypasses RLS for inserts)
REVOKE ALL ON api_usage_internal_log FROM PUBLIC;

COMMENT ON POLICY read_own_estimate ON daily_donation_estimates IS 'Users can only read their own monthly estimate';
COMMENT ON POLICY manage_own_consent ON usage_tracking_consent IS 'Users can view and update their own tracking consent';

-- ============================================================================
-- EXTENSION: pg_cron (required for scheduled jobs)
-- ============================================================================
-- Enable pg_cron extension for job scheduling
-- If this fails with permission error, enable manually via:
-- Supabase Dashboard → Database → Extensions → Search "pg_cron" → Enable

CREATE EXTENSION IF NOT EXISTS pg_cron;

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL (used for daily donation rollup and log cleanup)';

-- ============================================================================
-- CRON JOBS (Supabase pg_cron extension)
-- ============================================================================
-- Note: All times are UTC. 2:00 UTC = 7pm PST / 10pm EST (low traffic)
-- Job 1 (2:00 UTC): Daily rollup aggregation
-- Job 2 (2:15 UTC): Cleanup expired logs (runs after rollup completes)

-- Job 1: Daily donation estimate rollup (runs at 2:00 UTC)
-- Aggregates current month's internal logs into user-facing estimate table
-- Uses ON CONFLICT to update existing rows (idempotent)
SELECT cron.schedule(
  'daily-donation-rollup',
  '0 2 * * *', -- Every day at 2:00 AM UTC
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
    user_id,
    (SELECT auth_user_id FROM users WHERE id = user_id LIMIT 1) AS auth_user_id,
    ROUND(SUM(estimated_cost_usd)::NUMERIC, 2) AS current_month_estimate_usd,
    SUM(total_tokens) AS total_tokens_used,
    SUM(operation_count) AS total_operations,
    NOW() AS last_updated
  FROM api_usage_internal_log
  WHERE created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY user_id
  ON CONFLICT (user_id)
  DO UPDATE SET
    current_month_estimate_usd = EXCLUDED.current_month_estimate_usd,
    total_tokens_used = EXCLUDED.total_tokens_used,
    total_operations = EXCLUDED.total_operations,
    last_updated = NOW();
  $$
);

-- Job 2: Cleanup expired internal logs (runs at 2:15 UTC, after rollup)
-- Deletes logs older than 24 months (expires_at < NOW())
-- Keeps internal log table size manageable
SELECT cron.schedule(
  'cleanup-old-donation-logs',
  '15 2 * * *', -- Every day at 2:15 AM UTC (15 minutes after rollup)
  $$
  DELETE FROM api_usage_internal_log
  WHERE expires_at < NOW();
  $$
);

-- ============================================================================
-- MIGRATION VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Donation tracking migration complete';
  RAISE NOTICE '   - Tables: daily_donation_estimates, usage_tracking_consent, api_usage_internal_log';
  RAISE NOTICE '   - Indexes: 5 indexes (auth_user lookups, rollup queries, idempotency)';
  RAISE NOTICE '   - RLS: Enabled on all tables (internal log is admin-only)';
  RAISE NOTICE '   - Cron: 2 jobs scheduled (2:00 UTC rollup, 2:15 UTC cleanup)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Run this migration: psql $DATABASE_URL < scripts/create-donation-tracking.sql';
  RAISE NOTICE '   2. Deploy donation-cost-calculator.ts and donation-tracker.ts';
  RAISE NOTICE '   3. Add tracking calls in 6-8 code locations';
  RAISE NOTICE '   4. Create frontend components (DonationEstimateBadge, /settings/donate)';
  RAISE NOTICE '   5. Add opt-out toggle to /settings/privacy';
END $$;
