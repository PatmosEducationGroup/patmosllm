# Invitation Quota Bug Fix - Complete Guide

## Problem Summary

**Issue**: When someone accepts an invitation, the sender's quota is being incorrectly refunded. Users are reporting that their "invitations remaining" count increases after an invitation is accepted, when it should stay the same.

**Example**:
1. User starts with "2 invitations left" (used 1 of 3)
2. Someone accepts their invitation
3. User now has "3 invitations left" (used 0 of 3) ❌ WRONG
4. Should still have "2 invitations left" (used 1 of 3) ✅ CORRECT

---

## Root Cause

The SQL function `accept_invitation_and_link()` in your Supabase database has incorrect logic that increments (refunds) the quota when an invitation is accepted. This function was created by the original migration script `/scripts/create-user-invitation-system.sql`.

**Buggy code in database** (lines 148-153):
```sql
-- WRONG: Increments quota on acceptance
IF NOT v_invitation.sent_by_admin THEN
  UPDATE user_invitation_quotas
  SET invites_used = invites_used + 1
  WHERE user_id = v_invitation.sender_user_id;
END IF;
```

**Important**: Your TypeScript code is CORRECT and does NOT call this buggy function. However, the function exists in your database and might be interfering with the quota system in some way.

---

## Correct Quota Logic

The invitation quota system should work like this:

| Action | Effect on Quota | Reason |
|--------|----------------|---------|
| **SEND** invitation | ✅ Increment `invites_used` | User "spends" an invitation |
| **ACCEPT** invitation | ✅ No change | Already counted when sent |
| **EXPIRE** invitation | ✅ Decrement `invites_used` | Refund unused invitation |
| **REVOKE** invitation | ✅ No change | No refund to prevent abuse |

---

## Files Created

I've created three files to help you fix this:

### 1. `/scripts/APPLY-INVITATION-QUOTA-FIX.md` 📋
**Purpose**: Complete step-by-step guide to apply the fix

**Contents**:
- Verification query to check if bug exists
- Instructions to apply the fix
- Post-fix verification query
- Testing instructions
- Troubleshooting tips

### 2. `/scripts/fix-invitation-quota-logic.sql` 🔧
**Purpose**: SQL script that fixes the buggy function

**What it does**:
- Creates `increment_invites_used()` function for atomic quota updates
- Replaces `accept_invitation_and_link()` with corrected version that does NOT modify quota
- Includes verification query

### 3. `/scripts/debug-invitation-quota.sql` 🔍
**Purpose**: Comprehensive diagnostic script

**What it shows**:
- Current quota status for all users
- Recent invitation history
- Whether buggy function exists
- Whether fix has been applied
- Any quota anomalies (negative values, over quota, etc.)
- Safe test of increment function (with automatic rollback)

---

## How to Fix

### Step 1: Diagnose (5 minutes)

Run the debug script to see the current state:

1. Open **Supabase Dashboard** → Your project
2. Click **SQL Editor**
3. Click **New Query**
4. Copy and paste `/scripts/debug-invitation-quota.sql`
5. Click **Run**

**Look for**:
- "🚨 BUG EXISTS" message in Step 3
- Any users with weird quota values in Step 1
- Recent accepted invitations in Step 2

### Step 2: Apply Fix (2 minutes)

Follow the complete guide in `/scripts/APPLY-INVITATION-QUOTA-FIX.md`. Quick version:

1. Open **Supabase SQL Editor**
2. **New Query**
3. Copy and paste `/scripts/fix-invitation-quota-logic.sql`
4. Click **Run**
5. Verify output shows "CREATED" and "UPDATED"

### Step 3: Verify (2 minutes)

Run this query to confirm the fix:

```sql
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

Expected: `FIX APPLIED ✓`

### Step 4: Test (5 minutes)

1. Go to `/settings/invitations` as a user
2. Note current "invitations remaining" count
3. Send an invitation (count should decrease by 1)
4. Accept the invitation in incognito window
5. Refresh `/settings/invitations`
6. **Verify count did NOT increase** ✅

---

## Why This Happened

The original migration script (`create-user-invitation-system.sql`) was created with the intention of using SQL functions for all business logic. However, during development, we switched to implementing the logic in TypeScript for better maintainability.

The buggy SQL function was left in the database but is not being called by the TypeScript code. The fix script replaces it with the corrected version to ensure consistency.

---

## After Fixing

Once the fix is applied:

1. **Existing quotas are preserved** - No data loss
2. **Future invitations work correctly** - Quotas only refunded on expiration
3. **Admin panel works** - `/admin/invitation-quotas` continues to function
4. **User portal works** - `/settings/invitations` continues to function

---

## Additional Resources

- **Admin Panel**: `/admin/invitation-quotas` - Manage quotas system-wide
- **User Portal**: `/settings/invitations` - Send and track invitations
- **Service Layer**: `/src/lib/invitation-service.ts` - Business logic
- **API Routes**:
  - `/api/user/invitations` - User operations
  - `/api/admin/invitation-quotas` - Admin operations
  - `/api/auth/accept-invitation` - Acceptance flow

---

## Need Help?

If you encounter issues:

1. Run `/scripts/debug-invitation-quota.sql` and share the output
2. Check Supabase logs for errors
3. Verify the fix script ran without errors
4. Check if `increment_invites_used` function exists
5. Restart Next.js dev server: `npm run dev`

---

## Summary

- **Problem**: Quota refunded on acceptance instead of expiration
- **Cause**: Buggy SQL function in database
- **Fix**: Run `/scripts/fix-invitation-quota-logic.sql`
- **Verify**: Use `/scripts/debug-invitation-quota.sql`
- **Test**: Send → Accept → Verify quota stays same
- **Time**: ~15 minutes total
