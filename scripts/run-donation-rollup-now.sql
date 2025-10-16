-- ============================================================================
-- Manual Donation Rollup (Run Immediately)
-- ============================================================================
-- This script manually runs the daily aggregation job
-- Use this to populate initial data or run an immediate update
-- ============================================================================

-- Run the exact same aggregation logic as the cron job
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
  AND u.auth_user_id IS NOT NULL  -- Skip users without auth_user_id (migration edge case)
GROUP BY l.user_id, u.auth_user_id
ON CONFLICT (user_id)
DO UPDATE SET
  current_month_estimate_usd = EXCLUDED.current_month_estimate_usd,
  total_tokens_used = EXCLUDED.total_tokens_used,
  total_operations = EXCLUDED.total_operations,
  last_updated = NOW();

-- Show results
SELECT
  u.email,
  d.current_month_estimate_usd,
  d.total_tokens_used,
  d.total_operations,
  d.last_updated
FROM daily_donation_estimates d
JOIN users u ON u.id = d.user_id
ORDER BY d.current_month_estimate_usd DESC;
