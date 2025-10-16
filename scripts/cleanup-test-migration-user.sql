-- Cleanup Test Migration User
-- Run this in Supabase SQL Editor after testing

-- Change this to your test email
DO $$
DECLARE
  test_email TEXT := 'test-migration@example.com';
  auth_user_uuid UUID;
BEGIN
  -- Get auth user UUID
  SELECT id INTO auth_user_uuid
  FROM auth.users
  WHERE email = test_email;

  IF auth_user_uuid IS NULL THEN
    RAISE NOTICE 'No test user found with email: %', test_email;
    RETURN;
  END IF;

  -- Delete from user_migration table
  DELETE FROM public.user_migration
  WHERE email = test_email;
  RAISE NOTICE 'Deleted migration record';

  -- Delete from users table
  DELETE FROM public.users
  WHERE email = test_email;
  RAISE NOTICE 'Deleted app user record';

  -- Delete from auth.users
  DELETE FROM auth.users
  WHERE email = test_email;
  RAISE NOTICE 'Deleted auth user';

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Test user cleanup complete: %', test_email;
  RAISE NOTICE '==============================================';

END $$;
