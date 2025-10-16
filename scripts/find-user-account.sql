-- ============================================================================
-- Find User Account by Email
-- ============================================================================
-- Usage: Replace 'mray523@proton.me' with the email you want to lookup
-- ============================================================================

SELECT
  id AS user_id,
  auth_user_id,
  email,
  name,
  role,
  created_at,
  deleted_at
FROM users
WHERE email = 'mray523@proton.me';

-- Optional: Get conversation statistics for this user
SELECT
  u.email,
  u.id AS user_id,
  COUNT(DISTINCT c.session_id) AS total_conversations,
  COUNT(DISTINCT c.session_id) FILTER (WHERE c.created_at >= date_trunc('month', CURRENT_DATE)) AS conversations_this_month,
  COUNT(c.id) AS total_qa_pairs,
  COUNT(c.id) FILTER (WHERE c.created_at >= date_trunc('month', CURRENT_DATE)) AS qa_pairs_this_month,
  SUM(LENGTH(c.question) + LENGTH(c.answer)) AS total_characters,
  MIN(c.created_at) AS first_conversation,
  MAX(c.created_at) AS last_conversation
FROM users u
LEFT JOIN conversations c ON c.user_id = u.id
WHERE u.email = 'mray523@proton.me'
GROUP BY u.email, u.id;

-- Optional: Check if they have any existing usage logs
SELECT
  COUNT(*) AS existing_log_count,
  MIN(created_at) AS first_log,
  MAX(created_at) AS last_log,
  SUM(estimated_cost_usd) AS total_cost_logged
FROM api_usage_internal_log
WHERE user_id = (SELECT id FROM users WHERE email = 'mray523@proton.me');

-- Optional: Check current donation estimate (if exists)
SELECT
  current_month_estimate_usd,
  total_tokens_used,
  total_operations,
  last_updated
FROM daily_donation_estimates
WHERE user_id = (SELECT id FROM users WHERE email = 'mray523@proton.me');
