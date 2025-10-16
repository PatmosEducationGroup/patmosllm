# Data Retention Policy

**Last Updated**: October 16, 2025
**Version**: 1.0

## Overview

This document outlines Multiply Tools' data retention practices, deletion procedures, and user rights in compliance with GDPR Articles 17 (Right to Erasure) and 20 (Right to Data Portability).

---

## Account Deletion Timeline

### Soft Delete (Grace Period)
When a user requests account deletion:
- **Immediate Effect**: Account is marked with `deleted_at` timestamp
- **Grace Period**: 30 days from deletion request
- **Access During Grace Period**: Account is locked - user cannot access any features except cancellation
- **Cancellation Options**:
  - **Authenticated Session**: Log in and click "Cancel Deletion" button at `/settings/delete-account`
  - **Magic Link**: Click cancellation link sent via email (no login required)
- **Data Retention**: All user data remains intact during grace period

### Permanent Deletion (After Grace Period)
**Planned for Future Implementation** (automated cron job):
- **Timeline**: 30 days after deletion request
- **Scope**: Permanent removal of:
  - User profile and authentication credentials
  - All conversations and chat history
  - All uploaded documents and associated chunks
  - User preferences and onboarding milestones
  - Conversation memory and topic progression
  - Chat sessions and upload sessions
- **Preserved for Compliance**:
  - Privacy audit logs (anonymized after 90 days)
  - Data export requests (metadata only, no personal data)
- **Vector Database**: Pinecone embeddings deleted via batch API

---

## Data Retention by Type

### User Profile Data
- **Storage**: `users` table in Supabase
- **Fields**: email, name, role, consent timestamps, invitation tokens
- **Retention**:
  - Active accounts: Indefinitely (while account is active)
  - Deleted accounts: 30-day grace period, then permanent deletion
- **Access**: User can export via `/api/privacy/export` (rate-limited to 1 per hour)

### Conversations & Chat History
- **Storage**: `conversations` table + Pinecone vectors
- **Fields**: question, answer, sources, session_id, deleted_at
- **Retention**:
  - Active accounts: Indefinitely (user-generated content)
  - Deleted accounts: Soft deleted immediately, permanently deleted after 30 days
- **Access**: Included in GDPR data export

### Uploaded Documents
- **Storage**: Vercel Blob (>50MB) or Supabase Storage (<50MB)
- **Metadata**: `documents` table (title, file_name, file_type, file_size, chunk_count)
- **Content**: `chunks` table + Pinecone embeddings
- **Retention**:
  - Active accounts: Indefinitely
  - Deleted accounts: Soft deleted immediately, permanently deleted after 30 days
- **Access**: Downloadable via `/api/documents/download/[documentId]`, included in data export

### User Preferences & Settings
- **Storage**: `user_preferences` table
- **Fields**: analytics_enabled, essential_cookies_only, email preferences (JSONB)
- **Retention**:
  - Active accounts: Indefinitely
  - Deleted accounts: Permanently deleted after 30-day grace period
- **Access**: Included in GDPR data export

### Learning & Memory System
- **Storage**: `user_context`, `conversation_memory`, `topic_progression` tables
- **Purpose**: Adaptive learning, conversation quality improvement
- **Retention**:
  - Active accounts: Indefinitely (improves personalization)
  - Deleted accounts: Permanently deleted after 30-day grace period
- **Access**: Included in GDPR data export

### Privacy Audit Logs
- **Storage**: `privacy_audit_log` table
- **Fields**: action, metadata, ip_address (truncated), created_at
- **Actions Tracked**:
  - `DATA_EXPORT_REQUESTED` - User exported data
  - `ACCOUNT_DELETION_SCHEDULED` - User requested deletion
  - `ACCOUNT_DELETION_CANCELLED` - User cancelled deletion (with method: `magic_link` or `authenticated_session`)
  - `CONSENT_UPDATED` - Cookie or privacy consent changed
  - `EMAIL_PREFERENCES_UPDATED` - Email notification preferences updated
  - `PROFILE_UPDATED` - Name or email changed
  - `PASSWORD_CHANGED` - Password updated
- **Retention**:
  - Active accounts: 2 years (compliance requirement)
  - Deleted accounts: 90 days post-deletion (anonymized: user_id nulled, only metadata preserved)
