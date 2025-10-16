-- ============================================================================
-- COMPLETE DATABASE SCHEMA EXPORT (DYNAMIC)
-- ============================================================================
-- Queries only tables that actually exist in the database
-- Output formatted for CLAUDE.md documentation
-- ============================================================================

DO $$ BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'PATMOSLLM DATABASE SCHEMA EXPORT';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- 1. LIST ALL TABLES WITH ROW COUNTS AND SIZES
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '1. ALL TABLES (sorted by size)';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  tablename AS table_name,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size,
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as estimated_rows
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 2. ALL COLUMNS FOR EACH TABLE (with types and constraints)
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '2. TABLE STRUCTURES';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  table_name,
  column_name,
  data_type ||
    CASE
      WHEN character_maximum_length IS NOT NULL
      THEN '(' || character_maximum_length || ')'
      ELSE ''
    END AS type,
  CASE WHEN is_nullable = 'NO' THEN 'NOT NULL' ELSE 'NULL' END AS nullable,
  CASE
    WHEN column_default IS NOT NULL
    THEN 'DEFAULT: ' || substring(column_default, 1, 50)
    ELSE ''
  END AS default_value
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 3. PRIMARY KEYS
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '3. PRIMARY KEYS';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  tc.table_name,
  string_agg(kcu.column_name, ', ') AS primary_key_columns,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 4. FOREIGN KEYS
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '4. FOREIGN KEYS';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '5. INDEXES';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  tablename AS table_name,
  indexname AS index_name,
  indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 6. UNIQUE CONSTRAINTS
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '6. UNIQUE CONSTRAINTS';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  tc.table_name,
  string_agg(kcu.column_name, ', ') AS unique_columns,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 7. CHECK CONSTRAINTS
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '7. CHECK CONSTRAINTS';
  RAISE NOTICE '-----------------------------------';
END $$;

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

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 8. ROW COUNTS (ACTUAL - may be slow on large tables)
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '8. ACTUAL ROW COUNTS';
  RAISE NOTICE '-----------------------------------';
END $$;

DO $$
DECLARE
  rec RECORD;
  row_count BIGINT;
  total_size TEXT;
BEGIN
  RAISE NOTICE '%-30s | %-15s | %-15s', 'Table Name', 'Row Count', 'Total Size';
  RAISE NOTICE '%-30s-+-%-15s-+-%-15s', repeat('-', 30), repeat('-', 15), repeat('-', 15);

  FOR rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', rec.tablename) INTO row_count;
    EXECUTE format('SELECT pg_size_pretty(pg_total_relation_size(%L))', 'public.' || rec.tablename) INTO total_size;
    RAISE NOTICE '%-30s | %-15s | %-15s', rec.tablename, row_count, total_size;
  END LOOP;
END $$;

DO $$ BEGIN RAISE NOTICE ''; END $$;

-- ============================================================================
-- 9. ENUM TYPES (if any)
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE '9. ENUM TYPES';
  RAISE NOTICE '-----------------------------------';
END $$;

SELECT
  t.typname AS enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

DO $$ BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'SCHEMA EXPORT COMPLETE';
  RAISE NOTICE '============================================================================';
END $$;
