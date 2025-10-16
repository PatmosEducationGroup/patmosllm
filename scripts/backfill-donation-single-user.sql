-- ============================================================================
-- Backfill Historical Donation Usage - Single User
-- ============================================================================
-- Estimates historical usage costs from existing conversation data
-- Safe to run multiple times (uses conversation_id as idempotency key)
--
-- USAGE: Replace 'mray523@proton.me' with the target user email
-- ============================================================================

-- Step 1: Verify user exists and check consent
DO $$
DECLARE
  v_user_id UUID;
  v_auth_user_id UUID;
  v_has_consent BOOLEAN;
BEGIN
  -- Get user IDs
  SELECT id, auth_user_id INTO v_user_id, v_auth_user_id
  FROM users
  WHERE email = 'mray523@proton.me';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: mray523@proton.me';
  END IF;

  -- Check consent (default to true if no record)
  SELECT COALESCE(tracking_enabled, true) INTO v_has_consent
  FROM usage_tracking_consent
  WHERE user_id = v_user_id;

  IF NOT v_has_consent THEN
    RAISE NOTICE 'User has opted out of tracking - skipping backfill';
    RETURN;
  END IF;

  RAISE NOTICE 'User found: % (auth_user_id: %)', v_user_id, v_auth_user_id;
  RAISE NOTICE 'Consent: % - proceeding with backfill', v_has_consent;
END $$;

-- Step 2: Show preview of what will be backfilled
SELECT
  c.id AS qa_pair_id,
  c.session_id,
  c.created_at,
  LENGTH(c.question) AS question_chars,
  LENGTH(c.answer) AS answer_chars,
  -- Calculate total character count (question + answer)
  (LENGTH(c.question) + LENGTH(c.answer)) AS total_chars,
  -- Estimate tokens (4 chars = 1 token)
  ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0) AS estimated_tokens,
  -- Calculate cost: (tokens/10k * $0.005 + 1 operation * 100 equiv tokens) * 1.10 overhead
  ROUND(
    (
      (
        ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0) + 100  -- Add 100 token-equivalents for Pinecone query
      ) / 10000.0 * 0.005 * 1.10
    )::NUMERIC,
    6
  ) AS estimated_cost_usd
FROM conversations c
WHERE c.user_id = (SELECT id FROM users WHERE email = 'mray523@proton.me')
ORDER BY c.created_at DESC
LIMIT 10;

-- Step 3: Backfill api_usage_internal_log with historical data
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
  'openai' AS service,  -- Blended cost, use 'openai' as primary service
  -- Estimate tokens: (question + answer) characters / 4
  GREATEST(
    ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0),
    0
  )::BIGINT AS total_tokens,
  1 AS operation_count,  -- 1 Pinecone query per Q&A pair
  -- Calculate cost using same formula as donation-cost-calculator.ts
  -- Formula: ((tokens + op_count * 100) / 10k * $0.005) * 1.10 overhead
  GREATEST(
    ROUND(
      (
        (
          GREATEST(
            ROUND((LENGTH(c.question) + LENGTH(c.answer))::NUMERIC / 4.0),
            0
          ) + 100  -- 100 token-equivalents for operation
        ) / 10000.0 * 0.005 * 1.10
      )::NUMERIC,
      6
    ),
    0.000001  -- Minimum cost: $0.000001
  ) AS estimated_cost_usd,
  c.id AS request_id,  -- Use Q&A pair ID for idempotency
  c.created_at,
  c.created_at + INTERVAL '24 months' AS expires_at
FROM conversations c
WHERE c.user_id = (SELECT id FROM users WHERE email = 'mray523@proton.me')
  -- Only backfill Q&A pairs with both question and answer
  AND c.question IS NOT NULL
  AND c.answer IS NOT NULL
  AND LENGTH(c.question) > 0
  AND LENGTH(c.answer) > 0
  -- Skip if already backfilled (idempotency check)
  AND NOT EXISTS (
    SELECT 1 FROM api_usage_internal_log
    WHERE request_id = c.id
  )
ORDER BY c.created_at;

-- Step 4: Show summary of backfilled data
DO $$
DECLARE
  v_user_id UUID;
  v_total_conversations INTEGER;
  v_total_logs INTEGER;
  v_total_tokens BIGINT;
  v_total_cost NUMERIC;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE email = 'mray523@proton.me';

  -- Get conversation count
  SELECT COUNT(*) INTO v_total_conversations
  FROM conversations
  WHERE user_id = v_user_id;

  -- Get log statistics
  SELECT
    COUNT(*),
    COALESCE(SUM(total_tokens), 0),
    COALESCE(SUM(estimated_cost_usd), 0)
  INTO v_total_logs, v_total_tokens, v_total_cost
  FROM api_usage_internal_log
  WHERE user_id = v_user_id;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Backfill Summary for mray523@proton.me';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'Total Q&A pairs: %', v_total_conversations;
  RAISE NOTICE 'Total usage logs: %', v_total_logs;
  RAISE NOTICE 'Total tokens estimated: %', v_total_tokens;
  RAISE NOTICE 'Total cost: $%', ROUND(v_total_cost, 2);
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Run scripts/run-donation-rollup-now.sql';
END $$;
