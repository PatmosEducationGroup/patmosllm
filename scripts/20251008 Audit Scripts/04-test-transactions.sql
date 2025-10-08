-- ============================================================================
-- TEST TRANSACTION FUNCTIONS
-- ============================================================================
-- Run these tests to verify the transaction functions work correctly
-- ============================================================================

-- ============================================================================
-- STEP 1: Get a real user ID to use for testing
-- ============================================================================
SELECT id, email, role
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- Copy one of the user IDs from above and use it in the tests below
-- Replace 'PASTE_USER_ID_HERE' with the actual UUID

-- ============================================================================
-- STEP 2: Create a test chat session first (required for foreign key)
-- ============================================================================
INSERT INTO chat_sessions (id, user_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'PASTE_USER_ID_HERE'::UUID,
  NOW(),
  NOW()
)
RETURNING id;

-- Copy the session ID from above and use it in the next step
-- OR get an existing session:
SELECT id FROM chat_sessions WHERE user_id = 'PASTE_USER_ID_HERE'::UUID ORDER BY created_at DESC LIMIT 1;

-- ============================================================================
-- STEP 3: Create a test conversation (required for foreign key)
-- ============================================================================
INSERT INTO conversations (id, user_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'PASTE_USER_ID_HERE'::UUID,
  NOW(),
  NOW()
)
RETURNING id;

-- Copy the conversation ID from above
-- OR get an existing conversation:
SELECT id FROM conversations WHERE user_id = 'PASTE_USER_ID_HERE'::UUID ORDER BY created_at DESC LIMIT 1;

-- ============================================================================
-- STEP 4: Test log_conversation_transaction
-- ============================================================================
-- Replace PASTE_SESSION_ID and PASTE_CONVERSATION_ID with the IDs from above
SELECT log_conversation_transaction(
  p_user_id := 'PASTE_USER_ID_HERE'::UUID,
  p_session_id := 'PASTE_SESSION_ID_HERE'::UUID,  -- Use real session ID
  p_conversation_id := 'PASTE_CONVERSATION_ID_HERE'::UUID,  -- Use real conversation ID
  p_question_text := 'Test question about database transactions',
  p_question_intent := 'conceptual',
  p_question_complexity := 0.70,
  p_extracted_topics := ARRAY['databases', 'transactions', 'testing']::TEXT[],
  p_user_satisfaction := 4,  -- INTEGER scale 1-5 (4 = good satisfaction)
  p_had_search_results := TRUE,
  p_topic_familiarity := '{}'::JSONB,
  p_question_patterns := '{}'::JSONB,
  p_behavioral_insights := '{}'::JSONB,
  p_current_session_topics := ARRAY['databases']::TEXT[],
  p_cross_session_connections := '[]'::JSONB
);

-- Expected result: JSON with "success": true and a conversation_memory_id

-- ============================================================================
-- STEP 5: Verify the conversation was logged correctly
-- ============================================================================
-- Check conversation_memory
SELECT id, user_id, question_text, question_intent, extracted_topics, user_satisfaction
FROM conversation_memory
WHERE question_text LIKE '%Test question about database%'
ORDER BY created_at DESC
LIMIT 1;

-- Check user_context was updated
SELECT user_id, current_session_topics, updated_at
FROM user_context
WHERE user_id = 'PASTE_USER_ID_HERE'::UUID;

-- Check topic_progression was updated
SELECT user_id, topic_name, expertise_level, total_interactions
FROM topic_progression
WHERE user_id = 'PASTE_USER_ID_HERE'::UUID
  AND topic_name IN ('databases', 'transactions', 'testing')
ORDER BY topic_name;

-- ============================================================================
-- STEP 6: Test save_document_transaction
-- ============================================================================
SELECT save_document_transaction(
  p_title := 'Test Document for Transaction',
  p_author := 'Web scraped from test.example.com',
  p_storage_path := 'scraped/test-transaction-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '.txt',
  p_mime_type := 'text/plain',
  p_file_size := 1500,
  p_content := 'This is test content for verifying the document transaction function works correctly. It includes multiple sentences to ensure proper word count calculation.',
  p_word_count := 20,
  p_page_count := NULL,
  p_uploaded_by := 'PASTE_USER_ID_HERE'::UUID,
  p_source_type := 'web_scraped',
  p_source_url := 'https://test.example.com/transaction-test'
);

