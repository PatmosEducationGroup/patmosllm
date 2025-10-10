-- ============================================================================
-- FIX: Handle duplicate auth.users entry for emichaelray@gmail.com
-- ============================================================================
-- Issue: auth.users entry exists but mapping/backfill incomplete
-- Solution: Find the auth_user_id and manually complete the migration
-- ============================================================================

-- Step 1: Find the existing auth.users ID for this email
SELECT id as auth_user_id, email
FROM auth.users
WHERE email = 'emichaelray@gmail.com';

-- Step 2: Manually create the mapping (replace AUTH_USER_ID with the ID from step 1)
-- You'll need to run this after seeing the result from Step 1
-- Replace 'PASTE_AUTH_USER_ID_HERE' with the actual UUID

/*
INSERT INTO public.clerk_to_auth_map (
  clerk_id,
  auth_user_id,
  public_user_id
) VALUES (
  'user_31c1MwQTvbzmF8fMioNwFINxM7j',
  'PASTE_AUTH_USER_ID_HERE',
  '139c5046-970b-45cf-b1e8-dc32f8de7967'
)
ON CONFLICT (clerk_id) DO UPDATE SET
  auth_user_id = EXCLUDED.auth_user_id,
  public_user_id = EXCLUDED.public_user_id;
*/

-- Step 3: Update public.users with auth_user_id
/*
UPDATE public.users
SET auth_user_id = 'PASTE_AUTH_USER_ID_HERE'
WHERE id = '139c5046-970b-45cf-b1e8-dc32f8de7967';
*/

-- Step 4: Backfill child tables
/*
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
*/

-- Step 5: Final verification
/*
SELECT
  'conversations' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(auth_user_id) AS rows_with_auth_id,
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS percentage
FROM public.conversations
UNION ALL
SELECT 'chat_sessions', COUNT(*), COUNT(auth_user_id),
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2)
FROM public.chat_sessions
UNION ALL
SELECT 'user_context', COUNT(*), COUNT(auth_user_id),
  ROUND((COUNT(auth_user_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2)
FROM public.user_context;
*/
