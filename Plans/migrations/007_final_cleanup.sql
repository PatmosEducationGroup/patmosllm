-- ============================================================================
-- MIGRATION 007: Final Cleanup (Week 2+ Post-Migration)
-- ============================================================================
-- Purpose: Remove temporary migration infrastructure after stability period
-- Prerequisites: 2+ weeks of stable operation post-cutover
-- Timing: Week 2-4 after Migration 006 complete
-- Safety: Keep commented until team confirms migration success
-- ============================================================================

-- ============================================================================
-- CRITICAL: DO NOT RUN UNTIL MIGRATION IS CONFIRMED STABLE
-- ============================================================================
-- Required criteria before running this migration:
-- 1. Zero auth errors for 2+ weeks
-- 2. 100% users migrated and using Supabase Auth
-- 3. No Clerk API calls (can disable Clerk account)
-- 4. Team approval from product + engineering leads
-- 5. Database backup completed within last 24 hours
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop Compatibility Layer
-- ============================================================================

-- Drop views
DROP VIEW IF EXISTS public.v_migration_metrics CASCADE;
DROP VIEW IF EXISTS public.v_user_migration_status CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS public.find_user_for_auth(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_user_by_auth_or_clerk(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_migration_timeline();
DROP FUNCTION IF EXISTS public.get_users_needing_migration();

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_log_user_migration ON public.users;
DROP TRIGGER IF EXISTS trigger_sync_auth_user_id_on_clerk_change ON public.users;

-- Drop trigger functions
DROP FUNCTION IF EXISTS public.log_user_migration_event();
DROP FUNCTION IF EXISTS public.sync_auth_user_id_on_clerk_change();

-- ============================================================================
-- STEP 2: Archive Migration Events (Optional - Keep for Audit)
-- ============================================================================

-- Option A: Keep migration_events table for historical reference
COMMENT ON TABLE public.migration_events IS 'ARCHIVED: Historical migration event log. Safe to truncate after 6 months.';

-- Option B: Export to backup and drop table
-- COPY public.migration_events TO '/tmp/migration_events_backup.csv' WITH CSV HEADER;
-- DROP TABLE IF EXISTS public.migration_events CASCADE;

-- ============================================================================
-- STEP 3: Drop Mapping Table (After 6+ Months)
-- ============================================================================
-- Keep mapping table for 6 months in case of audit/rollback needs
-- Then run this to drop it:

-- CRITICAL: Verify no code references this table before dropping
-- COMMENT ON TABLE public.clerk_to_auth_map IS 'DEPRECATED: Safe to drop after 6 months post-migration';

-- -- After 6 months:
-- DROP TABLE IF EXISTS public.clerk_to_auth_map CASCADE;

-- ============================================================================
-- STEP 4: Drop clerk_id_deprecated Column (After 6+ Months)
-- ============================================================================
-- Keep for 6 months for audit trail, then drop

-- CRITICAL: Backup users table before dropping this column
-- pg_dump patmosllm -t public.users > users_backup_$(date +%Y%m%d).sql

-- Verify no code/reports reference clerk_id_deprecated
-- SELECT
--   tablename,
--   indexname
-- FROM pg_indexes
-- WHERE tablename = 'users'
--   AND indexname LIKE '%clerk%';

-- -- After 6 months:
-- DROP INDEX IF EXISTS idx_users_clerk_id_deprecated;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS clerk_id_deprecated;

-- ============================================================================
-- STEP 5: Drop Backfill Functions
-- ============================================================================

DROP FUNCTION IF EXISTS public.backfill_auth_user(UUID);
DROP FUNCTION IF EXISTS public.backfill_all_auth_users();
DROP FUNCTION IF EXISTS public.update_clerk_to_auth_map_updated_at();

-- ============================================================================
-- STEP 6: Drop clerk_webhook_events Table (Optional)
-- ============================================================================
-- This table was used for Clerk webhook tracking
-- Safe to drop after Clerk account deactivated

-- COMMENT ON TABLE public.clerk_webhook_events IS 'DEPRECATED: Clerk webhooks no longer in use';

-- -- After Clerk account deactivated:
-- DROP TABLE IF EXISTS public.clerk_webhook_events CASCADE;

-- ============================================================================
-- STEP 7: Update Migration Milestones
-- ============================================================================

INSERT INTO public.migration_milestones (milestone, metadata)
VALUES (
  'cleanup_complete',
  jsonb_build_object(
    'cleanup_date', now(),
    'compatibility_layer_removed', true,
    'mapping_table_status', 'retained_for_audit',
    'clerk_id_deprecated_status', 'retained_for_audit',
    'total_users', (SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL)
  )
)
ON CONFLICT (milestone) DO UPDATE
  SET completed_at = now(),
      metadata = EXCLUDED.metadata;

-- ============================================================================
-- STEP 8: Vacuum and Analyze (Performance Optimization)
-- ============================================================================
-- Run after dropping tables/columns to reclaim space

VACUUM FULL ANALYZE public.users;
VACUUM FULL ANALYZE public.conversations;
VACUUM FULL ANALYZE public.chat_sessions;
VACUUM FULL ANALYZE public.user_context;
VACUUM FULL ANALYZE public.conversation_memory;
VACUUM FULL ANALYZE public.topic_progression;
VACUUM FULL ANALYZE public.user_onboarding_milestones;
VACUUM FULL ANALYZE public.user_preferences;
VACUUM FULL ANALYZE public.data_export_requests;
VACUUM FULL ANALYZE public.idempotency_keys;
VACUUM FULL ANALYZE public.privacy_audit_log;
VACUUM FULL ANALYZE public.upload_sessions;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 1. Check which migration objects still exist
SELECT
  'view' AS object_type,
  viewname AS object_name
FROM pg_views
WHERE schemaname = 'public'
  AND viewname LIKE '%migration%'

UNION ALL

SELECT
  'function' AS object_type,
  proname AS object_name
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE '%migration%'
  OR proname LIKE '%clerk%'
  OR proname LIKE '%backfill%'

UNION ALL

SELECT
  'table' AS object_type,
  tablename AS object_name
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE '%migration%' OR tablename = 'clerk_webhook_events')

ORDER BY object_type, object_name;

-- 2. Check database size before and after cleanup
SELECT
  pg_size_pretty(pg_database_size('patmosllm')) AS database_size,
  pg_size_pretty(pg_total_relation_size('public.users')) AS users_table_size,
  pg_size_pretty(pg_total_relation_size('public.conversations')) AS conversations_table_size;

-- 3. Verify auth_user_id is used everywhere
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name = 'auth_user_id' OR column_name LIKE '%clerk%')
  AND table_name IN (
    'users', 'conversations', 'chat_sessions', 'user_context',
    'conversation_memory', 'topic_progression', 'user_preferences'
  )