-- Expected result: JSON with "success": true and a document_id

-- ============================================================================
-- STEP 7: Verify the document was saved correctly
-- ============================================================================
SELECT id, title, author, source_type, source_url, word_count, created_at
FROM documents
WHERE title = 'Test Document for Transaction'
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- STEP 8: Test save_documents_batch (replace USER_ID)
-- ============================================================================
SELECT save_documents_batch(
  p_documents := jsonb_build_array(
    jsonb_build_object(
      'title', 'Batch Test Doc 1',
      'author', 'Web scraped from batch.example.com',
      'storage_path', 'scraped/batch-test-1-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '.txt',
      'mime_type', 'text/plain',
      'file_size', 1000,
      'content', 'First batch test document content.',
      'word_count', 5,
      'page_count', NULL,
      'uploaded_by', 'PASTE_USER_ID_HERE',
      'source_type', 'web_scraped',
      'source_url', 'https://batch.example.com/doc1'
    ),
    jsonb_build_object(
      'title', 'Batch Test Doc 2',
      'author', 'Web scraped from batch.example.com',
      'storage_path', 'scraped/batch-test-2-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '.txt',
      'mime_type', 'text/plain',
      'file_size', 2000,
      'content', 'Second batch test document content with more words here.',
      'word_count', 9,
      'page_count', NULL,
      'uploaded_by', 'PASTE_USER_ID_HERE',
      'source_type', 'web_scraped',
      'source_url', 'https://batch.example.com/doc2'
    )
  )
);

-- Expected result: JSON with "successful": 2, "failed": 0

-- ============================================================================
-- STEP 9: Verify batch documents were saved
-- ============================================================================
SELECT id, title, source_url, word_count, created_at
FROM documents
WHERE title LIKE 'Batch Test Doc%'
ORDER BY created_at DESC
LIMIT 2;

-- ============================================================================
-- STEP 10: Test error handling - intentional failure
-- ============================================================================
-- This should fail gracefully and return success: false (non-existent user)
SELECT log_conversation_transaction(
  p_user_id := '00000000-0000-0000-0000-000000000000'::UUID, -- Non-existent user
  p_session_id := 'PASTE_SESSION_ID_HERE'::UUID,  -- Use real session ID from above
  p_conversation_id := 'PASTE_CONVERSATION_ID_HERE'::UUID,  -- Use real conversation ID from above
  p_question_text := 'This should fail',
  p_question_intent := 'test',
  p_question_complexity := 0.50,
  p_extracted_topics := ARRAY['error']::TEXT[],
  p_user_satisfaction := 3,  -- INTEGER scale 1-5
  p_had_search_results := TRUE,
  p_topic_familiarity := '{}'::JSONB,
  p_question_patterns := '{}'::JSONB,
  p_behavioral_insights := '{}'::JSONB,
  p_current_session_topics := ARRAY[]::TEXT[],
  p_cross_session_connections := '[]'::JSONB
);

-- Expected result: JSON with "success": false and error message

-- ============================================================================
-- STEP 11: Clean up test data
-- ============================================================================
-- Run this after testing to remove test data
DELETE FROM conversation_memory WHERE question_text LIKE '%Test question about database%';
DELETE FROM documents WHERE title LIKE '%Test Document for Transaction%' OR title LIKE 'Batch Test Doc%';
DELETE FROM topic_progression WHERE topic_name IN ('databases', 'transactions', 'testing') AND total_interactions = 1;

-- Verify cleanup
SELECT COUNT(*) as test_conversations_remaining FROM conversation_memory WHERE question_text LIKE '%Test%';
SELECT COUNT(*) as test_documents_remaining FROM documents WHERE title LIKE '%Test%';
