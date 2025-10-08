-- ============================================================================
-- Conversation Memory Transaction Function (FIXED)
-- ============================================================================
-- Purpose: Atomically log conversation with memory updates
-- Tables: conversation_memory, user_context, topic_progression
-- Note: Fixed user_context handling - no unique constraint on user_id
-- ============================================================================

CREATE OR REPLACE FUNCTION log_conversation_transaction(
  p_user_id UUID,
  p_session_id UUID,
  p_conversation_id UUID,
  p_question_text TEXT,
  p_question_intent VARCHAR(50),
  p_question_complexity NUMERIC(3,2),
  p_extracted_topics TEXT[],
  p_user_satisfaction INTEGER,  -- INTEGER scale 1-5 (nullable)
  p_had_search_results BOOLEAN,
  p_topic_familiarity JSONB,
  p_question_patterns JSONB,
  p_behavioral_insights JSONB,
  p_current_session_topics TEXT[],
  p_cross_session_connections JSONB
) RETURNS JSONB AS $$
DECLARE
  v_conversation_memory_id UUID;
  v_user_context_id UUID;
  v_result JSONB;
BEGIN
  -- =================================================================
  -- STEP 1: Insert conversation memory
  -- =================================================================
  INSERT INTO conversation_memory (
    user_id,
    session_id,
    conversation_id,
    question_text,
    question_intent,
    question_complexity,
    ambiguity_score,
    extracted_topics,
    user_satisfaction,
    clarification_requested,
    follow_up_generated,
    is_follow_up,
    related_conversation_ids,
    personalized_threshold,
    recommended_complexity,
    had_search_results
  ) VALUES (
    p_user_id,
    p_session_id,
    p_conversation_id,
    p_question_text,
    p_question_intent,
    p_question_complexity,
    0.0, -- ambiguity_score default
    p_extracted_topics,
    p_user_satisfaction,  -- Now INTEGER type
    FALSE, -- clarification_requested default
    FALSE, -- follow_up_generated default
    FALSE, -- is_follow_up default
    ARRAY[]::UUID[], -- related_conversation_ids default
    NULL, -- personalized_threshold default
    NULL, -- recommended_complexity default
    p_had_search_results
  )
  RETURNING id INTO v_conversation_memory_id;

  -- =================================================================
  -- STEP 2: Update or insert user context
  -- =================================================================
  -- Check if user_context exists for this user
  SELECT id INTO v_user_context_id
  FROM user_context
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_user_context_id IS NOT NULL THEN
    -- Update existing user_context
    UPDATE user_context SET
      topic_familiarity = p_topic_familiarity,
      question_patterns = p_question_patterns,
      behavioral_insights = p_behavioral_insights,
      current_session_topics = p_current_session_topics,
      cross_session_connections = p_cross_session_connections,
      updated_at = NOW()
    WHERE id = v_user_context_id;
  ELSE
    -- Insert new user_context
    INSERT INTO user_context (
      user_id,
      topic_familiarity,
      question_patterns,
      behavioral_insights,
      current_session_topics,
      cross_session_connections,
      updated_at
    ) VALUES (
      p_user_id,
      p_topic_familiarity,
      p_question_patterns,
      p_behavioral_insights,
      p_current_session_topics,
      p_cross_session_connections,
      NOW()
    );
  END IF;

  -- =================================================================
  -- STEP 3: Update topic progression for each extracted topic
  -- =================================================================
  IF p_extracted_topics IS NOT NULL AND array_length(p_extracted_topics, 1) > 0 THEN
    FOR i IN 1..array_length(p_extracted_topics, 1) LOOP
      INSERT INTO topic_progression (
        user_id,
        topic_name,
        expertise_level,
        first_interaction_date,
        last_interaction_date,
        total_interactions,
        successful_interactions,
        progression_rate,
        plateau_detected,
        connected_topics
      ) VALUES (
        p_user_id,
        p_extracted_topics[i],
        0.10, -- Starting expertise level (NUMERIC(3,2))
        NOW(),
        NOW(),
        1, -- First interaction
        CASE WHEN p_user_satisfaction >= 4 THEN 1 ELSE 0 END, -- INTEGER >= 4 is good (scale 1-5)
        0.000, -- Initial progression rate (NUMERIC(4,3))
        FALSE,
        ARRAY[]::TEXT[]
      )
      ON CONFLICT (user_id, topic_name) DO UPDATE SET
        last_interaction_date = NOW(),
        total_interactions = topic_progression.total_interactions + 1,
        successful_interactions = topic_progression.successful_interactions +
          CASE WHEN p_user_satisfaction >= 4 THEN 1 ELSE 0 END,
        expertise_level = LEAST(0.99, topic_progression.expertise_level + 0.05), -- Max 0.99 for NUMERIC(3,2)
        progression_rate = LEAST(9.999,
          (LEAST(0.99, topic_progression.expertise_level + 0.05) - topic_progression.expertise_level) /
          GREATEST(1, EXTRACT(EPOCH FROM (NOW() - topic_progression.first_interaction_date)) / 86400)
        ), -- Max 9.999 for NUMERIC(4,3)
        updated_at = NOW();
    END LOOP;
  END IF;

  -- =================================================================
  -- RETURN SUCCESS RESPONSE
  -- =================================================================
  v_result := jsonb_build_object(
    'success', TRUE,
    'conversation_memory_id', v_conversation_memory_id,
    'user_id', p_user_id,
    'topics_processed', COALESCE(array_length(p_extracted_topics, 1), 0),
    'timestamp', NOW()
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- =================================================================
  -- ERROR HANDLING - Transaction will automatically rollback
  -- =================================================================
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

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION log_conversation_transaction TO service_role;
GRANT EXECUTE ON FUNCTION log_conversation_transaction TO authenticated;
