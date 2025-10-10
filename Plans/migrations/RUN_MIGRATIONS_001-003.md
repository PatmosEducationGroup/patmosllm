# How to Run Migrations 001-003

## Prerequisites ✅
- [x] Database backup completed (64.58 MB, 11,500 records)
- [x] Service role access verified
- [x] Dependencies installed

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project (wxcvjiytvttjysbtghlr)
3. Click "SQL Editor" in the left sidebar
4. Create a new query

### 2. Run Migration 001 (Add Columns)

**File**: `001_add_auth_user_id_columns.sql`

**What it does**:
- Adds nullable `auth_user_id UUID` column to 13 tables
- Zero breaking changes (all columns nullable)
- Takes ~5 seconds

**Steps**:
1. Copy the entire contents of `001_add_auth_user_id_columns.sql`
2. Paste into Supabase SQL Editor
3. Click "Run" (or press Cmd/Ctrl + Enter)
4. Wait for "Success" message

**Verification**: Run this query after completion:
```sql
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'auth_user_id';
```
**Expected result**: 13 (one for each table)

---

### 3. Run Migration 002 (Mapping & Backfill)

**File**: `002_mapping_and_backfill.sql`

**What it does**:
- Creates `clerk_to_auth_map` table
- Creates backfill functions
- Populates `auth.users` with all 23 existing users
- Backfills `auth_user_id` for all 13 tables
- Takes ~2-5 minutes

**Steps**:
1. Copy the entire contents of `002_mapping_and_backfill.sql`
2. Paste into Supabase SQL Editor (replace previous query)
3. Click "Run"
4. Watch the output - you should see:
   - Mapping table created
   - Functions created
   - Backfill results (23 rows for PatmosLLM)
   - Child table updates

**Verification**: Run these queries after completion:
```sql
-- Check mapping table
SELECT COUNT(*) AS total_mappings FROM public.clerk_to_auth_map;
-- Expected: 23

-- Check users table
SELECT
  COUNT(*) AS total_users,
  COUNT(auth_user_id) AS users_with_auth_id,
  ROUND((COUNT(auth_user_id)::NUMERIC / COUNT(*)) * 100, 2) AS percentage_migrated
FROM public.users
WHERE deleted_at IS NULL AND NOT clerk_id LIKE 'invited_%';
-- Expected: 100% migrated

-- Check auth.users entries
SELECT COUNT(*) FROM auth.users WHERE raw_user_meta_data->>'migrated_from_clerk' = 'true';
-- Expected: 23
```

---

### 4. Run Migration 003 (Foreign Keys)

**File**: `003_constraints_not_valid_then_validate.sql`

**What it does**:
- Adds FK constraints using NOT VALID (zero downtime)
- Validates all constraints (allows concurrent writes)
- Takes ~30 seconds

**Steps**:
1. Copy the entire contents of `003_constraints_not_valid_then_validate.sql`
2. Paste into Supabase SQL Editor
3. Click "Run"
4. Wait for all constraints to be validated

**Verification**: Run this query after completion:
```sql
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  convalidated AS is_validated
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND conname LIKE '%auth_user_id%'
ORDER BY table_name;
```
**Expected result**: All constraints show `is_validated = true`

---

## Troubleshooting

### Migration 002 Fails with "auth.users insert permission denied"
**Solution**: Make sure you're using the service role key in Supabase SQL Editor. The SQL Editor runs with elevated permissions by default.

### Backfill function returns NULL for some users
**Check**: Run this to see which users failed:
```sql
SELECT id, email, clerk_id FROM public.users
WHERE deleted_at IS NULL
  AND NOT clerk_id LIKE 'invited_%'
  AND auth_user_id IS NULL;
```

### Constraint validation fails
**Reason**: Orphaned `auth_user_id` values (references non-existent auth.users)
**Fix**: Run this to find orphans:
```sql
SELECT u.id, u.email, u.auth_user_id
FROM public.users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
WHERE u.auth_user_id IS NOT NULL AND au.id IS NULL;
```

---

## After Migrations Complete

✅ All 23 users will have `auth_user_id` populated
✅ All 13 tables will have FK constraints to `auth.users`
✅ Zero downtime - your app continues using `clerk_id`
✅ Ready for Phase 2 (Compatibility Layer)

**Next Steps**:
- Tell me when migrations complete
- I'll verify the results
- We'll proceed to Phase 2 (Migration 004 - Compatibility Layer)