- **Privacy**: IP addresses truncated (last octet removed: `192.168.x.x`)
- **Access**: Not included in data export (operational security logs)

### Data Export Requests
- **Storage**: `data_export_requests` table
- **Fields**: status, export_url (temporary), created_at
- **Retention**:
  - Request metadata: 90 days
  - Export files: 24 hours (temporary Vercel Blob links - planned future enhancement)
- **Rate Limiting**: 1 export per hour per user (anti-abuse protection)

---

## User Rights (GDPR Compliance)

### Right to Data Portability (Article 20)
- **Endpoint**: `GET /api/privacy/export`
- **Format**: JSON (machine-readable)
- **Scope**: All user data from 9 tables:
  1. Profile (sanitized: removes `auth_user_id`, `invitation_token`)
  2. Conversations (questions, answers, sources)
  3. Documents (metadata + content)
  4. User Context (learning preferences)
  5. Preferences (email settings, UI preferences)
  6. Onboarding Milestones (progress tracking)
  7. Conversation Memory (satisfaction tracking)
  8. Topic Progression (expertise levels)
  9. Chat Sessions (session history)
- **Statistics**: Record counts, document sizes, account creation date
- **Rate Limit**: 1 export per hour (enforced via `data_export_requests` table)
- **Audit**: All exports logged to `privacy_audit_log`

### Right to Erasure (Article 17)
- **Endpoint**: `POST /api/privacy/delete`
- **Process**:
  1. User confirmation required (must type "DELETE")
  2. `deleted_at` timestamp set (30 days from request)
  3. Deletion token generated (`crypto.randomUUID()`)
  4. Email sent with magic link for cancellation
  5. Account locked (middleware blocks all features except cancellation)
  6. 30-day grace period begins
- **Cancellation**:
  - **Method 1 (Authenticated)**: Visit `/settings/delete-account`, click "Cancel Deletion" button
  - **Method 2 (Magic Link)**: Click link in email → public cancellation page → no login required
  - **Effect**: `deleted_at`, `deletion_token`, `deletion_token_expires_at` cleared immediately
  - **Audit**: Cancellation method tracked (`magic_link` vs `authenticated_session`)
- **Future Enhancement**: Automated cron job for permanent deletion after 30 days

### Right to Access
- **Method**: Same as data export (`GET /api/privacy/export`)
- **Response Time**: Immediate (no manual review required)

### Right to Rectification
- **Endpoints**:
  - `POST /api/user/update-profile` - Update name, email
  - `POST /api/user/update-password` - Change password
  - `POST /api/user/email-preferences` - Update email notification preferences
- **Audit**: All changes logged to `privacy_audit_log` with action type and metadata

---

## Middleware Enforcement During Grace Period

When `deleted_at` is set (account scheduled for deletion):

### Blocked Routes
- `/chat` - Chat interface
- `/admin` - Admin dashboard
- `/settings/profile` - Profile settings
- `/settings/email-preferences` - Email preferences
- `/settings/stats` - Statistics page
- `/settings/cookies` - Cookie management
- `/settings/data-request` - Data export (new requests blocked)
- All API routes except allowed list below

### Allowed Routes
- `/settings/delete-account` - View deletion status and cancel
- `/api/privacy/cancel-deletion` - Cancel deletion API
- `/api/privacy/validate-deletion-token` - Token validation API
- `/cancel-deletion/[token]` - Public cancellation page (no auth required)
- `/api/user/profile` - Read-only profile data (for React state)
- `/api/user/stats` - Read-only statistics (for deletion confirmation UI)
- `/api/auth/signout` - Logout

### Implementation
- **Location**: `src/middleware.ts`
- **Strategy**: Dual Supabase clients (anon for auth, admin for deletion check)
- **Redirect**: Users with `deleted_at` redirected to `/settings/delete-account`
- **Performance**: Deletion check runs on all routes (not just protected)

---

## Magic Link Cancellation System

### Token Generation
- **Method**: `crypto.randomUUID()` (cryptographically secure)
- **Storage**: `users.deletion_token` (uuid column)
- **Expiration**: `users.deletion_token_expires_at` (timestamptz, set to 30 days from deletion)
- **Uniqueness**: UUID guarantees uniqueness, database constraint enforces

