-- ============================================================================
-- SCHEMA VERIFICATION SCRIPT
-- ============================================================================
-- Purpose: Verify database schema before implementing transactions
-- Run this FIRST in Supabase SQL Editor to verify table structures
-- ============================================================================

-- ============================================================================
-- STEP 1: Check all required tables exist
-- ============================================================================
SELECT
  tablename,
  CASE
    WHEN tablename IN ('users', 'documents', 'chunks', 'conversations',
                       'chat_sessions', 'user_context', 'conversation_memory',
                       'topic_progression', 'question_patterns')
    THEN '✅ REQUIRED'
    ELSE '📋 Optional'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================================
-- STEP 2: Verify conversation_memory table schema
-- ============================================================================
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'conversation_memory'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 3: Verify user_context table schema
-- ============================================================================
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_context'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 4: Verify topic_progression table schema
-- ============================================================================
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'topic_progression'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 5: Verify question_patterns table schema
-- ============================================================================
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'question_patterns'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 6: Verify documents table schema
-- ============================================================================
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'documents'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 7: Check foreign key constraints
-- ============================================================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('conversation_memory', 'user_context', 'topic_progression',
                        'question_patterns', 'documents')
ORDER BY tc.table_name, kcu.column_name;

-- ============================================================================
-- STEP 8: Check primary keys
-- ============================================================================
SELECT
  tc.table_name,
  kcu.column_name as pk_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('conversation_memory', 'user_context', 'topic_progression',
                        'question_patterns', 'documents')
ORDER BY tc.table_name;

-- ============================================================================
-- STEP 9: Check unique constraints
-- ============================================================================
SELECT
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ') as unique_columns
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('conversation_memory', 'user_context', 'topic_progression',
                        'question_patterns', 'documents')
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- ============================================================================
-- STEP 10: Sample data check
-- ============================================================================
SELECT
  'users' as table_name,
  COUNT(*) as row_count
FROM users
UNION ALL
SELECT 'documents', COUNT(*) FROM documents
UNION ALL
SELECT 'conversation_memory', COUNT(*) FROM conversation_memory
UNION ALL
SELECT 'user_context', COUNT(*) FROM user_context
UNION ALL
SELECT 'topic_progression', COUNT(*) FROM topic_progression
UNION ALL
SELECT 'question_patterns', COUNT(*) FROM question_patterns
ORDER BY table_name;

-- ============================================================================
-- CRITICAL: Export full schema for review
-- ============================================================================
-- Run this query and save the output to a file for review
SELECT
  table_name,
  string_agg(
    column_name || ' ' ||
    data_type ||
    CASE
      WHEN character_maximum_length IS NOT NULL
      THEN '(' || character_maximum_length || ')'
      WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL
      THEN '(' || numeric_precision || ',' || numeric_scale || ')'
      ELSE ''
    END ||
    CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    E',\n  '
    ORDER BY ordinal_position
  ) as columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('conversation_memory', 'user_context', 'topic_progression',
                     'question_patterns', 'documents')
GROUP BY table_name
ORDER BY table_name;
