# PatmosLLM - AI-Powered Document Search & Chat System

**Overall Assessment: 7.5/10** - Production-ready RAG application with identified improvements

## Table of Contents
1. [Quick Start Commands](#quick-start-commands)
2. [System Architecture](#system-architecture)
3. [GDPR Compliance](#gdpr-compliance)
4. [Current Status](#current-status)
5. [Priority Roadmap](#priority-roadmap)
6. [Technical Debt](#technical-debt)
7. [Metrics to Track](#metrics-to-track)

---

## Quick Start Commands

```bash
# Development
npm run dev                   # Start development server
npm run build                 # Production build
npm run lint                  # Run linter

# Testing & Quality
npm run test                  # Run unit tests (121 tests, 78% pass rate)
npm run test:ui               # Run tests with UI
npm run test:coverage         # Generate coverage report
npm audit                     # Security vulnerability scan

# Performance & Monitoring
npm run test:performance      # Load test (50 concurrent users)
npm run health                # System health check
npm run monitor               # Real-time monitoring

# Backup & Restore
node scripts/backup-pinecone.js           # Backup vectors (≤10K)
node scripts/backup-pinecone-large.js     # Backup large vectors
node scripts/backup-supabase.js           # Database backup

# Document Cleanup
node scripts/cleanup-titles.js --dry-run  # Preview title cleanup
node scripts/cleanup-titles.js --verify   # Verify database integrity
node scripts/cleanup-titles.js            # Execute title cleanup
```

---

## System Architecture

Next.js 15 RAG application with hybrid search, real-time chat, and multimedia processing.

### Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, Clerk auth, Supabase (PostgreSQL), Pinecone vectors
- **AI**: GPT-4o-mini chat, Voyage-3-large embeddings, hybrid search
- **Storage**: Vercel Blob (>50MB), Supabase Storage (<50MB)
- **Processing**: OCR, multimedia extraction, 25+ file formats

### Database Schema

**High-Level Overview** (see [`schema.md`](schema.md) for complete details):

**Core Tables**: users, conversations, documents, chunks, chat_sessions, upload_sessions

**Memory System**: user_context, conversation_memory, topic_progression, user_preferences, user_onboarding_milestones

**GDPR & Privacy**: data_export_requests, privacy_audit_log

**Donation Tracking**: daily_donation_estimates, api_usage_internal_log, usage_tracking_consent (see [`completed.md`](completed.md) for implementation details)

**System Tables**: ingest_jobs, clerk_webhook_events, idempotency_keys

**Architecture Note**: All tables use `auth_user_id` (references `auth.users.id` from Supabase Auth) denormalized for Row-Level Security (RLS) and query performance. Migration from Clerk to Supabase Auth in progress.

### Core Data Flow
1. **Upload**: File → Process → Chunk → Embed → Pinecone
2. **Query**: User → Embed → Hybrid Search → Context → LLM → Stream
3. **Auth**: Clerk → Middleware → Role validation

### Key API Routes

#### Core Application
- `/api/chat/*` - Streaming chat with session management and AI document generation
- `/api/upload/*` - Document processing pipeline
- `/api/admin/*` - System administration
- `/api/documents/download/[documentId]` - Secure document downloads
- `/api/download/[fileId]` - Generated document downloads (PDF/PPTX/XLSX)

#### User Profile & Settings
- `/api/user/profile` - GET user profile information
- `/api/user/update-profile` - POST profile updates (name, email)
- `/api/user/update-password` - POST password changes
- `/api/user/email-preferences` - GET/POST email notification preferences
- `/api/user/stats` - GET basic user statistics
- `/api/user/detailed-stats` - GET comprehensive analytics

#### GDPR Privacy & Compliance
- `/api/privacy/export` - GET GDPR data export (Article 20)
- `/api/privacy/delete` - POST account deletion with 30-day grace period (Article 17)
- `/api/privacy/cancel-deletion` - POST cancel scheduled account deletion
- `/api/privacy/validate-deletion-token` - POST validate magic link token

#### Authentication
- `/api/auth/signout` - POST Supabase logout

### Environment Variables

**Application**:
- `NEXT_PUBLIC_APP_URL`

**Authentication**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

**Database & Storage**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PINECONE_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

**AI Services**:
- `OPENAI_API_KEY`
- `VOYAGE_API_KEY`
- `RESEND_API_KEY`

**Rate Limiting**:
- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST endpoint (optional, falls back to in-memory)
- `UPSTASH_REDIS_REST_TOKEN` - Authentication token (optional)
- `RATE_LIMIT_EXEMPT_USERS` - Comma-separated list of exempt user IDs

---

## GDPR Compliance

**Status**: Fully compliant with Articles 17 (Right to Erasure) and 20 (Right to Data Portability)

**See [`GDPR_DEPLOYMENT_ROADMAP.md`](GDPR_DEPLOYMENT_ROADMAP.md) for complete implementation details.**

### Settings Portal
- `/settings` - Home with user statistics
- `/settings/profile` - Profile management (name, email, password)
- `/settings/email-preferences` - Email notification controls (4 toggles)
- `/settings/stats` - Detailed analytics
- `/settings/data-request` - GDPR data export (Article 20)
- `/settings/cookies` - Cookie consent management
- `/settings/delete-account` - Account deletion with magic link cancellation (Article 17)

### Key Features

**Account Deletion** (Article 17):
- 30-day grace period with soft delete (`deleted_at` timestamp)
- Magic link email for password-free cancellation
- Middleware blocks all features during grace period
- Dual authentication (session-based OR token-based)
- Full audit logging to `privacy_audit_log`

**Data Export** (Article 20):
- Exports data from 9 tables (profile, conversations, documents, etc.)
- Rate limited: 1 export per hour
- JSON format (machine-readable, GDPR-compliant)
- Full audit logging

**Privacy Audit Log**:
- Actions tracked: DATA_EXPORT_REQUESTED, ACCOUNT_DELETION_SCHEDULED, ACCOUNT_DELETION_CANCELLED, CONSENT_UPDATED, EMAIL_PREFERENCES_UPDATED, PROFILE_UPDATED, PASSWORD_CHANGED
- IP truncation (192.168.x.x)
- 2-year retention (active) / 90-day retention (deleted accounts)

**Data Retention**:
- **Active**: User data, conversations, documents, preferences (indefinitely), audit logs (2 years)
- **Deleted** (after 30-day grace): Permanent deletion of profile, conversations, documents, preferences. Audit logs 90 days (anonymized).
- See `/docs/data-retention-policy.md` for comprehensive policy

**OpenAI Training Policy**: User conversations NOT used for model training (30-day retention for abuse monitoring, then deleted)

---

## Current Status

**Production-Ready**: GDPR-compliant, mobile-first, AI document generation

### Strengths ✅
- **Performance (9/10)**: 500+ concurrent users, 67x cache improvement, hybrid search
- **Code Quality (7/10)**: TypeScript usage, clean structure, ESLint compliance
- **Maintainability (7/10)**: Clear architecture, documented patterns
- **Features**: AI document generation, memory system, secure downloads, mobile-first UI, 25+ file formats

### Key Metrics
- **500+ concurrent users** via optimized connection pooling
- **67x faster cache hits** (201ms → 3ms for repeated questions)
- **75% faster database** queries with connection management
- **40% better search** accuracy with semantic + keyword hybrid
- **100% document ingestion** success rate (462/462 documents, 7,956+ chunks)

### Current State
- **Testing**: 121 tests (78% pass rate), CI/CD pipeline operational
- **Security**: Sentry monitoring, structured logging (88% complete), TypeScript 100%, role-based tiered rate limiting (Upstash Redis), all 32 Supabase functions secured
- **Known Issues**: 18 test failures

**Recent Major Features** (see [`completed.md`](completed.md) for details):
- Role-based tiered rate limiting with Upstash Redis (4 role tiers: USER/CONTRIBUTOR/ADMIN/SUPER_ADMIN) - 2025-10-16
- Supabase security hardening (all 32 functions secured with search_path) - 2025-10-16
- GDPR Article 17 & 20 compliance (data export + account deletion)
- Profile settings with email preference controls
- AI document generation (PDF/PPTX/XLSX)
- Donation tracking system (cost transparency)
- Comprehensive error tracking and logging

---

## Priority Roadmap

### 🚨 Critical (Week 1-2)

**See [`security-risks.md`](security-risks.md) for complete security assessment.**

#### Testing Foundation
- [ ] Fix integration test failures (18 tests failing, 78% pass rate → target 95%+)
- [ ] Expand test coverage (current ~35% → target: 70% utilities, 50% routes)
- [ ] Add Playwright E2E tests for critical user flows

**Estimated Time**: 16-24 hours | **Impact**: Reliable CI/CD, catch regressions before production

### ⚡ High Priority (Week 3-4)

#### Performance & Scalability
- [ ] Implement database transactions for multi-step operations (partially done: 3 stored procedures)
- [ ] Add bundle size monitoring (`@next/bundle-analyzer`)
- [ ] Optimize cache key generation (replace `JSON.stringify`)
- [ ] Add performance monitoring middleware (Vercel Analytics installed, no custom APM)

**Estimated Time**: 12-16 hours | **Impact**: Better scalability, faster responses

#### Code Quality & Maintainability
- [ ] Refactor chat route into service layer (current: 1,276 lines, need: `ChatService.ts`, `ConversationRepository.ts`, `StreamingService.ts`)
- [ ] Standardize API response format (envelope pattern)
- [ ] Add JSDoc documentation to public functions
- [ ] Add Suspense boundaries for async components (2 files using Suspense, expand coverage)
- [ ] Replace final 36 console.log statements with structured logging
- [ ] Remove commented debug code

**Estimated Time**: 16-20 hours | **Impact**: Easier maintenance, faster onboarding

### 📋 Medium Priority (Month 2)

#### User Growth & Monetization
- [ ] Gmail-style invitation system with user quotas (3-5 invites per user)
- [ ] Public waitlist with position tracking and referral system
- [ ] Real-time usage/cost tracking (token consumption monitoring)
- [ ] Cost transparency dashboard ("$3.47 this month")
- [ ] Donation integration (Stripe/PayPal) with Wikipedia-style requests

**Token Tracking & Cost Display Requirements** (User Request - October 2024):
Display token usage and monthly cost in **4 prominent locations**:
1. **`/chat` page** - Header area, above username (most prominent placement)
2. **`/settings` page** - Main settings home page
3. **`/settings/stats` page** - Detailed statistics page
4. **`/settings/donate` page** - NEW PAGE: Donation/contribution page with:
   - Current month cost display
   - Historical usage graphs
   - Wikipedia-style voluntary donation options
   - Transparency messaging about infrastructure costs
   - Stripe/PayPal integration for contributions

#### Enhanced User Experience
- [ ] Progressive Web App (PWA) with offline capabilities
- [ ] Adaptive similarity thresholds for dynamic scoring
- [ ] Source confidence rating and quality scoring
- [ ] User feedback system to learn from ratings
- [ ] Advanced analytics and usage insights

#### Advanced Features
- [ ] Event-driven document processing (Inngest/QStash)
- [ ] Feature flags system (Vercel Feature Flags)
- [ ] Query rewriting with LLM for better search
- [ ] Vector database metadata filtering
- [ ] E2E tests with Playwright
- [ ] Document relationships and intelligent content linking

---

## Technical Debt

**See [`security-risks.md`](security-risks.md) for complete security assessment.**

### ✅ Security Issues (All Resolved - 2025-10-16)
1. **Rate limiting** - ✅ FIXED: Migrated to Upstash Redis with role-based tiered limits (USER/CONTRIBUTOR/ADMIN/SUPER_ADMIN multipliers)
2. **Supabase security** - ✅ FIXED: All 32 database functions secured with `search_path=pg_catalog, pg_temp`

### ⚠️ Code Quality Issues
1. **Large files** - `src/app/api/chat/route.ts` (1,276 lines), violates single responsibility principle
2. **Remaining console.logs** - 36 statements remaining (88% migrated to structured logging)

### ⚠️ Database Issues
1. **Partial transaction support** - 3 stored procedures use transactions, but not applied universally
2. **No query timeout** - Long-running queries could hang
3. **No query monitoring** - Can't identify slow queries without external APM
4. **No migration strategy** - Schema changes risky without formal migration tool

### ⚠️ Frontend Issues
1. **Limited Suspense boundaries** - 2 files using Suspense, need broader coverage for loading states
2. **No form validation library** - Reinventing validation logic (consider react-hook-form + Zod)
3. **No optimistic updates** - Poor perceived performance on mutations

### ⚠️ Testing & DevOps Issues
1. **Test failures** - 18 failing tests (78% pass rate → target: 95%+)
2. **Low coverage** - ~35% coverage (target: 70% utilities, 50% routes)
3. **No APM monitoring** - Limited observability beyond Sentry (Vercel Analytics installed, no custom APM)
4. **No dependency scanning** - Security vulnerabilities not automatically tracked (manual `npm audit` only)

### ⚠️ Architecture Issues
1. **No service layer** - Business logic mixed with API routes
2. **No repository pattern** - Database queries scattered across codebase
3. **No background job system** - Document processing blocks requests
4. **Cache instability** - Using `JSON.stringify()` creates cache misses
5. **Memory leak potential** - Advanced cache has no enforced memory limit

---

## Metrics to Track

### Performance
- Response time P50, P95, P99
- Cache hit rate (baseline: 67x improvement)
- Database query time
- Core Web Vitals (LCP, FID, CLS)

### Reliability
- Error rate by endpoint
- Uptime percentage
- Rate limit violations
- Document ingestion success rate

### Code Quality
- Test coverage: ~35% (121 tests, 78% pass rate) → target: 70% utilities, 50% routes, 95%+ pass rate
- TypeScript coverage: 100% (all critical files converted)
- ESLint warnings: 0 (zero-warning builds)
- Structured logging: 88% complete (36 console.logs remaining from 300+)
- Bundle size: 218 kB First Load JS (budget: 300kb JS ✅)
- Lighthouse scores: Not tracked

### Business
- Active users
- Questions per user
- Document upload rate
- Search quality/user satisfaction
- Session duration

---

## Additional Documentation

- **[schema.md](schema.md)** - Complete database schema with all tables, columns, and indexes
- **[security-risks.md](security-risks.md)** - Security risk assessment and mitigation strategies
- **[GDPR_DEPLOYMENT_ROADMAP.md](GDPR_DEPLOYMENT_ROADMAP.md)** - Complete GDPR implementation roadmap (9 phases, all completed)
- **[completed.md](completed.md)** - Historical implementation details and completed features
- **[/docs/data-retention-policy.md](/docs/data-retention-policy.md)** - Comprehensive data retention policy
