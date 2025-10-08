# Database Transaction Implementation Guide

**Date**: October 8, 2025
**Task**: Implement PostgreSQL transactions for multi-step operations
**Estimated Time**: 2-3 hours

---

## Database Schema Overview (17 Tables)

**Core Data (Large):**
- `chunks` (24 MB) - Vector search segments with embeddings
- `documents` (15 MB) - Metadata & content storage
- `upload_sessions` (944 kB) - File upload tracking
- `conversations` (560 kB) - Chat history

**Memory System (Transaction Critical):**
- `user_context` (392 kB) - Topic familiarity & preferences
- `conversation_memory` (264 kB) - Conversation analysis
- `topic_progression` (72 kB) - Learning progression
- `question_patterns` (56 kB) - Global query patterns

**User Management:**
- `users` (256 kB) - Role-based access
- `user_onboarding_milestones` (136 kB) - Onboarding tracking
- `user_preferences` (32 kB) - User settings

**System/Utility:**
- `ingest_jobs` (208 kB) - Processing job queue
- `chat_sessions` (112 kB) - Session management
- `data_export_requests` (48 kB) - GDPR exports
- `clerk_webhook_events` (40 kB) - Auth event log
- `idempotency_keys` (32 kB) - Duplicate prevention
- `privacy_audit_log` (32 kB) - Privacy audit trail

---

## Step 1: Access Supabase Dashboard (5 minutes)

### 1.1 Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your PatmosLLM project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**

### 1.2 Verify Database Connection
Run this test query:
```sql
SELECT current_database(), current_user;
```

You should see your database name and `postgres` user.

---

## Step 2: Create Conversation Memory Transaction (30 minutes)

### 2.1 Run the SQL Script
1. Open `01-conversation-memory-transaction.sql`
2. Copy the **entire contents**
3. Paste into Supabase SQL Editor
4. Click **Run** (or press Ctrl/Cmd + Enter)

### 2.2 Verify Function Creation
```sql
SELECT
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_name = 'log_conversation_transaction';
```

**Expected Result**: 1 row showing function exists

### 2.3 Test the Transaction
```sql
-- Test with sample data
SELECT log_conversation_transaction(
  p_user_id := 'YOUR_USER_UUID_HERE'::UUID,
  p_session_id := gen_random_uuid(),
  p_conversation_id := gen_random_uuid(),
  p_question_text := 'Test question about database transactions',
  p_question_intent := 'conceptual',
  p_question_complexity := 0.7,
  p_extracted_topics := ARRAY['databases', 'transactions']::TEXT[],
  p_user_satisfaction := 0.8,
  p_had_search_results := TRUE,
  p_topic_familiarity := '{}'::JSONB,
  p_question_patterns := '{}'::JSONB,
  p_behavioral_insights := '{}'::JSONB,
  p_current_session_topics := ARRAY['databases']::TEXT[],
  p_cross_session_connections := '[]'::JSONB
);
```

**Expected Result**: JSON object with `"success": true`

**If Error**: Check that:
- User UUID exists in `users` table
- All required tables exist (conversation_memory, user_context, topic_progression, question_patterns)
- You have necessary permissions

---

## Step 3: Create Batch Document Transaction (30 minutes)

### 3.1 Run the SQL Script
1. Open `02-batch-document-transaction.sql`
2. Copy the **entire contents**
3. Paste into Supabase SQL Editor
4. Click **Run**

### 3.2 Verify Function Creation
```sql
SELECT
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_name IN ('save_document_transaction', 'save_documents_batch');
```

**Expected Result**: 2 rows (both functions)

### 3.3 Test Single Document Transaction
```sql
-- Test with sample data
SELECT save_document_transaction(
  p_title := 'Test Document',
  p_author := 'Web scraped from test.com',
  p_storage_path := 'scraped/test-1234.txt',
  p_mime_type := 'text/plain',
  p_file_size := 5000,
  p_content := 'This is test content for transaction testing.',
  p_word_count := 8,
  p_page_count := NULL,
  p_uploaded_by := 'YOUR_USER_UUID_HERE'::UUID,
  p_source_type := 'web_scraped',
  p_source_url := 'https://test.com/page'
);
```

**Expected Result**: JSON with `"success": true` and a `document_id`

### 3.4 Test Batch Document Transaction
```sql
-- Test batch processing
SELECT save_documents_batch(
  p_documents := '[
    {
      "title": "Doc 1",
      "author": "Web scraped from example.com",
      "storage_path": "scraped/doc1.txt",
      "mime_type": "text/plain",
      "file_size": 1000,
      "content": "Content 1",
      "word_count": 2,
      "page_count": null,
      "uploaded_by": "YOUR_USER_UUID_HERE",
      "source_type": "web_scraped",
      "source_url": "https://example.com/1"
    },
    {
      "title": "Doc 2",
      "author": "Web scraped from example.com",
      "storage_path": "scraped/doc2.txt",
      "mime_type": "text/plain",
      "file_size": 2000,
      "content": "Content 2",
      "word_count": 2,
      "page_count": null,
      "uploaded_by": "YOUR_USER_UUID_HERE",
      "source_type": "web_scraped",
      "source_url": "https://example.com/2"
    }
  ]'::JSONB
);
```

