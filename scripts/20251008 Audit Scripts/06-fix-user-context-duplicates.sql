-- ============================================================================
-- Fix user_context Duplicate Records
-- ============================================================================
-- Problem: user_context has no unique constraint on user_id
-- Result: Multiple records per user (up to 78 duplicates!)
-- Solution: Keep most recent record per user, delete rest, add constraint
-- ============================================================================

-- ============================================================================
-- STEP 1: Preview what will be deleted
-- ============================================================================
-- This shows all duplicate records that will be deleted (keeps most recent)
SELECT
  uc.id,
  uc.user_id,
  u.email,
  uc.updated_at,
  ROW_NUMBER() OVER (PARTITION BY uc.user_id ORDER BY uc.updated_at DESC) as row_num
FROM user_context uc
JOIN users u ON u.id = uc.user_id
WHERE uc.user_id IN (
  SELECT user_id
  FROM user_context
  GROUP BY user_id
  HAVING COUNT(*) > 1
)
ORDER BY uc.user_id, uc.updated_at DESC;

-- Row_num = 1 will be KEPT (most recent)
-- Row_num > 1 will be DELETED

-- ============================================================================
-- STEP 2: Count how many records will be deleted
-- ============================================================================
SELECT COUNT(*) as records_to_delete
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) as row_num
  FROM user_context
) ranked
WHERE row_num > 1;

-- ============================================================================
-- STEP 3: Delete duplicate records (DESTRUCTIVE - RUN ONLY ONCE!)
-- ============================================================================
-- ⚠️ WARNING: This permanently deletes old user_context records
-- Only the most recent record per user will be kept

DELETE FROM user_context
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) as row_num
    FROM user_context
  ) ranked
  WHERE row_num > 1
);

-- ============================================================================
-- STEP 4: Add unique constraint to prevent future duplicates
-- ============================================================================
ALTER TABLE user_context
ADD CONSTRAINT user_context_user_id_unique UNIQUE (user_id);

-- ============================================================================
-- STEP 5: Verify cleanup
-- ============================================================================
-- Check for any remaining duplicates (should return 0 rows)
SELECT user_id, COUNT(*) as count
FROM user_context
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Verify total count matches user count
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM user_context) as unique_user_contexts,
  (SELECT COUNT(*) FROM user_context) as total_user_contexts;

-- Should be equal!

-- ============================================================================
-- STEP 6: Update the transaction function to use the unique constraint
-- ============================================================================
-- Now that we have a unique constraint, we can use ON CONFLICT
-- Run this to replace the function:

CREATE OR REPLACE FUNCTION log_conversation_transaction(
  p_user_id UUID,
  p_session_id UUID,
  p_conversation_id UUID,
  p_question_text TEXT,
  p_question_intent VARCHAR(50),
  p_question_complexity NUMERIC(3,2),
  p_extracted_topics TEXT[],
  p_user_satisfaction INTEGER,
  p_had_search_results BOOLEAN,
  p_topic_familiarity JSONB,
  p_question_patterns JSONB,
  p_behavioral_insights JSONB,
  p_current_session_topics TEXT[],
  p_cross_session_connections JSONB
) RETURNS JSONB AS $$
DECLARE
  v_conversation_memory_id UUID;
  v_result JSONB;
BEGIN
  -- Insert conversation memory
  INSERT INTO conversation_memory (
    user_id, session_id, conversation_id, question_text,
    question_intent, question_complexity, ambiguity_score,
    extracted_topics, user_satisfaction, clarification_requested,
    follow_up_generated, is_follow_up, related_conversation_ids,
    personalized_threshold, recommended_complexity, had_search_results
  ) VALUES (
    p_user_id, p_session_id, p_conversation_id, p_question_text,
    p_question_intent, p_question_complexity, 0.0,
    p_extracted_topics, p_user_satisfaction, FALSE,
    FALSE, FALSE, ARRAY[]::UUID[],
    NULL, NULL, p_had_search_results
  )
  RETURNING id INTO v_conversation_memory_id;

  -- Upsert user context (NOW USES UNIQUE CONSTRAINT!)
  INSERT INTO user_context (
    user_id, topic_familiarity, question_patterns,
    behavioral_insights, current_session_topics,
    cross_session_connections, updated_at
  ) VALUES (
    p_user_id, p_topic_familiarity, p_question_patterns,
    p_behavioral_insights, p_current_session_topics,
    p_cross_session_connections, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    topic_familiarity = EXCLUDED.topic_familiarity,
    question_patterns = EXCLUDED.question_patterns,
    behavioral_insights = EXCLUDED.behavioral_insights,
    current_session_topics = EXCLUDED.current_session_topics,
    cross_session_connections = EXCLUDED.cross_session_connections,
    updated_at = NOW();

  -- Update topic progression
  IF p_extracted_topics IS NOT NULL AND array_length(p_extracted_topics, 1) > 0 THEN
    FOR i IN 1..array_length(p_extracted_topics, 1) LOOP
      INSERT INTO topic_progression (
        user_id, topic_name, expertise_level,
        first_interaction_date, last_interaction_date,
        total_interactions, successful_interactions,
        progression_rate, plateau_detected, connected_topics
      ) VALUES (
        p_user_id, p_extracted_topics[i], 0.10,
        NOW(), NOW(), 1,
        CASE WHEN p_user_satisfaction >= 4 THEN 1 ELSE 0 END,
        0.000, FALSE, ARRAY[]::TEXT[]
      )
      ON CONFLICT (user_id, topic_name) DO UPDATE SET
        last_interaction_date = NOW(),
        total_interactions = topic_progression.total_interactions + 1,
        successful_interactions = topic_progression.successful_interactions +
          CASE WHEN p_user_satisfaction >= 4 THEN 1 ELSE 0 END,
        expertise_level = LEAST(0.99, topic_progression.expertise_level + 0.05),
        progression_rate = LEAST(9.999,
          (LEAST(0.99, topic_progression.expertise_level + 0.05) - topic_progression.expertise_level) /
          GREATEST(1, EXTRACT(EPOCH FROM (NOW() - topic_progression.first_interaction_date)) / 86400)
        ),
        updated_at = NOW();
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'success', TRUE,
    'conversation_memory_id', v_conversation_memory_id,
    'user_id', p_user_id,
    'topics_processed', COALESCE(array_length(p_extracted_topics, 1), 0),
    'timestamp', NOW()
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  v_result := jsonb_build_object(
    'success', FALSE,
    'error', SQLERRM,
    'error_detail', SQLSTATE,
    'error_hint', 'Check that all required fields are provided and foreign keys exist',
    'timestamp', NOW()
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION log_conversation_transaction TO service_role;
GRANT EXECUTE ON FUNCTION log_conversation_transaction TO authenticated;
