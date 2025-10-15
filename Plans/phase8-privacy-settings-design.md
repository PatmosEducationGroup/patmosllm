# Phase 8: Privacy Settings Portal - Design Document

**Date**: October 15, 2025
**Status**: Design Phase
**Risk Level**: High (data deletion functionality)

---

## Overview

Privacy settings page at `/settings/privacy` that provides users with GDPR-compliant data export, account deletion, and privacy controls.

---

## Safety-First Implementation Strategy

### Build Order (Safest → Riskiest):
1. **Export API** (read-only, safest)
2. **UI Page** (display only)
3. **Soft Delete** (reversible with 30-day grace period)
4. **Cancel Deletion** (undo soft delete)
5. **Hard Delete Cron** (permanent deletion, tested last)

### Testing Requirements:
- Test each feature with test user accounts
- Verify rollback capability at each step
- Manual testing before any production deployment
- Dry-run mode for cron job

---

## UI Design

### Layout
```
┌─────────────────────────────────────────────┐
│  Privacy & Data Settings                    │
├─────────────────────────────────────────────┤
│                                             │
│  📊 Data Export                             │
│  ┌────────────────────────────────────────┐│
│  │ Download all your data in JSON format  ││
│  │                                        ││
│  │ [Export My Data]                       ││
│  └────────────────────────────────────────┘│
│                                             │
│  🔔 Analytics & Tracking                    │
│  ┌────────────────────────────────────────┐│
│  │ ☐ Allow analytics tracking (Sentry)   ││
│  │ ☐ Allow performance monitoring        ││
│  └────────────────────────────────────────┘│
│                                             │
│  🗑️ Account Deletion                        │
│  ┌────────────────────────────────────────┐│
│  │ ⚠️ Warning: This action is reversible  ││
│  │ for 30 days, then permanent.          ││
│  │                                        ││
│  │ What will be deleted:                 ││
│  │ • All conversations (218)             ││
│  │ • All uploaded documents (623)        ││
│  │ • User profile and preferences        ││
│  │ • Vector embeddings                   ││
│  │                                        ││
│  │ [Delete My Account]                   ││
│  └────────────────────────────────────────┘│
│                                             │
│  [← Back to Chat]                           │
└─────────────────────────────────────────────┘
```

### Pending Deletion State
```
┌─────────────────────────────────────────────┐
│  ⏳ Account Deletion Scheduled               │
├─────────────────────────────────────────────┤
│                                             │
│  Your account is scheduled for deletion on: │
│  November 14, 2025 (28 days remaining)      │
│                                             │
│  You can cancel deletion at any time before │
│  this date by clicking below:               │
│                                             │
│  [Cancel Deletion & Keep My Account]        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Database Schema Changes

### Add to `users` table:
```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
ADD COLUMN IF NOT EXISTS analytics_opt_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS analytics_opt_out_at TIMESTAMPTZ;

