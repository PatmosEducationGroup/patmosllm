-- Check constraints on conversation_memory
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'conversation_memory'::regclass
  AND contype = 'c'; -- check constraints

-- Check documents table columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN ('created_at', 'updated_at', 'processed_at')
ORDER BY ordinal_position;

-- Check foreign keys on conversation_memory
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'conversation_memory'::regclass
  AND contype = 'f'; -- foreign key constraints
