-- ============================================================================
-- FIX SUPABASE LINTER WARNINGS - CORRECTED VERSION
-- ============================================================================
-- This script fixes all 18 function search_path warnings
-- Based on actual function signatures from the database
-- ============================================================================

-- Fix: backfill_all_auth_users
ALTER FUNCTION public.backfill_all_auth_users()
SET search_path = pg_catalog, pg_temp;

-- Fix: backfill_auth_user (corrected parameter name)
ALTER FUNCTION public.backfill_auth_user(p_public_user_id uuid)
SET search_path = pg_catalog, pg_temp;

-- Fix: clear_failed_attempts (corrected parameter name)
ALTER FUNCTION public.clear_failed_attempts(p_email_hash text)
SET search_path = pg_catalog, pg_temp;

-- Fix: ensure_user_mapping (corrected parameters)
ALTER FUNCTION public.ensure_user_mapping(p_email text, p_clerk_id text, p_supabase_id uuid)
SET search_path = pg_catalog, pg_temp;

-- Fix: find_user_for_auth (corrected parameters)
ALTER FUNCTION public.find_user_for_auth(p_auth_user_id uuid, p_clerk_id text)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_auth_user_id_by_email
ALTER FUNCTION public.get_auth_user_id_by_email(p_email text)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_migration_timeline
ALTER FUNCTION public.get_migration_timeline()
SET search_path = pg_catalog, pg_temp;

-- Fix: get_user_by_auth_or_clerk
ALTER FUNCTION public.get_user_by_auth_or_clerk(p_auth_user_id uuid, p_clerk_id text)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_users_needing_migration
ALTER FUNCTION public.get_users_needing_migration()
SET search_path = pg_catalog, pg_temp;

-- Fix: is_account_locked (corrected parameter name)
ALTER FUNCTION public.is_account_locked(p_email_hash text)
SET search_path = pg_catalog, pg_temp;

-- Fix: log_conversation_transaction (corrected parameters - complex function)
ALTER FUNCTION public.log_conversation_transaction(
  p_user_id uuid,
  p_session_id uuid,
  p_conversation_id uuid,
  p_question_text text,
  p_question_intent character varying,
  p_question_complexity numeric,
  p_extracted_topics text[],
  p_user_satisfaction integer,
  p_had_search_results boolean,
  p_topic_familiarity jsonb,
  p_question_patterns jsonb,
  p_behavioral_insights jsonb,
  p_current_session_topics text[],
  p_cross_session_connections jsonb
)
SET search_path = pg_catalog, pg_temp;

-- Fix: log_user_migration_event
ALTER FUNCTION public.log_user_migration_event()
SET search_path = pg_catalog, pg_temp;

-- Fix: prevent_library_document_deletion
ALTER FUNCTION public.prevent_library_document_deletion()
SET search_path = pg_catalog, pg_temp;

-- Fix: record_failed_attempt (corrected parameter name)
ALTER FUNCTION public.record_failed_attempt(p_email_hash text)
SET search_path = pg_catalog, pg_temp;

-- Fix: save_document_transaction (corrected parameters)
ALTER FUNCTION public.save_document_transaction(
  p_title text,
  p_author text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_content text,
  p_word_count integer,
  p_page_count integer,
  p_uploaded_by uuid,
  p_source_type text,
  p_source_url text
)
SET search_path = pg_catalog, pg_temp;

-- Fix: save_documents_batch
ALTER FUNCTION public.save_documents_batch(p_documents jsonb)
SET search_path = pg_catalog, pg_temp;

-- Fix: sync_auth_user_id_on_clerk_change
ALTER FUNCTION public.sync_auth_user_id_on_clerk_change()
SET search_path = pg_catalog, pg_temp;

-- Fix: update_clerk_to_auth_map_updated_at
ALTER FUNCTION public.update_clerk_to_auth_map_updated_at()
SET search_path = pg_catalog, pg_temp;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
SELECT
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE
    WHEN p.proconfig IS NULL THEN '❌ NOT SET'
    ELSE '✅ ' || array_to_string(p.proconfig, ', ')
  END as search_path_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'backfill_all_auth_users',
    'backfill_auth_user',
    'clear_failed_attempts',
    'ensure_user_mapping',
    'find_user_for_auth',
    'get_auth_user_id_by_email',
    'get_migration_timeline',
    'get_user_by_auth_or_clerk',
    'get_users_needing_migration',
    'is_account_locked',
    'log_conversation_transaction',
    'log_user_migration_event',
    'prevent_library_document_deletion',
    'record_failed_attempt',
    'save_document_transaction',
    'save_documents_batch',
    'sync_auth_user_id_on_clerk_change',
    'update_clerk_to_auth_map_updated_at'
  )
ORDER BY p.proname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ All 18 function search_path warnings fixed!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Check verification query results above';
  RAISE NOTICE '   2. All functions should show: ✅ search_path=pg_catalog, pg_temp';
  RAISE NOTICE '   3. Enable leaked password protection in Dashboard:';
  RAISE NOTICE '      → Authentication > Settings > Password Settings';
  RAISE NOTICE '      → Enable "Leaked password protection"';
  RAISE NOTICE '';
END $$;