ORDER BY table_name, column_name;

-- 4. Check migration milestones
SELECT * FROM public.migration_milestones
ORDER BY completed_at DESC;

-- ============================================================================
-- POST-CLEANUP TESTING CHECKLIST
-- ============================================================================
/*
Manual testing required after cleanup:

1. Authentication Flow
   - [ ] User login works
   - [ ] Session persistence works
   - [ ] Logout works

2. User Operations
   - [ ] View user profile
   - [ ] Update user profile
   - [ ] View conversation history

3. Admin Operations
   - [ ] View all users
   - [ ] Invite new user
   - [ ] Manage user roles

4. Database Performance
   - [ ] Query performance acceptable (P95 <200ms)
   - [ ] No RLS policy errors
   - [ ] Indexes performing well

5. Monitoring
   - [ ] Sentry shows no auth errors
   - [ ] Application logs clean
   - [ ] Database metrics normal
*/

-- ============================================================================
-- EMERGENCY ROLLBACK (If Cleanup Breaks Production)
-- ============================================================================
/*
-- 1. Restore from database backup
-- pg_restore -d patmosllm users_backup_YYYYMMDD.sql

-- 2. Re-run Migration 004 (compatibility layer)
-- \i 004_compat_layer.sql

-- 3. Set feature flag to Clerk fallback
-- UPDATE app_config SET dual_auth_enabled = true;

-- 4. Redeploy previous application version

-- 5. Investigate issue before retrying cleanup
*/

-- ============================================================================
-- FINAL MIGRATION SUMMARY
-- ============================================================================

SELECT
  jsonb_build_object(
    'migration_complete', true,
    'total_users_migrated', (
      SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL
    ),
    'auth_user_id_enforced', EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name = 'auth_user_id'
        AND is_nullable = 'NO'
    ),
    'clerk_id_deprecated', EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name = 'clerk_id_deprecated'
    ),
    'rls_policies_updated', (
      SELECT COUNT(*)
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('users', 'conversations', 'chat_sessions')
    ) > 0,
    'cleanup_complete', EXISTS (
      SELECT 1
      FROM public.migration_milestones
      WHERE milestone = 'cleanup_complete'
    )
  ) AS migration_status;

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. CRITICAL: Do NOT run this migration until 2+ weeks post-cutover
-- 2. Verify all success criteria met (see top of file)
-- 3. Create full database backup before running
-- 4. Run in maintenance window (low traffic period)
-- 5. Test extensively in staging first
-- 6. Monitor for 48 hours after cleanup
-- 7. Keep mapping table and clerk_id_deprecated for 6 months minimum
-- 8. Document final migration metrics for post-mortem
-- ============================================================================
