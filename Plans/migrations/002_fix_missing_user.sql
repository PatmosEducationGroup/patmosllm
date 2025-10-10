-- ============================================================================
-- FIX: Manually backfill missing user
-- ============================================================================
-- User ID: 139c5046-970b-45cf-b1e8-dc32f8de7967
-- Email: emichaelray@gmail.com
-- Clerk ID: user_31c1MwQTvbzmF8fMioNwFINxM7j
-- ============================================================================

-- Attempt to backfill this specific user
SELECT public.backfill_auth_user('139c5046-970b-45cf-b1e8-dc32f8de7967'::UUID);

-- Verify the user now has auth_user_id
SELECT id, email, clerk_id, auth_user_id
FROM public.users
WHERE id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- Check if mapping was created
SELECT * FROM public.clerk_to_auth_map
WHERE public_user_id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- Re-run child table backfills for this user
-- conversations
UPDATE public.conversations c
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE c.user_id = u.id
  AND c.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL
  AND u.id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- chat_sessions
UPDATE public.chat_sessions cs
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE cs.user_id = u.id
  AND cs.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL
  AND u.id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- user_context
UPDATE public.user_context uc
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE uc.user_id = u.id
  AND uc.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL
  AND u.id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- Final verification
SELECT
  'conversations' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(auth_user_id) AS rows_with_auth_id,
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS percentage
FROM public.conversations
UNION ALL
SELECT
  'chat_sessions',
  COUNT(*),
  COUNT(auth_user_id),
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2)
FROM public.chat_sessions
UNION ALL
SELECT
  'user_context',
  COUNT(*),
  COUNT(auth_user_id),
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2)
FROM public.user_context;
