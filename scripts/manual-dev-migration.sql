/**
 * Manual Dev Account Migration - SQL Script
 *
 * Run this in Supabase SQL Editor to manually migrate your dev account
 *
 * INSTRUCTIONS:
 * 1. Replace YOUR_EMAIL with your actual email
 * 2. Replace YOUR_PASSWORD with your desired password (min 8 chars)
 * 3. Replace YOUR_CLERK_ID with your Clerk user ID
 * 4. Run this entire script in Supabase SQL Editor
 *
 * To find your Clerk ID:
 * - Go to Clerk Dashboard > Users
 * - Find your user and copy the ID (starts with "user_")
 */

-- Step 1: Create Supabase Auth user
-- This will create the user and return their Supabase ID
DO $$
DECLARE
  v_supabase_id uuid;
  v_clerk_id text := 'YOUR_CLERK_ID';  -- Replace with your Clerk ID (e.g., 'user_2abc123...')
  v_email text := 'YOUR_EMAIL';        -- Replace with your email
  v_password text := 'YOUR_PASSWORD';  -- Replace with your password
BEGIN
  -- Create the auth user (or get existing)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),  -- Hash the password
    NOW(),
    NOW(),
    '',
    NOW(),
    '',
    NOW(),
    '',
    '',
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object(
      'clerk_id', v_clerk_id,
      'migrated', true,
      'migration_completed_at', NOW()
    ),
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO UPDATE
  SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW()
  RETURNING id INTO v_supabase_id;

  -- Get the Supabase ID if user already existed
  IF v_supabase_id IS NULL THEN
    SELECT id INTO v_supabase_id FROM auth.users WHERE email = v_email;
  END IF;

  RAISE NOTICE 'Supabase User ID: %', v_supabase_id;

  -- Step 2: Create or update migration mapping
  INSERT INTO public.user_migration (
    clerk_id,
    supabase_id,
    email,
    migrated,
    migrated_at,
    created_at
  )
  VALUES (
    v_clerk_id,
    v_supabase_id,
    v_email,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (clerk_id) DO UPDATE
  SET
    supabase_id = EXCLUDED.supabase_id,
    migrated = true,
    migrated_at = NOW();

  -- Step 3: Ensure user record exists in public.users
  INSERT INTO public.users (
    id,
    clerk_id,
    email,
    role,
    created_at
  )
  VALUES (
    v_supabase_id,
    v_clerk_id,
    v_email,
    'USER',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    clerk_id = EXCLUDED.clerk_id,
    email = EXCLUDED.email;

  RAISE NOTICE '✓ Migration complete!';
  RAISE NOTICE '  Email: %', v_email;
  RAISE NOTICE '  Clerk ID: %', v_clerk_id;
  RAISE NOTICE '  Supabase ID: %', v_supabase_id;
  RAISE NOTICE '';
  RAISE NOTICE 'You can now log in at: /auth/login-supabase';
END $$;
