-- Check privacy_audit_log table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'privacy_audit_log'
ORDER BY ordinal_position;
