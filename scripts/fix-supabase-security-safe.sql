-- ============================================================================
-- FIX SUPABASE LINTER WARNINGS (SAFE VERSION)
-- ============================================================================
-- This script fixes all security warnings - ALL statements wrapped in safe checks
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Fix: clear_failed_attempts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'clear_failed_attempts') THEN
    ALTER FUNCTION public.clear_failed_attempts(p_email text)
    SET search_path = pg_catalog, pg_temp;
    RAISE NOTICE '✅ Fixed: clear_failed_attempts';
  ELSE
    RAISE NOTICE '⏭️  Skipped: clear_failed_attempts (does not exist)';
  END IF;
END $$;

-- Fix: prevent_library_document_deletion
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_library_document_deletion') THEN
    ALTER FUNCTION public.prevent_library_document_deletion()
    SET search_path = pg_catalog, pg_temp;
    RAISE NOTICE '✅ Fixed: prevent_library_document_deletion';
  ELSE
    RAISE NOTICE '⏭️  Skipped: prevent_library_document_deletion (does not exist)';
  END IF;
END $$;

-- Fix: ensure_user_mapping
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_user_mapping') THEN
    ALTER FUNCTION public.ensure_user_mapping()
    SET search_path = pg_catalog, pg_temp;
    RAISE NOTICE '✅ Fixed: ensure_user_mapping';
  ELSE
    RAISE NOTICE '⏭️  Skipped: ensure_user_mapping (does not exist)';
  END IF;
END $$;

-- Fix: update_clerk_to_auth_map_updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_clerk_to_auth_map_updated_at') THEN
    ALTER FUNCTION public.update_clerk_to_auth_map_updated_at()
    SET search_path = pg_catalog, pg_temp;
    RAISE NOTICE '✅ Fixed: update_clerk_to_auth_map_updated_at';
  ELSE
    RAISE NOTICE '⏭️  Skipped: update_clerk_to_auth_map_updated_at (does not exist)';
  END IF;
END $$;

-- Fix: backfill_auth_user
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'backfill_auth_user') THEN
    ALTER FUNCTION public.backfill_auth_user(p_user_id uuid)
    SET search_path = pg_catalog, pg_temp;
    RAISE NOTICE '✅ Fixed: backfill_auth_user';
  ELSE
    RAISE NOTICE '⏭️  Skipped: backfill_auth_user (does not exist)';
  END IF;
END $$;

-- Fix: backfill_all_auth_users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'backfill_all_auth_users') THEN
    ALTER FUNCTION public.backfill_all_auth_users()
    SET search_path = pg_catalog, pg_temp;
    RAISE NOTICE '✅ Fixed: backfill_all_auth_users';
  ELSE
    RAISE NOTICE '⏭️  Skipped: backfill_all_auth_users (does not exist)';
  END IF;
END $$;

-- Fix: save_document_transaction
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_document_transaction') THEN
    EXECUTE 'ALTER FUNCTION public.save_document_transaction(
      p_title text,
      p_author text,
      p_storage_path text,
      p_mime_type text,
      p_file_size bigint,
      p_content text,
      p_word_count integer,
      p_page_count integer,
      p_uploaded_by text,
      p_source_type text,
      p_source_url text,
      p_amazon_url text,
      p_resource_url text,
      p_download_enabled boolean,
      p_contact_person text,
      p_contact_email text,
      p_metadata jsonb
    ) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: save_document_transaction';
  ELSE
    RAISE NOTICE '⏭️  Skipped: save_document_transaction (does not exist)';
  END IF;
END $$;

-- Fix: save_documents_batch
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_documents_batch') THEN
    EXECUTE 'ALTER FUNCTION public.save_documents_batch(documents jsonb) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: save_documents_batch';
  ELSE
    RAISE NOTICE '⏭️  Skipped: save_documents_batch (does not exist)';
  END IF;
END $$;

-- Fix: log_conversation_transaction
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_conversation_transaction') THEN
    EXECUTE 'ALTER FUNCTION public.log_conversation_transaction(
      p_user_id text,
      p_question text,
      p_answer text,
      p_sources jsonb,
      p_session_id text
    ) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: log_conversation_transaction';
  ELSE
    RAISE NOTICE '⏭️  Skipped: log_conversation_transaction (does not exist)';
  END IF;
