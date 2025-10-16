-- ============================================================================
-- DYNAMIC DATABASE SCHEMA EXPORT
-- Discovers and exports complete schema for all existing tables
-- ============================================================================

-- 1. LIST ALL TABLES (with actual row counts and sizes)
SELECT
    tablename as table_name,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) as total_size,
    pg_size_pretty(pg_relation_size('public.' || tablename)) as data_size,
    pg_size_pretty(pg_total_relation_size('public.' || tablename) - pg_relation_size('public.' || tablename)) as external_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;

-- 2. GET ALL COLUMNS WITH FULL DETAILS
SELECT
    table_name,
    column_name,
    data_type,
    CASE
        WHEN character_maximum_length IS NOT NULL THEN
            data_type || '(' || character_maximum_length || ')'
        WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL THEN
            data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
        ELSE data_type
    END as full_type,
    is_nullable,
    column_default,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. GET ALL PRIMARY KEYS
SELECT
    tc.table_name,
    STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as primary_key_columns,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- 4. GET ALL FOREIGN KEYS
SELECT
    tc.table_name as from_table,
    kcu.column_name as from_column,
    ccu.table_name as to_table,
    ccu.column_name as to_column,
    tc.constraint_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

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
    STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as unique_columns,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- 7. GET TABLE COMMENTS
SELECT
    c.relname as table_name,
    pg_catalog.obj_description(c.oid) as table_comment
FROM pg_catalog.pg_class c
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND pg_catalog.obj_description(c.oid) IS NOT NULL
ORDER BY c.relname;

-- 8. GET COLUMN COMMENTS
SELECT
    c.table_name,
    c.column_name,
    pgd.description as column_comment
FROM pg_catalog.pg_statio_all_tables st
INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid)
INNER JOIN information_schema.columns c ON (
    pgd.objsubid = c.ordinal_position
    AND c.table_schema = st.schemaname
    AND c.table_name = st.relname
)
WHERE st.schemaname = 'public'
ORDER BY c.table_name, c.ordinal_position;