-- Index for cron job efficiency
CREATE INDEX IF NOT EXISTS idx_users_deletion_pending
ON users(deletion_requested_at)
WHERE deleted_at IS NULL AND deletion_requested_at IS NOT NULL;
```

### Existing tables already have:
```sql
-- data_export_requests table (exists from CLAUDE.md)
-- privacy_audit_log table (exists from CLAUDE.md)
```

---

## API Routes

### 1. `/api/privacy/export` (GET)
**Purpose**: Generate and email data export link
**Risk**: Low (read-only)
**Auth**: Requires authenticated user

**Flow**:
1. Validate user is authenticated
2. Create record in `data_export_requests` table
3. Gather all user data:
   - User profile from `users`
   - Conversations from `conversations`
   - Documents from `documents`
   - User context from `user_context`
   - Preferences from `user_preferences`
   - Onboarding milestones
4. Generate JSON file
5. Save to temporary storage (Vercel Blob)
6. Send email with download link (expires in 24 hours)
7. Log to `privacy_audit_log`

**Response**:
```json
{
  "success": true,
  "message": "Export request created. Check your email for download link.",
  "requestId": "uuid",
  "expiresAt": "2025-10-16T21:00:00Z"
}
```

### 2. `/api/privacy/delete` (POST)
**Purpose**: Soft delete user account (30-day grace period)
**Risk**: Medium (reversible, but affects user access)
**Auth**: Requires authenticated user

**Flow**:
1. Validate user is authenticated
2. Require password confirmation for extra security
3. Set `deletion_requested_at = NOW()`
4. Set `deleted_at = NULL` (will be set by cron job in 30 days)
5. Log to `privacy_audit_log`
6. Send confirmation email with cancellation link
7. **DO NOT delete anything yet** - just mark for deletion

**Response**:
```json
{
  "success": true,
  "message": "Account deletion scheduled for November 14, 2025",
  "deletionDate": "2025-11-14T21:00:00Z",
  "daysUntilDeletion": 30
}
```

**Side Effects**:
- User can still login (account not locked)
- Banner shown on all pages: "Your account is scheduled for deletion"
- User can cancel deletion at any time

### 3. `/api/privacy/cancel-deletion` (POST)
**Purpose**: Cancel pending account deletion
**Risk**: Low (restores access)
**Auth**: Requires authenticated user

**Flow**:
1. Validate user is authenticated
2. Verify `deletion_requested_at IS NOT NULL`
3. Set `deletion_requested_at = NULL`
4. Log to `privacy_audit_log`
5. Send confirmation email

**Response**:
```json
{
  "success": true,
  "message": "Account deletion cancelled. Your account is safe."
}
```

### 4. `/api/cron/delete-expired-users` (POST)
**Purpose**: Permanently delete accounts after 30-day grace period
**Risk**: Very High (permanent deletion)
**Auth**: Vercel Cron token or secret

**Flow**:
1. Validate cron token/secret
2. **DRY RUN MODE** (default): Log what would be deleted, don't actually delete
3. Find users where `deletion_requested_at < NOW() - INTERVAL '30 days'` AND `deleted_at IS NULL`
4. For each user:
   - Delete from `conversations` (CASCADE will handle `conversation_memory`)
   - Delete from `documents` (CASCADE will handle `chunks`)
   - Delete from `user_context`
   - Delete from `user_preferences`
   - Delete from `user_onboarding_milestones`
   - Delete vectors from Pinecone (filter by user_id)
   - Set `deleted_at = NOW()` on `users` (soft delete, keep audit trail)
   - **DO NOT** hard delete from `users` table (keep for audit)
5. Log all deletions to `privacy_audit_log`
6. Send email confirmation (if email still valid)

**Vercel Cron Config** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/delete-expired-users",
    "schedule": "0 2 * * *"
  }]
}
```

**Query Parameters**:
- `?dry_run=true` (default) - Log what would be deleted, don't delete
- `?dry_run=false` - Actually delete (requires manual trigger with confirmation)

---

## Data Export Format

### JSON Structure:
```json
{
  "export_metadata": {
    "user_id": "uuid",
    "email": "user@example.com",
    "exported_at": "2025-10-15T21:00:00Z",
    "format_version": "1.0"
  },
  "profile": {
    "email": "user@example.com",
    "role": "USER",
    "created_at": "2025-09-01T00:00:00Z",
    "terms_accepted_version": "1.0",
    "cookie_consent": "all"
  },
  "conversations": [
    {
      "id": "uuid",
      "title": "Chat about GDPR",
      "created_at": "2025-10-01T00:00:00Z",
      "messages": [...]
    }
  ],
  "documents": [
    {
      "id": "uuid",
      "title": "Privacy Policy.pdf",
      "uploaded_at": "2025-09-15T00:00:00Z",
      "file_size": 150000
    }
  ],
  "preferences": {
    "analytics_opt_out": false
  }
}
```

---

## Email Templates

### Data Export Email (Resend):
```
Subject: Your Data Export is Ready

Hi [User Name],

Your data export is ready for download. This link will expire in 24 hours.

[Download Your Data]

File includes:
- Your profile information
- All conversations (218)
- All uploaded documents (623)
- User preferences and settings

Need help? Reply to this email.

- PatmosLLM Team
```

