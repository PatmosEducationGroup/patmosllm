# Quick Start Guide - Database Transactions

## What We Fixed

Based on constraint check results from your database:

1. **`user_satisfaction`** uses **1-5 scale** (not 0-10 as initially assumed)
2. **Documents table** has NO `updated_at` column (only `created_at` and `processed_at`)
3. **Foreign key requirements**: `session_id` and `conversation_id` must exist in their respective tables

## Files Ready to Deploy

All SQL functions have been fixed and are ready to deploy:

### 1. Conversation Memory Transaction
**File**: `01-conversation-memory-transaction-REVISED.sql`
- ✅ Fixed satisfaction scale (1-5)
- ✅ Fixed satisfaction threshold (>= 4 for "good")
- ✅ Ready to deploy

### 2. Batch Document Transaction
**File**: `02-batch-document-transaction.sql`
- ✅ Removed `updated_at` column
- ✅ Ready to deploy

### 3. Updated Test Script
**File**: `04-test-transactions.sql`
- ✅ Creates session and conversation first
- ✅ Uses correct satisfaction values (1-5)
- ✅ Ready to test

---

## Deploy Now (3 Steps)

### Step 1: Deploy Conversation Transaction (2 minutes)
1. Open Supabase SQL Editor
2. Copy **ENTIRE contents** of `01-conversation-memory-transaction-REVISED.sql`
3. Paste and click **Run**
4. Verify: You should see "Success" message

### Step 2: Deploy Document Transaction (2 minutes)
1. In Supabase SQL Editor
2. Copy **ENTIRE contents** of `02-batch-document-transaction.sql`
3. Paste and click **Run**
4. Verify: You should see "Success" message

### Step 3: Test Everything (10 minutes)
1. Open `04-test-transactions.sql`
2. Get a real user ID:
   ```sql
   SELECT id, email FROM users ORDER BY created_at DESC LIMIT 5;
   ```
3. Follow Steps 2-11 in the test script
4. All tests should return `"success": true`

---

## What Happens Next?

After successful testing, we'll update the TypeScript code to use these transaction functions:

1. Update `src/lib/userContextManager.ts` → Use `log_conversation_transaction`
2. Update `src/app/api/scrape-website/save/route.ts` → Use `save_document_transaction`

This ensures **atomic operations** - no more partial failures where conversation saves but memory doesn't update!

---

## Need Help?

- **Deployment issues**: Check `03-transaction-implementation-guide.md` for troubleshooting
- **Test failures**: See `05-fix-and-retest.md` for detailed error analysis
- **Schema questions**: Run `00-verify-schema.sql` to check current schema
