-- ============================================================================
-- FULL DATABASE SCHEMA EXPORT
-- Get complete schema information for all tables, columns, indexes, and constraints
-- ============================================================================

-- 1. LIST ALL TABLES WITH ROW COUNTS AND SIZES
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as row_count_estimate
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 2. GET ALL COLUMNS WITH TYPES, NULLABILITY, AND DEFAULTS
SELECT
  table_name,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. GET ALL PRIMARY KEYS
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 4. GET ALL FOREIGN KEYS
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 5. GET ALL INDEXES
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 6. GET ALL UNIQUE CONSTRAINTS
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 7. GET ALL CHECK CONSTRAINTS
SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 8. GET TABLE CREATION DETAILS (for each table separately)
-- Users table
SELECT * FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;

-- Conversations table
SELECT * FROM information_schema.columns WHERE table_name = 'conversations' ORDER BY ordinal_position;

-- Documents table
SELECT * FROM information_schema.columns WHERE table_name = 'documents' ORDER BY ordinal_position;

-- Chunks table
SELECT * FROM information_schema.columns WHERE table_name = 'chunks' ORDER BY ordinal_position;

-- Chat sessions table
SELECT * FROM information_schema.columns WHERE table_name = 'chat_sessions' ORDER BY ordinal_position;

-- Upload sessions table
SELECT * FROM information_schema.columns WHERE table_name = 'upload_sessions' ORDER BY ordinal_position;

-- User context table
SELECT * FROM information_schema.columns WHERE table_name = 'user_context' ORDER BY ordinal_position;

-- Conversation memory table
SELECT * FROM information_schema.columns WHERE table_name = 'conversation_memory' ORDER BY ordinal_position;

-- Topic progression table
SELECT * FROM information_schema.columns WHERE table_name = 'topic_progression' ORDER BY ordinal_position;

-- Question patterns table
SELECT * FROM information_schema.columns WHERE table_name = 'question_patterns' ORDER BY ordinal_position;

-- User preferences table
SELECT * FROM information_schema.columns WHERE table_name = 'user_preferences' ORDER BY ordinal_position;

-- User onboarding milestones table
SELECT * FROM information_schema.columns WHERE table_name = 'user_onboarding_milestones' ORDER BY ordinal_position;

-- Ingest jobs table
SELECT * FROM information_schema.columns WHERE table_name = 'ingest_jobs' ORDER BY ordinal_position;

-- Data export requests table
SELECT * FROM information_schema.columns WHERE table_name = 'data_export_requests' ORDER BY ordinal_position;

-- Privacy audit log table
SELECT * FROM information_schema.columns WHERE table_name = 'privacy_audit_log' ORDER BY ordinal_position;

-- Clerk webhook events table
SELECT * FROM information_schema.columns WHERE table_name = 'clerk_webhook_events' ORDER BY ordinal_position;

-- Idempotency keys table
SELECT * FROM information_schema.columns WHERE table_name = 'idempotency_keys' ORDER BY ordinal_position;

-- 9. GET ACTUAL ROW COUNTS (may be slow on large tables)
SELECT
  'users' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.users')) as total_size
FROM users
UNION ALL
SELECT 'conversations', COUNT(*), pg_size_pretty(pg_total_relation_size('public.conversations')) FROM conversations
UNION ALL
SELECT 'documents', COUNT(*), pg_size_pretty(pg_total_relation_size('public.documents')) FROM documents
UNION ALL
SELECT 'chunks', COUNT(*), pg_size_pretty(pg_total_relation_size('public.chunks')) FROM chunks
UNION ALL
SELECT 'chat_sessions', COUNT(*), pg_size_pretty(pg_total_relation_size('public.chat_sessions')) FROM chat_sessions
UNION ALL
SELECT 'upload_sessions', COUNT(*), pg_size_pretty(pg_total_relation_size('public.upload_sessions')) FROM upload_sessions
UNION ALL
SELECT 'user_context', COUNT(*), pg_size_pretty(pg_total_relation_size('public.user_context')) FROM user_context
UNION ALL
SELECT 'conversation_memory', COUNT(*), pg_size_pretty(pg_total_relation_size('public.conversation_memory')) FROM conversation_memory
UNION ALL
SELECT 'topic_progression', COUNT(*), pg_size_pretty(pg_total_relation_size('public.topic_progression')) FROM topic_progression
UNION ALL
SELECT 'question_patterns', COUNT(*), pg_size_pretty(pg_total_relation_size('public.question_patterns')) FROM question_patterns
UNION ALL
SELECT 'user_preferences', COUNT(*), pg_size_pretty(pg_total_relation_size('public.user_preferences')) FROM user_preferences
UNION ALL
SELECT 'user_onboarding_milestones', COUNT(*), pg_size_pretty(pg_total_relation_size('public.user_onboarding_milestones')) FROM user_onboarding_milestones
UNION ALL
SELECT 'ingest_jobs', COUNT(*), pg_size_pretty(pg_total_relation_size('public.ingest_jobs')) FROM ingest_jobs
UNION ALL
SELECT 'data_export_requests', COUNT(*), pg_size_pretty(pg_total_relation_size('public.data_export_requests')) FROM data_export_requests
UNION ALL
SELECT 'privacy_audit_log', COUNT(*), pg_size_pretty(pg_total_relation_size('public.privacy_audit_log')) FROM privacy_audit_log
UNION ALL
SELECT 'clerk_webhook_events', COUNT(*), pg_size_pretty(pg_total_relation_size('public.clerk_webhook_events')) FROM clerk_webhook_events
UNION ALL
SELECT 'idempotency_keys', COUNT(*), pg_size_pretty(pg_total_relation_size('public.idempotency_keys')) FROM idempotency_keys
ORDER BY row_count DESC;