### Deletion Scheduled Email:
```
Subject: Account Deletion Scheduled

Hi [User Name],

Your account is scheduled for deletion on November 14, 2025.

You have 30 days to change your mind. To cancel this deletion:
[Cancel Deletion]

What will be deleted:
- All conversations and chat history
- All uploaded documents
- User profile and preferences

Need help? Reply to this email.

- PatmosLLM Team
```

### Deletion Cancelled Email:
```
Subject: Account Deletion Cancelled

Hi [User Name],

Your account deletion has been cancelled. Your account is safe.

Welcome back!

- PatmosLLM Team
```

---

## Security Considerations

### Password Confirmation Required:
- Account deletion requires password re-entry
- Prevents accidental deletion from session hijacking

### Rate Limiting:
- Export: 1 per hour per user
- Delete: 1 per day per user
- Cancel: No limit (user should be able to cancel immediately)

### Audit Trail:
- All actions logged to `privacy_audit_log`
- Includes: user_id, action, timestamp, IP address (truncated)

### Cron Job Security:
- Validate `CRON_SECRET` token
- Default to `dry_run=true` mode
- Require manual confirmation for `dry_run=false`
- Send admin notification for each deletion batch

---

## Testing Strategy

### Unit Tests:
- Test export data gathering
- Test soft delete logic
- Test cancellation logic
- Test date calculations (30 days)

### Integration Tests:
1. Export flow (create request, verify email sent)
2. Soft delete flow (verify `deletion_requested_at` set)
3. Cancel flow (verify `deletion_requested_at` cleared)
4. Cron job dry run (verify logging only)

### Manual Testing:
1. Create test user account
2. Upload test document
3. Create test conversation
4. Export data → verify JSON content
5. Delete account → verify banner shown
6. Login again → verify still accessible
7. Cancel deletion → verify banner removed
8. Delete again → wait 30 days (or manually trigger cron)
9. Verify data actually deleted

---

## Rollback Plan

### If Export Breaks:
- Revert API route commit
- Users can contact support for manual export

### If Delete Breaks:
- Revert API route commit
- Manually clear `deletion_requested_at` for affected users

### If Cron Job Deletes Wrong Data:
- **RESTORE FROM BACKUP** (this is why we made backups first!)
- Run restore script:
  ```bash
  node scripts/restore-supabase.js backups/supabase-backup-2025-10-15T21-17-56-116Z.json
  node scripts/restore-pinecone.js backups/pinecone-backup-patmosllm-voyage-default-2025-10-15T21-18-28-195Z.json
  ```

---

## Success Criteria

- ✅ Users can export all their data in JSON format
- ✅ Users receive email with download link
- ✅ Users can delete their account with 30-day grace period
- ✅ Users can cancel deletion during grace period
- ✅ Cron job deletes expired accounts automatically
- ✅ All actions logged to `privacy_audit_log`
- ✅ Zero data loss from accidental deletion
- ✅ GDPR compliant (right to export, right to deletion)

---

## Implementation Order

### Step 1: Export API (Safest)
- Build `/api/privacy/export` route
- Test with test user
- Verify JSON format

### Step 2: UI Page
- Build `/settings/privacy` page
- Add navigation link
- Test export button

### Step 3: Soft Delete
- Build `/api/privacy/delete` route
- Test with test user
- Verify reversible

### Step 4: Cancel Deletion
- Build `/api/privacy/cancel-deletion` route
- Test cancellation flow
- Verify restoration

### Step 5: Cron Job (Riskiest)
- Build `/api/cron/delete-expired-users` route
- Test in dry-run mode ONLY
- Manual trigger for testing
- Verify deletion logic

### Step 6: Production Testing
- Create test account in production
- Run full flow
- Verify all emails sent
- Verify data actually deleted

---

## Timeline

- **Export API**: 2-3 hours
- **UI Page**: 1-2 hours
- **Soft Delete**: 2-3 hours
- **Cancel Deletion**: 1-2 hours
- **Cron Job**: 2-3 hours
- **Testing**: 2-3 hours
- **Total**: 10-16 hours

---

## Next Steps

1. Review this design document
2. Get approval from user
3. Start with Export API (safest)
4. Test each feature incrementally
5. Deploy to production with monitoring
