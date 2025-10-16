-- Setup Test User as Unmigrated Clerk User
-- Run this in Supabase SQL Editor
-- This simulates a real Clerk user who hasn't migrated yet

-- Replace these with your test user details from Clerk
DO $$
DECLARE
  test_email TEXT := 'emichaelray+migrationtest1@gmail.com';
  test_clerk_id TEXT := 'user_34AMbRMuIMlQGDh2u5JewJasHi6';
  user_record RECORD;
  auth_user_uuid UUID;
BEGIN
  -- Step 1: Check if user exists in users table
  SELECT * INTO user_record
  FROM users
  WHERE email = test_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found with email: %. Please sign in with Clerk first to create the user.', test_email;
  END IF;

  RAISE NOTICE 'Found user: % (ID: %)', user_record.email, user_record.id;

  -- Step 2: Ensure user has auth_user_id (Supabase Auth account)
  IF user_record.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'User has no auth_user_id. Sign in with Clerk first to trigger webhook.';
  END IF;

  auth_user_uuid := user_record.auth_user_id;
  RAISE NOTICE 'User has Supabase Auth ID: %', auth_user_uuid;

  -- Step 3: Ensure user has clerk_id
  IF user_record.clerk_id IS NULL THEN
    -- Update with the Clerk ID
    UPDATE users
    SET clerk_id = test_clerk_id
    WHERE id = user_record.id;

    RAISE NOTICE 'Added Clerk ID: %', test_clerk_id;
  ELSE
    test_clerk_id := user_record.clerk_id;
    RAISE NOTICE 'User already has Clerk ID: %', test_clerk_id;
  END IF;

  -- Step 4: Check if migration record exists
  IF EXISTS (SELECT 1 FROM user_migration WHERE email = test_email) THEN
    RAISE NOTICE 'Migration record exists, updating to unmigrated...';

    -- Update existing migration record to be UNMIGRATED
    UPDATE user_migration
    SET
      migrated = false,
      clerk_id = test_clerk_id,
      supabase_id = auth_user_uuid,
      migrated_at = NULL
    WHERE email = test_email;

    RAISE NOTICE 'Updated migration record to unmigrated';
  ELSE
    RAISE NOTICE 'No migration record found, creating new one...';

    -- Create new migration record (UNMIGRATED)
    INSERT INTO user_migration (
      clerk_id,
      supabase_id,
      email,
      migrated,
      created_at
    ) VALUES (
      test_clerk_id,
      auth_user_uuid,
      test_email,
      false,  -- NOT MIGRATED
      NOW()
    );

    RAISE NOTICE 'Created unmigrated migration record';
  END IF;

  -- Step 5: Verify final state
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'TEST USER SETUP COMPLETE!';
  RAISE NOTICE 'Email: %', test_email;
  RAISE NOTICE 'Clerk ID: %', test_clerk_id;
  RAISE NOTICE 'Supabase Auth ID: %', auth_user_uuid;
  RAISE NOTICE 'Migration Status: UNMIGRATED (false)';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Go to /login and enter: %', test_email;
  RAISE NOTICE '2. Should redirect to /sign-in';
  RAISE NOTICE '3. Sign in with Clerk credentials';
  RAISE NOTICE '4. Should redirect to /migrate-password';
  RAISE NOTICE '==============================================';

END $$;

-- Verify the setup
SELECT
  u.email,
  u.clerk_id,
  u.auth_user_id,
  m.migrated,
  m.clerk_id as migration_clerk_id,
  m.supabase_id as migration_supabase_id
FROM users u
LEFT JOIN user_migration m ON u.email = m.email
WHERE u.email = 'emichaelray+migrationtest1@gmail.com';
