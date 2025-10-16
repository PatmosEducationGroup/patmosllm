-- ============================================================================
-- Backfill Historical Donation Usage - ALL USERS
-- ============================================================================
-- Estimates historical usage costs from existing conversation data
-- Safe to run multiple times (uses conversation_id as idempotency key)
--
-- ⚠️  WARNING: This will process ALL users in the database
-- ⚠️  Test with backfill-donation-single-user.sql first!
-- ============================================================================

-- Step 1: Show user statistics before backfill
DO $$
DECLARE
  v_total_users INTEGER;
  v_users_with_conversations INTEGER;
  v_opted_out_users INTEGER;
BEGIN
  -- Count total users
  SELECT COUNT(*) INTO v_total_users FROM users WHERE deleted_at IS NULL;

  -- Count users with conversations
  SELECT COUNT(DISTINCT user_id) INTO v_users_with_conversations
  FROM conversations;

  -- Count opted out users
  SELECT COUNT(*) INTO v_opted_out_users
  FROM usage_tracking_consent
  WHERE tracking_enabled = false;

  RAISE NOTICE '📊 Database Statistics';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'Total active users: %', v_total_users;
  RAISE NOTICE 'Users with conversations: %', v_users_with_conversations;
  RAISE NOTICE 'Users opted out: %', v_opted_out_users;
  RAISE NOTICE 'Users to backfill: %', v_users_with_conversations - v_opted_out_users;
  RAISE NOTICE '';
END $$;

-- Step 2: Preview backfill data (first 20 Q&A pairs across all users)
SELECT
  u.email,
  c.id AS qa_pair_id,
  c.session_id,
  c.created_at,
  LENGTH(c.question) AS question_chars,
  LENGTH(c.answer) AS answer_chars,
  -- Calculate total character count (question + answer)
  (LENGTH(c.question) + LENGTH(c.answer)) AS total_chars,
  -- Estimate tokens (4 chars = 1 token)
  ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0) AS estimated_tokens,
  -- Calculate cost
  ROUND(
    (
      (
        ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0) + 100
      ) / 10000.0 * 0.005 * 1.10
    )::NUMERIC,
    6
  ) AS estimated_cost_usd
FROM conversations c
JOIN users u ON u.id = c.user_id
WHERE u.deleted_at IS NULL
  AND c.question IS NOT NULL
  AND c.answer IS NOT NULL
  AND LENGTH(c.question) > 0
  AND LENGTH(c.answer) > 0
  -- Respect opt-out
  AND NOT EXISTS (
    SELECT 1 FROM usage_tracking_consent
    WHERE user_id = c.user_id AND tracking_enabled = false
  )
  -- Skip already backfilled
  AND NOT EXISTS (
    SELECT 1 FROM api_usage_internal_log
    WHERE request_id = c.id
  )
ORDER BY c.created_at DESC
LIMIT 20;

-- Step 3: Backfill api_usage_internal_log for ALL users
INSERT INTO api_usage_internal_log (
  id,
  user_id,
  service,
  total_tokens,
  operation_count,
  estimated_cost_usd,
  request_id,
  created_at,
  expires_at
)
SELECT
  gen_random_uuid() AS id,
  c.user_id,
  'openai' AS service,
  -- Estimate tokens: (question + answer) characters / 4
  GREATEST(
    ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0),
    0
  )::BIGINT AS total_tokens,
  1 AS operation_count,  -- 1 Pinecone query per Q&A pair
  -- Calculate cost using same formula as donation-cost-calculator.ts
  GREATEST(
    ROUND(
      (
        (
          GREATEST(
            ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0),
            0
          ) + 100
        ) / 10000.0 * 0.005 * 1.10
      )::NUMERIC,
      6
    ),
    0.000001  -- Minimum cost
  ) AS estimated_cost_usd,
  c.id AS request_id,  -- Use Q&A pair ID for idempotency
  c.created_at,
  c.created_at + INTERVAL '24 months' AS expires_at
FROM conversations c
JOIN users u ON u.id = c.user_id
WHERE u.deleted_at IS NULL
  -- Only backfill Q&A pairs with both question and answer
  AND c.question IS NOT NULL
  AND c.answer IS NOT NULL
  AND LENGTH(c.question) > 0
  AND LENGTH(c.answer) > 0
  -- Respect opt-out consent
  AND NOT EXISTS (
    SELECT 1 FROM usage_tracking_consent
    WHERE user_id = c.user_id AND tracking_enabled = false
  )
  -- Skip if already backfilled (idempotency)
  AND NOT EXISTS (
    SELECT 1 FROM api_usage_internal_log
    WHERE request_id = c.id
  )
ORDER BY c.created_at;

-- Step 4: Show summary by user
DO $$
DECLARE
  v_backfilled_users INTEGER;
  v_backfilled_conversations INTEGER;
  v_total_tokens BIGINT;
  v_total_cost NUMERIC;
BEGIN
  -- Get backfill statistics
  SELECT
    COUNT(DISTINCT user_id),
    COUNT(*),
    COALESCE(SUM(total_tokens), 0),
    COALESCE(SUM(estimated_cost_usd), 0)
  INTO v_backfilled_users, v_backfilled_conversations, v_total_tokens, v_total_cost
  FROM api_usage_internal_log;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Backfill Complete - ALL USERS';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'Users backfilled: %', v_backfilled_users;
  RAISE NOTICE 'Q&A pairs backfilled: %', v_backfilled_conversations;
  RAISE NOTICE 'Total tokens estimated: %', v_total_tokens;
  RAISE NOTICE 'Total cost across all users: $%', ROUND(v_total_cost, 2);
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Run scripts/run-donation-rollup-now.sql';
END $$;

-- Step 5: Show per-user breakdown (top 20 by estimated cost)
SELECT
  u.email,
  COUNT(l.id) AS log_count,
  SUM(l.total_tokens) AS total_tokens,
  ROUND(SUM(l.estimated_cost_usd)::NUMERIC, 2) AS total_cost_usd
FROM api_usage_internal_log l
JOIN users u ON u.id = l.user_id
GROUP BY u.email
ORDER BY total_cost_usd DESC
LIMIT 20;
