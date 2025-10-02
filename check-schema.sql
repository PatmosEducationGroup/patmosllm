-- Check if clerk_ticket column exists and view recent invitations
-- Run this in Supabase SQL Editor

-- 1. Check table schema for clerk_ticket column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('clerk_ticket', 'invitation_token', 'clerk_id', 'email');

-- 2. View the 3 most recent invitations with all relevant fields
SELECT
  id,
  email,
  clerk_id,
  invitation_token,
  clerk_ticket,
  created_at,
  invitation_expires_at
FROM users
ORDER BY created_at DESC
LIMIT 3;

-- 3. Check if there's an index on clerk_ticket
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'users'
  AND indexname = 'idx_users_clerk_ticket';
