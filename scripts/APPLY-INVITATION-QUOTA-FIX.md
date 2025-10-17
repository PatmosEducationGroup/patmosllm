# Fix Invitation Quota Refund Bug

## Problem
When someone accepts an invitation, the sender's quota is being incorrectly refunded (invites_used is decremented). This causes users to get their invitations back after acceptance, when they should only be refunded when invitations EXPIRE.

**Correct Behavior:**
- ✅ SEND invitation → increment `invites_used` (reduce available invitations)
- ✅ ACCEPT invitation → no change (already counted on send)
- ✅ EXPIRE invitation → decrement `invites_used` (refund)
- ✅ REVOKE invitation → no change (no refund to prevent abuse)

**Current Buggy Behavior:**
- ❌ ACCEPT invitation → incorrectly decrements `invites_used` (wrong refund)

---

## Step 1: Verify the Bug Exists

Run this query in **Supabase SQL Editor** to check if the bug is present:

```sql
-- Check if accept_invitation_and_link() has the incorrect increment logic
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'accept_invitation_and_link'
  AND routine_type = 'FUNCTION';
```

**Look for this pattern in the output:**
- If you see `invites_used = invites_used + 1` or similar increment logic in the function definition, the bug EXISTS
- If you DON'T see any quota modification logic, the bug has already been fixed

---

## Step 2: Apply the Fix

**⚠️ IMPORTANT: Only run this if Step 1 confirmed the bug exists**

1. Open **Supabase Dashboard** → Go to your project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the ENTIRE contents of `/scripts/fix-invitation-quota-logic.sql`
5. Paste into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)

You should see this output:
```
function_name                 | status
------------------------------+----------------------------------
increment_invites_used        | CREATED
accept_invitation_and_link    | UPDATED (removed double increment)
```

---

## Step 3: Verify the Fix

Run this query to confirm the fix was applied:

```sql
-- Verify that accept_invitation_and_link() no longer modifies invites_used
SELECT
  routine_name,
  CASE
    WHEN routine_definition LIKE '%invites_used%' THEN 'BUG STILL EXISTS'
    ELSE 'FIX APPLIED ✓'
  END as status
FROM information_schema.routines
WHERE routine_name = 'accept_invitation_and_link'
  AND routine_type = 'FUNCTION';
```

**Expected output:**
```
routine_name              | status
--------------------------+------------------
accept_invitation_and_link| FIX APPLIED ✓
```

---

## Step 4: Test the Fix

1. **Check current quota:**
   - Go to `/settings/invitations` as a user
   - Note the current "invitations remaining" count (e.g., "2 remaining")

2. **Send an invitation:**
   - Enter an email and click "Send Invitation"
   - Quota should decrease by 1 (e.g., now "1 remaining")

3. **Accept the invitation:**
   - Open the invitation link in an incognito window
   - Complete the signup process
   - Accept the invitation

4. **Verify quota DID NOT change:**
   - Go back to `/settings/invitations` as the original sender
   - Quota should STILL be "1 remaining" (NOT back to "2 remaining")
   - ✅ If quota stayed at "1 remaining" → Fix works!
   - ❌ If quota went back to "2 remaining" → Bug still exists

---

## Step 5: Reset Test Users (Optional)

If you created test users during testing, you can reset their quotas:

```sql
-- Grant 3 invitations to a specific user
SELECT grant_invites_to_user(
  p_user_id := 'USER_ID_HERE'::UUID,
  p_add_invites := 3
);

-- OR grant 3 invitations to all users
SELECT grant_invites_to_all(
  p_add_invites := 3,
  p_only_role := NULL -- or 'USER', 'CONTRIBUTOR', 'ADMIN'
);
```

---

## Troubleshooting

### "Function not found" error
If you get a "function does not exist" error, the function may not have been created yet. This means you're using the new TypeScript-only code path and don't need to apply this fix.

### Quota still being refunded after applying fix
1. Verify the fix was applied (run Step 3 query)
2. Clear your browser cache and cookies
3. Restart the Next.js dev server: `npm run dev`
4. Try the test again with a fresh invitation

### Need to rollback the fix
If something goes wrong, you can restore the original function by running `/scripts/create-user-invitation-system.sql` again. However, this will restore the bug, so only do this if absolutely necessary.

---

## Summary

- **File to run:** `/scripts/fix-invitation-quota-logic.sql`
- **Where to run:** Supabase SQL Editor
- **Expected result:** Invitations no longer refunded on acceptance
- **Test:** Send → Accept → Verify quota didn't increase
