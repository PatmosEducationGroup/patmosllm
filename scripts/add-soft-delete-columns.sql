-- Add soft delete columns to chat_sessions and conversations tables
-- This allows tracking deleted data for analytics while hiding it from users

-- Add deleted_at column to chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add deleted_at column to conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for better query performance on non-deleted sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_deleted_at
ON chat_sessions(user_id, deleted_at)
WHERE deleted_at IS NULL;

-- Create index for better query performance on non-deleted conversations
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at
ON conversations(session_id, deleted_at)
WHERE deleted_at IS NULL;

-- Note: Run this in your Supabase SQL editor
