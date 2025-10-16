-- Create Unmigrated Test User for Migration Flow Testing
-- Run this in Supabase SQL Editor

-- Step 1: Create a Supabase Auth user (so they can log in with temporary password)
-- Note: Replace 'test-migration@example.com' with your test email
-- This creates the auth user and returns the UUID
DO $$
DECLARE
  test_email TEXT := 'test-migration@example.com';
  test_password TEXT := 'TempPassword123'; -- Change this
  auth_user_uuid UUID;
  app_user_uuid UUID;
BEGIN
  -- Create Supabase Auth user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    test_email,
    crypt(test_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO auth_user_uuid;

  RAISE NOTICE 'Created Supabase Auth user: %', auth_user_uuid;

  -- Step 2: Create app user record
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    auth_user_id,
    clerk_id, -- Fake Clerk ID to simulate unmigrated user
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    test_email,
    'Test Migration User',
    'USER',
    auth_user_uuid,
    'user_fake_clerk_' || substring(md5(random()::text) from 1 for 16), -- Fake Clerk ID
    NOW(),
    NOW()
  )
  RETURNING id INTO app_user_uuid;

  RAISE NOTICE 'Created app user: %', app_user_uuid;

  -- Step 3: Create migration record (UNMIGRATED)
  INSERT INTO public.user_migration (
    clerk_id,
    supabase_id,
    email,
    migrated, -- FALSE = unmigrated
    created_at
  ) VALUES (
    'user_fake_clerk_' || substring(md5(random()::text) from 1 for 16),
    auth_user_uuid,
    test_email,
    false, -- NOT MIGRATED YET
    NOW()
  );

  RAISE NOTICE 'Created unmigrated migration record for: %', test_email;

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'TEST USER CREATED SUCCESSFULLY!';
  RAISE NOTICE 'Email: %', test_email;
  RAISE NOTICE 'Password: %', test_password;
  RAISE NOTICE 'Auth UUID: %', auth_user_uuid;
  RAISE NOTICE 'Migration Status: UNMIGRATED (false)';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Sign in at /login with these credentials';
  RAISE NOTICE '2. Middleware should redirect to /migrate-password';
  RAISE NOTICE '3. Complete migration to test the flow';
  RAISE NOTICE '==============================================';

END $$;
