-- ============================================================
-- ADD OLD_TITLE COLUMN FOR TITLE CLEANUP SAFETY
-- ============================================================
-- Created: October 1, 2025
-- Purpose: Preserve original document titles before cleanup
-- Usage: Run in Supabase SQL Editor before cleanup-titles.js
-- ============================================================

-- Add column to store original title
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS old_title TEXT;

-- Add comment for documentation
COMMENT ON COLUMN documents.old_title IS 'Original title before cleanup script (October 2025) - used for audit trail and recovery';

-- Create index for queries (optional but helpful)
CREATE INDEX IF NOT EXISTS idx_documents_old_title ON documents(old_title);

-- Verify column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name = 'old_title';

-- ============================================================
-- RECOVERY QUERY (if needed)
-- ============================================================
-- To restore original titles:
-- UPDATE documents SET title = old_title WHERE old_title IS NOT NULL;

-- To see transformations:
-- SELECT id, old_title, title FROM documents WHERE old_title IS NOT NULL;
-- ============================================================
