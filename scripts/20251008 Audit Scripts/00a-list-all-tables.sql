-- ============================================================================
-- LIST ALL TABLES IN DATABASE
-- ============================================================================
-- Get complete list of all tables and their row counts
-- ============================================================================

-- Step 1: List all tables
SELECT
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Step 2: Get row counts for all tables
SELECT
  schemaname,
  relname as tablename,
  n_live_tup as estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;

-- Step 3: Get all table names with sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(quote_ident('public')||'.'||quote_ident(tablename))) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(quote_ident('public')||'.'||quote_ident(tablename)) DESC;
