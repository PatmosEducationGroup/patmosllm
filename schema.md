# PatmosLLM Database Schema

**Architecture Note**: All tables use `auth_user_id` (references `auth.users.id` from Supabase Auth) denormalized for Row-Level Security (RLS) and query performance. Migration from Clerk to Supabase Auth in progress.

---

## Core Tables

### users - User accounts and authentication
- `id` (uuid, PK) - Primary user identifier
- `auth_user_id` (uuid) - References `auth.users.id` - replacing `clerk_id` as primary identifier
- `clerk_id` (text, nullable) - Legacy Clerk user ID (nullable for Supabase-only users created via invitations)
- `clerk_user_id` (text, nullable) - Clerk user ID (nullable for Supabase-only users)
- `email` (text, unique)
- `name` (text, nullable) - User's display name
- `role` (text) - ADMIN, CONTRIBUTOR, or USER
- `deleted_at` (timestamptz, nullable) - Soft delete timestamp (NULL = active, non-NULL = deleted)
- `invitation_token` (uuid, nullable) - Token for invite-only registration
- `invitation_expires_at` (timestamptz, nullable)
- `invitation_sent_at` (timestamptz, nullable)
- **GDPR Consent Fields**:
  - `terms_accepted_at` (timestamptz) - When user accepted Terms of Service
  - `privacy_accepted_at` (timestamptz) - When user accepted Privacy Policy
  - `cookies_accepted_at` (timestamptz, nullable) - When user accepted Cookie Policy
  - `consent_version` (text) - Version of T&C/Privacy Policy user agreed to (e.g., "1.0")
  - `age_confirmed` (boolean) - User confirmed 13+ years old (COPPA compliance)

### conversations - Chat history and message threads
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for RLS and query performance
- `session_id` (uuid, FK → chat_sessions)
- `question` (text) - User's question
- `answer` (text) - AI's response
- `sources` (jsonb) - Array of source references
- `deleted_at` (timestamptz, nullable) - Soft delete timestamp
- `created_at` (timestamptz)

### documents - Document metadata and content storage
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `title` (text)
- `content` (text) - Extracted text content
- `file_name` (text)
- `file_type` (text)
- `file_size` (bigint)
- `storage_path` (text) - Blob/Supabase storage path
- `metadata` (jsonb) - File-specific metadata: chapters (EPUB), duration (audio/video), dimensions (images), etc.
- `chunk_count` (integer) - Number of chunks created
- `created_at`, `updated_at` (timestamptz)

### chunks - Vector search segments with embeddings
- `id` (uuid, PK)
- `document_id` (uuid, FK → documents)
- `content` (text) - Chunk text content
- `embedding` (vector) - Not stored in Postgres (lives in Pinecone)
- `metadata` (jsonb) - Chunk-specific metadata
- `created_at` (timestamptz)

### chat_sessions - Session management and state
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for RLS
- `conversation_id` (uuid, FK → conversations)
- `active` (boolean)
- `created_at`, `updated_at` (timestamptz)

### upload_sessions - File upload tracking and management
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for upload tracking
- `status` (text) - pending, processing, completed, failed
- `file_count` (integer)
- `created_at`, `updated_at` (timestamptz)

---

## Memory & Learning System

### user_context - Topic familiarity and preferences (JSONB-based)
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for user preferences
- `context_data` (jsonb) - User's topic knowledge, interests, learning style
- `created_at`, `updated_at` (timestamptz)

### conversation_memory - Conversation analysis and satisfaction tracking
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for memory tracking
- `conversation_id` (uuid, FK → conversations)
- `memory_data` (jsonb) - Conversation insights, user satisfaction, topics discussed
- `created_at` (timestamptz)

### topic_progression - Learning progression and expertise tracking
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for learning progression
- `topic` (text)
- `level` (text) - beginner, intermediate, advanced
- `interactions` (integer) - Number of questions on this topic
- `created_at`, `updated_at` (timestamptz)

### user_preferences - User settings and preferences
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid, nullable) - Denormalized `auth.users.id` for user settings
- **Cookie Consent Fields**:
  - `analytics_enabled` (boolean) - User allows analytics tracking (default: true)
  - `essential_cookies_only` (boolean) - User opted for essential cookies only (default: false)
  - `consent_timestamp` (timestamptz, nullable) - When cookie consent was given
  - `consent_ip_address` (inet, nullable) - IP address when consent was captured
  - `consent_policy_version` (varchar(20), nullable) - Cookie policy version accepted
  - `consent_user_agent` (text, nullable) - Browser user agent at consent time
- `preferences` (jsonb) - Email preferences, UI settings, notification preferences
  - Structure: `{ emailPreferences: { productUpdates, activitySummaries, tipsAndTricks, securityAlerts } }`