**Expected Result**: JSON with `"successful": 2` and `"failed": 0`

**Cleanup Test Data**:
```sql
-- Delete test documents
DELETE FROM documents WHERE title LIKE 'Test%' OR title LIKE 'Doc %';

-- Delete test conversation memory
DELETE FROM conversation_memory WHERE question_text LIKE 'Test%';
```

---

## Step 4: Update TypeScript Code (1 hour)

### 4.1 Update userContextManager.ts

**File**: `src/lib/userContextManager.ts`

**Find** (around line 467):
```typescript
async logConversation(
  userId: string,
  sessionId: string | null,
  conversationId: string | null,
  question: string,
  response: string,
  sources: Array<{title: string; author?: string; chunk_id: string}>,
  satisfaction?: number,
  hadSearchResults?: boolean
): Promise<void> {
  let topics: string[] | undefined

  try {
    topics = await this.extractTopics(question, response, sources)
    const intent = await this.classifyQuestionIntent(question)
    const complexity = await this.assessQuestionComplexity(question)

    return withSupabaseAdmin(async (supabase) => {
      const { error } = await supabase
        .from('conversation_memory')
        .insert({
          user_id: userId,
          // ... many fields
        })

      if (error) {
        logError(new Error('Failed to insert conversation memory'), {
          // ... error context
        })
      }
    })
  } catch (error) {
    // ... error handling
  }
}
```

**Replace with**:
```typescript
async logConversation(
  userId: string,
  sessionId: string | null,
  conversationId: string | null,
  question: string,
  response: string,
  sources: Array<{title: string; author?: string; chunk_id: string}>,
  satisfaction?: number,
  hadSearchResults?: boolean
): Promise<void> {
  let topics: string[] | undefined

  try {
    topics = await this.extractTopics(question, response, sources)
    const intent = await this.classifyQuestionIntent(question)
    const complexity = await this.assessQuestionComplexity(question)

    // Get current user context for transaction
    const context = await this.getUserContext(userId)

    return withSupabaseAdmin(async (supabase) => {
      // Use transaction instead of separate inserts
      const { data, error } = await supabase.rpc('log_conversation_transaction', {
        p_user_id: userId,
        p_session_id: sessionId,
        p_conversation_id: conversationId,
        p_question_text: question,
        p_question_intent: intent,
        p_question_complexity: complexity,
        p_extracted_topics: topics || [],
        p_user_satisfaction: satisfaction || 0.5,
        p_had_search_results: hadSearchResults !== undefined ? hadSearchResults : true,
        p_topic_familiarity: context.topicFamiliarity || {},
        p_question_patterns: context.questionPatterns || {},
        p_behavioral_insights: context.behavioralInsights || {},
        p_current_session_topics: context.currentSessionTopics || [],
        p_cross_session_connections: context.crossSessionConnections || []
      })

      if (error || !data?.success) {
        logError(new Error(data?.error || 'Failed to log conversation transaction'), {
          operation: 'logConversation',
          userId,
          sessionId: sessionId || 'none',
          conversationId: conversationId || 'none',
          dbError: error?.message || data?.error,
          dbCode: error?.code,
          phase: 'transaction_execution',
          severity: 'critical'
        })
        throw new Error('Conversation logging transaction failed')
      }

      loggers.database({
        conversationMemoryId: data.conversation_memory_id,
        topicsProcessed: data.topics_processed,
        operation: 'log_conversation_transaction'
      }, 'Conversation logged with transaction')
    })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to log conversation'), {
      operation: 'logConversation',
      userId,
      sessionId: sessionId || 'none',
      phase: 'topic_extraction_or_transaction',
      severity: 'high'
    })
    throw error
  }
}
```

### 4.2 Update scrape-website/save/route.ts

**File**: `src/app/api/scrape-website/save/route.ts`

**Find** (around line 118-148):
```typescript
// Create document record
const { data: document, error: dbError } = await supabaseAdmin
  .from('documents')
  .insert({
    title: cleanTitle,
    author: author,
    // ... many fields
  })
  .select()
  .single()

if (dbError) {
  result.failed++
  result.errors.push(`${page.url}: Database error - ${dbError.message}`)
  continue
}
```

