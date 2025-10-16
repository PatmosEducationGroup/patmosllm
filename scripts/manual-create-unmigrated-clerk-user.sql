-- Manually Create Unmigrated Clerk User (For Dev Testing)
-- Run this in Supabase SQL Editor
-- This simulates what the Clerk webhook would do in production

DO $$
DECLARE
  test_email TEXT := 'emichaelray+migrationtest1@gmail.com';
  test_clerk_id TEXT := 'user_34AMbRMuIMlQGDh2u5JewJasHi6';
  test_password TEXT := 'TempDevPassword123!';
  auth_user_uuid UUID;
  app_user_uuid UUID;
BEGIN
  -- Step 1: Check if auth user already exists
  SELECT id INTO auth_user_uuid
  FROM auth.users
  WHERE email = test_email;

  IF auth_user_uuid IS NOT NULL THEN
    RAISE NOTICE 'Auth user already exists: %', auth_user_uuid;
  ELSE
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
  END IF;

  -- Step 2: Check if app user already exists
  SELECT id INTO app_user_uuid
  FROM public.users
  WHERE email = test_email;

  IF app_user_uuid IS NOT NULL THEN
    RAISE NOTICE 'App user already exists: %', app_user_uuid;

    -- Update with clerk_id and auth_user_id if missing
    UPDATE public.users
    SET
      clerk_id = COALESCE(clerk_id, test_clerk_id),
      auth_user_id = COALESCE(auth_user_id, auth_user_uuid)
    WHERE email = test_email;

    RAISE NOTICE 'Updated app user with clerk_id and auth_user_id';
  ELSE
    -- Create app user record
    INSERT INTO public.users (
      id,
      email,
      name,
      role,
      auth_user_id,
      clerk_id,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      test_email,
      'Test Migration User',
      'USER',
      auth_user_uuid,
      test_clerk_id,
      NOW(),
      NOW()
    )
    RETURNING id INTO app_user_uuid;

    RAISE NOTICE 'Created app user: %', app_user_uuid;
  END IF;

  -- Step 3: Check if migration record already exists
  IF EXISTS (SELECT 1 FROM public.user_migration WHERE email = test_email) THEN
    RAISE NOTICE 'Migration record already exists, updating to unmigrated';

    -- Update existing migration record to be UNMIGRATED
    UPDATE public.user_migration
    SET
      migrated = false,
      clerk_id = test_clerk_id,
      supabase_id = auth_user_uuid,
      migrated_at = NULL
    WHERE email = test_email;

    RAISE NOTICE 'Updated migration record to unmigrated';
  ELSE
    RAISE NOTICE 'Creating new migration record';

    -- Create new migration record (UNMIGRATED)
    INSERT INTO public.user_migration (
      clerk_id,
      supabase_id,
      email,
      migrated,
      created_at
    ) VALUES (
      test_clerk_id,
      auth_user_uuid,
      test_email,
      false,
      NOW()
    );

    RAISE NOTICE 'Created unmigrated migration record';
  END IF;

  -- Step 4: Summary
  RAISE NOTICE 'TEST USER SETUP COMPLETE';
  RAISE NOTICE 'Email: %', test_email;
  RAISE NOTICE 'Clerk ID: %', test_clerk_id;
  RAISE NOTICE 'Supabase Auth ID: %', auth_user_uuid;
  RAISE NOTICE 'App User ID: %', app_user_uuid;
  RAISE NOTICE 'Migration Status: UNMIGRATED';

END $$;

-- Verify the setup
SELECT
  u.id as app_user_id,
  u.email,
  u.clerk_id,
  u.auth_user_id,
  au.email as auth_email,
  m.migrated,
  m.clerk_id as migration_clerk_id,
  m.supabase_id as migration_supabase_id
FROM public.users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
LEFT JOIN public.user_migration m ON u.email = m.email
WHERE u.email = 'emichaelray+migrationtest1@gmail.com';
