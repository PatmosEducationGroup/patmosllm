-- ============================================================================
-- Complete the migration for emichaelray@gmail.com
-- ============================================================================
-- auth_user_id: a2996e1a-8d21-4b26-924e-548fa9e82db4
-- public_user_id: 139c5046-970b-45cf-b1e8-dc32f8de7967
-- clerk_id: user_31c1MwQTvbzmF8fMioNwFINxM7j
-- ============================================================================

-- Step 1: Create the mapping entry
INSERT INTO public.clerk_to_auth_map (
  clerk_id,
  auth_user_id,
  public_user_id
) VALUES (
  'user_31c1MwQTvbzmF8fMioNwFINxM7j',
  'a2996e1a-8d21-4b26-924e-548fa9e82db4',
  '139c5046-970b-45cf-b1e8-dc32f8de7967'
)
ON CONFLICT (clerk_id) DO UPDATE SET
  auth_user_id = EXCLUDED.auth_user_id,
  public_user_id = EXCLUDED.public_user_id;

-- Step 2: Update public.users with auth_user_id
UPDATE public.users
SET auth_user_id = 'a2996e1a-8d21-4b26-924e-548fa9e82db4'
WHERE id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- Step 3: Backfill child tables
UPDATE public.conversations c
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE c.user_id = u.id
  AND c.auth_user_id IS NULL
  AND u.id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

UPDATE public.chat_sessions cs
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE cs.user_id = u.id
  AND cs.auth_user_id IS NULL
  AND u.id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

UPDATE public.user_context uc
SET auth_user_id = u.auth_user_id
FROM public.users u
WHERE uc.user_id = u.id
  AND uc.auth_user_id IS NULL
  AND u.id = '139c5046-970b-45cf-b1e8-dc32f8de7967';

-- Step 4: Final verification
SELECT COUNT(*) as total_mappings FROM public.clerk_to_auth_map;

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

-- Verify no users are missing auth_user_id (except deleted/invited)
SELECT COUNT(*) as users_missing_auth_id
FROM public.users
WHERE deleted_at IS NULL
  AND NOT clerk_id LIKE 'invited_%'
  AND auth_user_id IS NULL;
