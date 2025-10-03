-- Add soft delete support to users table
-- Run this in Supabase SQL Editor

-- 1. Add deleted_at column
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create index for filtering deleted users (performance)
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- 3. Add comment for documentation
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp - NULL means active, non-NULL means deleted';