END $$;

-- Fix: get_auth_user_id_by_email
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_auth_user_id_by_email') THEN
    EXECUTE 'ALTER FUNCTION public.get_auth_user_id_by_email(p_email text) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: get_auth_user_id_by_email';
  ELSE
    RAISE NOTICE '⏭️  Skipped: get_auth_user_id_by_email (does not exist)';
  END IF;
END $$;

-- Fix: is_account_locked
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_locked') THEN
    EXECUTE 'ALTER FUNCTION public.is_account_locked(p_email text) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: is_account_locked';
  ELSE
    RAISE NOTICE '⏭️  Skipped: is_account_locked (does not exist)';
  END IF;
END $$;

-- Fix: get_user_by_auth_or_clerk
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_by_auth_or_clerk') THEN
    EXECUTE 'ALTER FUNCTION public.get_user_by_auth_or_clerk(p_auth_user_id uuid, p_clerk_id text) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: get_user_by_auth_or_clerk';
  ELSE
    RAISE NOTICE '⏭️  Skipped: get_user_by_auth_or_clerk (does not exist)';
  END IF;
END $$;

-- Fix: sync_auth_user_id_on_clerk_change
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_auth_user_id_on_clerk_change') THEN
    EXECUTE 'ALTER FUNCTION public.sync_auth_user_id_on_clerk_change() SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: sync_auth_user_id_on_clerk_change';
  ELSE
    RAISE NOTICE '⏭️  Skipped: sync_auth_user_id_on_clerk_change (does not exist)';
  END IF;
END $$;

-- Fix: find_user_for_auth
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'find_user_for_auth') THEN
    EXECUTE 'ALTER FUNCTION public.find_user_for_auth(p_email text) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: find_user_for_auth';
  ELSE
    RAISE NOTICE '⏭️  Skipped: find_user_for_auth (does not exist)';
  END IF;
END $$;

-- Fix: log_user_migration_event
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_user_migration_event') THEN
    EXECUTE 'ALTER FUNCTION public.log_user_migration_event(
      p_user_id text,
      p_event_type text,
      p_status text,
      p_metadata jsonb
    ) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: log_user_migration_event';
  ELSE
    RAISE NOTICE '⏭️  Skipped: log_user_migration_event (does not exist)';
  END IF;
END $$;

-- Fix: get_migration_timeline
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_migration_timeline') THEN
    EXECUTE 'ALTER FUNCTION public.get_migration_timeline(p_email text) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: get_migration_timeline';
  ELSE
    RAISE NOTICE '⏭️  Skipped: get_migration_timeline (does not exist)';
  END IF;
END $$;

-- Fix: get_users_needing_migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_users_needing_migration') THEN
    EXECUTE 'ALTER FUNCTION public.get_users_needing_migration() SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: get_users_needing_migration';
  ELSE
    RAISE NOTICE '⏭️  Skipped: get_users_needing_migration (does not exist)';
  END IF;
END $$;

-- Fix: record_failed_attempt
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_failed_attempt') THEN
    EXECUTE 'ALTER FUNCTION public.record_failed_attempt(p_email text) SET search_path = pg_catalog, pg_temp';
    RAISE NOTICE '✅ Fixed: record_failed_attempt';
  ELSE
    RAISE NOTICE '⏭️  Skipped: record_failed_attempt (does not exist)';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
SELECT
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE
    WHEN p.proconfig IS NULL THEN '❌ NOT SET'
    ELSE '✅ ' || array_to_string(p.proconfig, ', ')
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

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Security script complete!';
  RAISE NOTICE '   Check the verification table above';
  RAISE NOTICE '   ✅ = Fixed    ⏭️ = Skipped (doesn''t exist)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Manual step (optional):';
  RAISE NOTICE '   Enable leaked password protection in Supabase Dashboard';
  RAISE NOTICE '   Authentication > Settings > Password Settings';
END $$;