### Email Notification
- **Service**: Resend (via direct SDK call, not HTTP fetch)
- **Template**: Plain text with:
  - Deletion date and days remaining
  - "Cancel Account Deletion" button with magic link
  - Explanation: "Your account is locked - You cannot access any features"
  - Alternative: "Or log in to cancel from your settings"
- **Sending**: Triggered immediately when deletion is scheduled (`POST /api/privacy/delete`)

### Public Cancellation Page
- **Route**: `/cancel-deletion/[token]` (no auth required)
- **UI**: Simple page with:
  - Multiply Tools header
  - Token validation status
  - User email display (from token lookup)
  - "Cancel Deletion & Restore Account" button
  - Success state with 3-second redirect to login
  - Error states for invalid/expired tokens
- **Security**: Token validated via `POST /api/privacy/validate-deletion-token` before displaying UI

### Cancellation API
- **Endpoint**: `POST /api/privacy/cancel-deletion`
- **Authentication**: Dual mode
  - **Session-based**: Uses `getCurrentUser()` from authenticated session
  - **Token-based**: Validates `deletion_token` from request body
- **Process**:
  1. Authenticate via session OR token
  2. Verify `deleted_at` is set (deletion scheduled)
  3. Check token expiration (if token-based)
  4. Clear all 3 fields: `deleted_at`, `deletion_token`, `deletion_token_expires_at`
  5. Log to `privacy_audit_log` with cancellation method (`magic_link` or `authenticated_session`)
  6. Return success response
- **Error Handling**:
  - Invalid/expired token → 401 Unauthorized
  - No scheduled deletion → 400 Bad Request
  - Database error → 500 Internal Server Error

### Audit Logging
- **Action**: `ACCOUNT_DELETION_CANCELLED`
- **Metadata**:
  - `original_deletion_date` - When deletion was scheduled
  - `cancelled_at` - Timestamp of cancellation
  - `cancelled_via` - Method used (`magic_link` or `authenticated_session`)
  - `ip_address` - Truncated IP address (last octet removed)

---

## OpenAI Training Policy

**User Data Usage**: Multiply Tools uses OpenAI's GPT-4o-mini for chat responses. Per OpenAI's enterprise API policy:

- **API Data**: User conversations sent via API are **NOT used for model training**
- **Retention**: OpenAI retains API data for 30 days for abuse monitoring, then permanently deletes
- **Zero Data Retention (ZDR)**: Enterprise customers can enable ZDR for immediate deletion after processing
- **Privacy**: All conversations processed server-side (never exposed to OpenAI's user-facing products)

**Reference**: See `/src/lib/openai.ts` for training policy comment and OpenAI API configuration.

---

## Data Security Measures

### Authentication & Access Control
- **Primary**: Supabase Auth (invite-only mode, email signups disabled)
- **Legacy**: Clerk (being phased out, dual auth during migration)
- **Row-Level Security (RLS)**: All Supabase tables enforce RLS policies
- **Admin API**: Used for user creation and management (bypasses signup restrictions)

### Data Encryption
- **In Transit**: HTTPS/TLS 1.3 for all API requests
- **At Rest**: Supabase PostgreSQL encryption, Vercel Blob encryption
- **Vectors**: Pinecone stores embeddings with AES-256 encryption

### Privacy Hardening
- **IP Truncation**: Last octet removed before logging (`192.168.x.x`)
- **Security Headers**: COOP/COEP headers prevent cross-origin attacks
- **Sentry Filtering**: `/chat` routes excluded from session replay (privacy protection)
- **Content Security Policy**: Restricts external resource loading

---

## Compliance Standards

- **GDPR (General Data Protection Regulation)**: EU data protection law
  - Article 17: Right to Erasure
  - Article 20: Right to Data Portability
  - Article 13/14: Right to Information (privacy policy)
- **COPPA (Children's Online Privacy Protection Act)**: Age verification required (13+)
- **Cookie Consent**: Granular consent for analytics and tracking cookies

---

## Contact & Questions

For questions about data retention, deletion, or privacy:
- **Email**: [Your support email]
- **Privacy Policy**: https://multiplytools.app/privacy
- **Terms of Service**: https://multiplytools.app/terms

---

## Version History

- **1.0** (October 16, 2025): Initial data retention policy
  - Documented 30-day grace period for account deletion
  - Explained soft delete vs permanent deletion
  - Documented magic link cancellation system
  - Listed data retention periods by type
  - Explained user rights under GDPR