**Replace with**:
```typescript
// Create document record using transaction
const { data: transactionResult, error: rpcError } = await supabaseAdmin
  .rpc('save_document_transaction', {
    p_title: cleanTitle,
    p_author: author,
    p_storage_path: `scraped/${Date.now()}-${cleanTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50)}.txt`,
    p_mime_type: 'text/plain',
    p_file_size: Buffer.byteLength(cleanedContent, 'utf8'),
    p_content: cleanedContent,
    p_word_count: wordCount,
    p_page_count: null,
    p_uploaded_by: user.id,
    p_source_type: 'web_scraped',
    p_source_url: page.url
  })

if (rpcError || !transactionResult?.success) {
  result.failed++
  result.errors.push(`${page.url}: Transaction failed - ${transactionResult?.error || rpcError?.message}`)
  logError(new Error(transactionResult?.error || 'Document transaction failed'), {
    operation: 'save_document_transaction',
    userId: user.id,
    url: page.url,
    title: cleanTitle,
    phase: 'database_transaction',
    severity: 'high',
    dbError: rpcError?.message,
    transactionError: transactionResult?.error
  })
  continue
}

// Extract document ID from transaction result
const documentId = transactionResult.document_id
const document = { id: documentId, title: cleanTitle }
```

---

## Step 5: Test in Development (30 minutes)

### 5.1 Test Conversation Logging
1. Start your dev server: `npm run dev`
2. Open the chat interface
3. Ask a question and check browser console
4. Verify in Supabase:
```sql
SELECT * FROM conversation_memory ORDER BY created_at DESC LIMIT 5;
SELECT * FROM user_context ORDER BY updated_at DESC LIMIT 5;
SELECT * FROM topic_progression ORDER BY last_interaction_date DESC LIMIT 10;
```

### 5.2 Test Batch Document Upload
1. Use the web scraper feature
2. Select multiple pages to save
3. Check the results
4. Verify in Supabase:
```sql
SELECT id, title, source_url, created_at
FROM documents
WHERE source_type = 'web_scraped'
ORDER BY created_at DESC
LIMIT 10;
```

### 5.3 Test Rollback Behavior
```sql
-- Temporarily break the function to test rollback
-- This should fail and rollback everything:
SELECT log_conversation_transaction(
  p_user_id := '00000000-0000-0000-0000-000000000000'::UUID, -- Non-existent user
  p_session_id := gen_random_uuid(),
  -- ... other params
);
```

**Expected**: Error returned, NO partial data in database

---

## Step 6: Monitor and Verify (ongoing)

### 6.1 Check Transaction Performance
```sql
-- View recent transaction calls
SELECT
  schemaname,
  funcname,
  calls,
  total_time,
  self_time,
  mean_time
FROM pg_stat_user_functions
WHERE funcname LIKE '%transaction%'
ORDER BY calls DESC;
```

### 6.2 Monitor for Errors
```sql
-- Check for failed transactions in logs
SELECT * FROM conversation_memory
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Look for gaps in IDs (indicates rollbacks)
SELECT * FROM documents
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## Troubleshooting

### Error: "permission denied for function"
**Solution**: Re-run the GRANT EXECUTE statements:
```sql
GRANT EXECUTE ON FUNCTION log_conversation_transaction TO service_role;
GRANT EXECUTE ON FUNCTION save_document_transaction TO service_role;
GRANT EXECUTE ON FUNCTION save_documents_batch TO service_role;
```

### Error: "column does not exist"
**Solution**: Check your table schema matches the function parameters. Run:
```sql
\d conversation_memory
\d user_context
\d topic_progression
\d documents
```

### Error: "function does not exist"
**Solution**: Verify the function name and schema:
```sql
SELECT routine_name, routine_schema
FROM information_schema.routines
WHERE routine_name LIKE '%transaction%';
```

### Transaction seems slow
**Solution**: Add indexes if needed:
```sql
CREATE INDEX IF NOT EXISTS idx_conversation_memory_user_id ON conversation_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_context_user_id ON user_context(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_progression_user_topic ON topic_progression(user_id, topic_name);
```

---

## Rollback Plan

If you need to remove the transactions:

```sql
-- Drop the functions
DROP FUNCTION IF EXISTS log_conversation_transaction CASCADE;
DROP FUNCTION IF EXISTS save_document_transaction CASCADE;
DROP FUNCTION IF EXISTS save_documents_batch CASCADE;

-- Revert TypeScript code to use direct .insert() calls
```

---

## Success Criteria

✅ All SQL functions created without errors
✅ Test transactions return `"success": true`
✅ TypeScript code updated and compiling
✅ Development testing shows data consistency
✅ No partial failures in database
✅ Performance is acceptable (< 500ms per transaction)

---

## Next Steps After Implementation

1. **Monitor Production**: Watch for transaction errors in Sentry
2. **Performance Tuning**: Add indexes if queries are slow
3. **Add More Transactions**: Consider other multi-step operations
4. **Documentation**: Update API docs with transaction behavior
5. **Testing**: Write integration tests for transaction rollback scenarios

---

**Questions?** Check the SQL comments in each file for detailed explanations.
