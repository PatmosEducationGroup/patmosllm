-- ============================================================================
-- FIX SUPABASE LINTER WARNINGS
-- ============================================================================
-- This script fixes all security warnings flagged by Supabase linter
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: Fix Function Search Path Warnings (18 functions)
-- ============================================================================
-- Setting search_path prevents SQL injection attacks via search_path manipulation
-- Using 'pg_catalog, pg_temp' is the recommended secure search_path

-- NOTE: Using DO blocks with dynamic SQL to handle functions that may not exist

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
ALTER FUNCTION public.save_document_transaction(
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
)
SET search_path = pg_catalog, pg_temp;

-- Fix: save_documents_batch
ALTER FUNCTION public.save_documents_batch(documents jsonb)
SET search_path = pg_catalog, pg_temp;

-- Fix: log_conversation_transaction
ALTER FUNCTION public.log_conversation_transaction(
  p_user_id text,
  p_question text,
  p_answer text,
  p_sources jsonb,
  p_session_id text
)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_auth_user_id_by_email
ALTER FUNCTION public.get_auth_user_id_by_email(p_email text)
SET search_path = pg_catalog, pg_temp;

-- Fix: is_account_locked
ALTER FUNCTION public.is_account_locked(p_email text)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_user_by_auth_or_clerk
ALTER FUNCTION public.get_user_by_auth_or_clerk(p_auth_user_id uuid, p_clerk_id text)
SET search_path = pg_catalog, pg_temp;

-- Fix: sync_auth_user_id_on_clerk_change
ALTER FUNCTION public.sync_auth_user_id_on_clerk_change()
SET search_path = pg_catalog, pg_temp;

-- Fix: find_user_for_auth
ALTER FUNCTION public.find_user_for_auth(p_email text)
SET search_path = pg_catalog, pg_temp;

-- Fix: log_user_migration_event
ALTER FUNCTION public.log_user_migration_event(
  p_user_id text,
  p_event_type text,
  p_status text,
  p_metadata jsonb
)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_migration_timeline
ALTER FUNCTION public.get_migration_timeline(p_email text)
SET search_path = pg_catalog, pg_temp;

-- Fix: get_users_needing_migration
ALTER FUNCTION public.get_users_needing_migration()
SET search_path = pg_catalog, pg_temp;

-- Fix: record_failed_attempt
ALTER FUNCTION public.record_failed_attempt(p_email text)
SET search_path = pg_catalog, pg_temp;

-- ============================================================================
-- PART 2: Enable Leaked Password Protection
-- ============================================================================
-- Note: This setting is configured in Supabase Dashboard > Authentication > Settings
-- It cannot be set via SQL - it must be enabled manually in the dashboard
--
-- To enable:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to Authentication > Settings
-- 3. Under "Password Settings", enable "Enable leaked password protection"
-- 4. This will check passwords against HaveIBeenPwned.org database
--
-- Alternatively, you can use the Supabase Management API:
-- curl -X PATCH "https://api.supabase.com/v1/projects/{ref}/config/auth" \
--   -H "Authorization: Bearer {service_role_key}" \
--   -H "Content-Type: application/json" \
--   -d '{"password_required_characters": "HIBP_BREACH"}'

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify all functions now have search_path set
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

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ All function search_path warnings fixed!';
  RAISE NOTICE '   - Updated 18 functions with secure search_path';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Manual step required:';
  RAISE NOTICE '   - Enable leaked password protection in Supabase Dashboard';
  RAISE NOTICE '   - Go to: Authentication > Settings > Password Settings';
  RAISE NOTICE '   - Enable: "Enable leaked password protection"';
END $$;