- `created_at`, `updated_at` (timestamptz)

### user_onboarding_milestones - Onboarding progress tracking
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for onboarding tracking
- `milestone` (text)
- `completed` (boolean)
- `completed_at` (timestamptz, nullable)
- `created_at` (timestamptz)

---

## GDPR & Privacy Compliance

### data_export_requests - GDPR data export tracking (Article 20 - Right to Data Portability)
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for GDPR exports
- `status` (text) - pending, completed, failed
- `export_url` (text, nullable) - Temporary download link
- `created_at` (timestamptz)

### privacy_audit_log - Privacy compliance audit trail
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for audit trail
- `action` (text) - Actions include:
  - `DATA_EXPORT_REQUESTED` - User requested GDPR data export
  - `ACCOUNT_DELETION_SCHEDULED` - User account deletion scheduled (30-day grace period)
  - `ACCOUNT_DELETION_CANCELLED` - User cancelled scheduled deletion
  - `CONSENT_UPDATED` - Cookie or privacy consent updated
  - `EMAIL_PREFERENCES_UPDATED` - Email notification preferences changed
  - `PROFILE_UPDATED` - User profile information changed
  - `PASSWORD_CHANGED` - User password changed
- `metadata` (jsonb) - Action-specific details
- `ip_address` (text, nullable) - Truncated IP (last octet removed: 192.168.x.x)
- `created_at` (timestamptz)

---

## Donation Tracking System

### daily_donation_estimates - User-facing aggregated donation estimates
- `user_id` (uuid, PK, FK → users) - User identifier
- `auth_user_id` (uuid, NOT NULL) - Denormalized `auth.users.id` for RLS
- `current_month_estimate_usd` (numeric(10,2), NOT NULL, default: 0.00) - Monthly usage cost
- `total_tokens_used` (bigint, default: 0) - Total tokens consumed this month
- `total_operations` (integer, default: 0) - Total operations this month
- `last_updated` (timestamptz, default: NOW()) - Last aggregation timestamp
- `created_at` (timestamptz, default: NOW())

### api_usage_internal_log - Raw usage tracking logs (admin-only, fire-and-forget)
- `id` (uuid, PK) - Log entry identifier
- `user_id` (uuid, FK → users, NOT NULL) - User who generated usage
- `service` (text, NOT NULL) - Service name: 'openai', 'voyage', 'pinecone', 'resend', 'supabase'
- `total_tokens` (integer, default: 0) - Tokens consumed (0 for non-token operations)
- `operation_count` (integer, default: 1) - Number of operations performed
- `estimated_cost_usd` (numeric(10,6), NOT NULL) - Calculated cost estimate
- `request_id` (uuid, nullable, unique) - Idempotency key for duplicate prevention
- `created_at` (timestamptz, default: NOW()) - When usage occurred
- `expires_at` (timestamptz, default: NOW() + 24 months) - Log retention expiration

### usage_tracking_consent - Opt-out consent management
- `user_id` (uuid, PK, FK → users) - User identifier
- `auth_user_id` (uuid, NOT NULL) - Denormalized `auth.users.id` for RLS
- `tracking_enabled` (boolean, default: true) - Opt-in/opt-out status (default: enabled)
- `consent_given_at` (timestamptz, default: NOW()) - When consent was recorded
- `created_at` (timestamptz, default: NOW())
- `updated_at` (timestamptz, default: NOW())

---

## System Tables

### ingest_jobs - Document processing job queue
- `id` (uuid, PK)
- `document_id` (uuid, FK → documents)
- `status` (text) - pending, processing, completed, failed
- `error_message` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### clerk_webhook_events - Clerk authentication event log
- `id` (uuid, PK)
- `event_type` (text)
- `payload` (jsonb)
- `processed` (boolean)
- `created_at` (timestamptz)

### idempotency_keys - Duplicate request prevention
- `id` (uuid, PK)
- `key` (text, unique)
- `auth_user_id` (uuid) - Denormalized `auth.users.id` for request deduplication
- `response` (jsonb, nullable)
- `created_at` (timestamptz)
- `expires_at` (timestamptz)

---

## Key Indexes

Performance-critical indexes for query optimization:

- All tables have indexes on `user_id` and `auth_user_id` for RLS performance
- `users.email` - Unique index for login
- `users.invitation_token` - Index for invite validation
- `conversations.user_id, created_at` - Composite index for chat history queries
- `documents.user_id, created_at` - Composite index for document lists

---

## Data Flow

1. **Upload**: File → Process → Chunk → Embed → Pinecone
2. **Query**: User → Embed → Hybrid Search → Context → LLM → Stream
3. **Auth**: Clerk → Middleware → Role validation
