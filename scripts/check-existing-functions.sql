-- Check which functions actually exist in the public schema
SELECT
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE
    WHEN p.proconfig IS NULL THEN 'NOT SET'
    ELSE array_to_string(p.proconfig, ', ')
  END as search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'clear_failed_attempts',
    'prevent_library_document_deletion',
    'ensure_user_mapping',
    'update_clerk_to_auth_map_updated_at',
    'backfill_auth_user',
    'backfill_all_auth_users',
    'save_document_transaction',
    'save_documents_batch',
    'log_conversation_transaction',
    'get_auth_user_id_by_email',
    'is_account_locked',
    'get_user_by_auth_or_clerk',
    'sync_auth_user_id_on_clerk_change',
    'find_user_for_auth',
    'log_user_migration_event',
    'get_migration_timeline',
    'get_users_needing_migration',
    'record_failed_attempt'
  )
ORDER BY p.proname;
