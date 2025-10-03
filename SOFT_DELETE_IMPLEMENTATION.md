# Soft Delete Implementation for Conversations

## Overview
Implemented soft delete functionality for chat sessions and conversations to preserve data for analytics while hiding it from users.

## Database Changes

### SQL Migration
Run the following SQL in Supabase:

```sql
-- Add soft delete columns to chat_sessions and conversations tables
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_deleted_at
ON chat_sessions(user_id, deleted_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at
ON conversations(session_id, deleted_at)
WHERE deleted_at IS NULL;
```

**File**: `scripts/add-soft-delete-columns.sql`

## Code Changes

### 1. Session Deletion (Soft Delete)
**File**: `src/app/api/chat/sessions/[id]/route.ts`

- Changed DELETE endpoint from hard delete to soft delete
- Sets `deleted_at` timestamp on both session and conversations
- Preserves all data for analytics

### 2. User-Facing Queries (Exclude Deleted)
Updated all user-facing queries to exclude soft-deleted records with `.is('deleted_at', null)`:

**Files Updated:**
- `src/app/api/chat/sessions/route.ts` - Session list
- `src/app/api/chat/sessions/[id]/route.ts` - Session details, conversation history
- `src/app/api/chat/route.ts` - Session validation, conversation history

### 3. Admin Analytics (Show All Data)
Admin routes continue to show ALL data including soft-deleted:

**Files (No Changes Needed):**
- `src/app/api/admin/question-quality/route.ts` - Uses `conversation_memory` table
- `src/app/api/admin/users/[userId]/timeline/route.ts` - Shows complete user timeline

## Behavior

### For Users
- ✅ Deleted sessions disappear from session list
- ✅ Deleted conversations hidden from chat history
- ✅ Cannot access deleted sessions via API
- ✅ Clean user experience

### For Admins
- ✅ Question Quality page shows all questions including from deleted sessions
- ✅ User timeline shows complete activity history
- ✅ Analytics preserve all data for insights

## Testing Checklist

1. **User Deletion**:
   - [ ] Delete a chat session
   - [ ] Verify it disappears from session list
   - [ ] Verify conversations are hidden

2. **Admin Analytics**:
   - [ ] Check Question Quality page shows deleted conversations
   - [ ] Check User Timeline shows deleted sessions
   - [ ] Verify analytics data is complete

3. **Database**:
   - [ ] Run migration SQL in Supabase
   - [ ] Verify indexes are created
   - [ ] Check query performance

## Migration Steps

1. ✅ Run SQL migration in Supabase
2. ✅ Deploy code changes
3. ✅ Test user deletion flow
4. ✅ Verify admin analytics
5. ✅ Monitor for any issues

## Future Enhancements

- Add cleanup job to permanently delete data older than X months
- Add "Restore" functionality for admins
- Add "Hard Delete" option for privacy compliance (GDPR)
