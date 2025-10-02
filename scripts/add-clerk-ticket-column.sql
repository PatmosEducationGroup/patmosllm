-- Add clerk_ticket column to users table for storing Clerk invitation tickets
-- This allows the invite link to work in Clerk's Restricted mode

ALTER TABLE users
ADD COLUMN IF NOT EXISTS clerk_ticket TEXT;

-- Add index for faster lookups by clerk_ticket
CREATE INDEX IF NOT EXISTS idx_users_clerk_ticket ON users(clerk_ticket);

-- Update any existing pending invitations to have a placeholder (optional)
-- These will need to be re-invited to get a valid ticket
UPDATE users
SET clerk_ticket = 'legacy_invitation'
WHERE clerk_id LIKE 'invited_%'
  AND clerk_ticket IS NULL;
