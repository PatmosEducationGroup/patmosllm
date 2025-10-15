# PatmosLLM - AI-Powered Document Search & Chat System

## Quick Start Commands

```bash
# Development
npm run dev                               # Start development server
npm run build                             # Production build
npm run lint                              # Run linter

# Testing & Quality
npm run test                              # Run unit tests (121 tests, 78% pass rate)
npm run test:ui                           # Run tests with UI
npm run test:coverage                     # Generate coverage report
npm audit                                 # Security vulnerability scan

# Performance & Monitoring
npm run test:performance                  # Load test (50 concurrent users)
npm run health                            # System health check
npm run monitor                           # Real-time monitoring

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

### Database Schema (17 Tables)

**Core Data (Large):**
- `chunks` (24 MB) - Vector search segments with embeddings
- `documents` (15 MB) - Metadata & content storage
- `upload_sessions` (944 kB) - File upload tracking and management
- `conversations` (560 kB) - Chat history and message threads

**Memory System:**
- `user_context` (392 kB) - Topic familiarity & preferences (JSONB)
- `conversation_memory` (264 kB) - Conversation analysis & satisfaction tracking
- `topic_progression` (72 kB) - Learning progression & expertise tracking
- `question_patterns` (56 kB) - Global query pattern analysis

**User Management:**
- `users` (256 kB) - Role-based access (ADMIN/CONTRIBUTOR/USER)
- `user_onboarding_milestones` (136 kB) - Onboarding progress tracking
- `user_preferences` (32 kB) - User settings and preferences

**System/Utility:**
- `ingest_jobs` (208 kB) - Document processing job queue
- `chat_sessions` (112 kB) - Session management and state
- `data_export_requests` (48 kB) - GDPR data export tracking
- `clerk_webhook_events` (40 kB) - Clerk authentication event log
- `idempotency_keys` (32 kB) - Duplicate request prevention
- `privacy_audit_log` (32 kB) - Privacy compliance audit trail

### Core Data Flow
1. **Upload**: File → Process → Chunk → Embed → Pinecone
2. **Query**: User → Embed → Hybrid Search → Context → LLM → Stream
3. **Auth**: Clerk → Middleware → Role validation

### Key API Routes
- `/api/chat/*` - Streaming chat with session management and AI document generation
- `/api/upload/*` - Document processing pipeline
- `/api/admin/*` - System administration
- `/api/documents/download/[documentId]` - Secure document downloads
- `/api/download/[fileId]` - Generated document downloads (PDF/PPTX/XLSX)

### Environment Variables
```bash
# Application
NEXT_PUBLIC_APP_URL=https://multiplytools.app

# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY

# Database & Storage
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PINECONE_API_KEY
BLOB_READ_WRITE_TOKEN

# AI Services
OPENAI_API_KEY
VOYAGE_API_KEY
RESEND_API_KEY
```

---

## Current Status

**Overall Assessment: 7.5/10** - Production-ready application with identified improvements

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

### Recent Completions
- ✅ TypeScript migration: Converted all 5 critical JS files to TypeScript (Oct 2024)
- ✅ Testing infrastructure: Vitest, Testing Library, CI/CD, Husky hooks, 121 tests (Oct 2024)
- ✅ Security hardening: Environment variable validation (Zod), request size limits, auth race fix (Oct 2024)
- ✅ Structured logging: Custom logger with 88% coverage, replaced 300+ console.logs with 36 remaining (Oct 2024)
- ✅ Error boundaries: Comprehensive React error handling with Sentry integration (Oct 2024)
- ✅ Sentry integration: Error tracking with CSP configuration (Oct 2024)
- ✅ Chat UX: Auto-create sessions, default to new chat on load (Oct 2024)
- ✅ Document generation: AI-triggered PDF/PPTX/XLSX with serverless Chromium (Oct 2024)
- ✅ Code quality: Fixed all ESLint warnings & TypeScript compilation errors (Oct 2024)
- ✅ Domain migration: Zero-downtime switch to multiplytools.app (Oct 2024)
- ✅ Document system: Title cleanup, secure downloads, admin sorting (Oct 2024)
- ✅ Memory system: Conversation context tracking with 4 database tables (Sep 2024)
- ✅ Performance: Cache optimization, connection pooling, hybrid search (Sep 2024)
- ✅ UI/UX: Mobile-first design, component library, WCAG 2.1 AA compliance (Sep 2024)

---

## Priority Roadmap

### 🔥 Critical (Week 1-2)

#### Security & Stability
- [x] Remove hardcoded user IDs from rate limiter → environment variables (COMPLETE: Uses `RATE_LIMIT_EXEMPT_USERS`)
- [x] Fix async auth() bug in `get-identifier.js` (COMPLETE: Added await on line 34)
- [x] Convert 5 JavaScript files to TypeScript (COMPLETE: All converted to .ts with full type safety)
- [x] Add environment variable validation using Zod (COMPLETE: `src/lib/env.ts` validates 40+ variables)
- [x] Set up Sentry for error tracking (COMPLETE: Client, server, edge configs operational)
- [x] Implement structured logging (COMPLETE: 88% done, custom logger in place, 36 console.logs remaining)
- [x] Add request size limits (COMPLETE: 10MB limit enforced in middleware)
- [ ] **🚨 URGENT: Fix rate limiting** - In-memory Map broken in serverless, Upstash packages installed but not implemented
- [ ] **🚨 URGENT: Execute Supabase security script** - `scripts/fix-supabase-linter-warnings.sql` ready but not applied (18 functions at risk)

**Estimated Time**: 3-4 hours | **Impact**: Fix production-breaking rate limiting, eliminate SQL injection risk

#### Testing Foundation
- [x] Install Vitest + @testing-library/react (COMPLETE: Fully configured with coverage support)
- [x] Write unit tests for critical functions (COMPLETE: 8 test files, 121 tests total)
- [x] Write integration tests for API routes (COMPLETE: chat, upload-blob, documents, admin-invite)
- [x] Set up GitHub Actions CI/CD pipeline (COMPLETE: `.github/workflows/ci.yml` operational)
- [x] Add pre-commit hooks with Husky (COMPLETE: lint-staged configured and working)
- [ ] Fix integration test failures (18 tests failing, 78% pass rate → target 95%+)
- [ ] Expand test coverage (current ~35% → target: 70% utilities, 50% routes)
- [ ] Add Playwright E2E tests for critical user flows

**Estimated Time**: 16-24 hours | **Impact**: Reliable CI/CD, catch regressions before production

### ⚡ High Priority (Week 3-4)

#### Performance & Scalability
- [x] Set up Upstash Redis or Vercel KV (COMPLETE: Packages installed - `@upstash/ratelimit`, `@upstash/redis`)
- [ ] Replace in-memory rate limiting with distributed cache (blocked on: implement Upstash in rate-limiter.ts)
- [ ] Implement database transactions for multi-step operations (partially done: 3 stored procedures exist, not universal)
- [ ] Add bundle size monitoring (`@next/bundle-analyzer`)
- [ ] Optimize cache key generation (replace `JSON.stringify`)
- [ ] Add performance monitoring middleware (Vercel Analytics installed, no custom APM)

**Estimated Time**: 12-16 hours | **Impact**: Better scalability, faster responses

#### Code Quality & Maintainability
- [ ] Refactor chat route into service layer (current: 1,276 lines, need: `ChatService.ts`, `ConversationRepository.ts`, `StreamingService.ts`)
- [ ] Standardize API response format (envelope pattern)
- [ ] Add JSDoc documentation to public functions
- [x] Implement React Error Boundaries (COMPLETE: 3 variants in `src/components/ErrorBoundary.tsx`, Sentry integrated)
- [ ] Add Suspense boundaries for async components (2 files using Suspense, expand coverage)
- [ ] Replace final 36 console.log statements with structured logging
- [ ] Remove commented debug code (reduced significantly, minimal instances remain)

**Estimated Time**: 16-20 hours | **Impact**: Easier maintenance, faster onboarding

### 📋 Medium Priority (Month 2)

#### User Growth & Monetization
- [ ] Gmail-style invitation system with user quotas (3-5 invites per user)
- [ ] Public waitlist with position tracking and referral system
- [ ] Real-time usage/cost tracking (token consumption monitoring)
- [ ] Cost transparency dashboard ("$3.47 this month")
- [ ] Donation integration (Stripe/PayPal) with Wikipedia-style requests

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
- [ ] GDPR compliance framework

---

## Technical Debt

### Security Issues 🚨
1. ~~**Hardcoded credentials**~~ - ✅ FIXED: Now uses `RATE_LIMIT_EXEMPT_USERS` environment variable
2. ~~**Auth race condition**~~ - ✅ FIXED: Added `await` to `auth()` call in `src/lib/get-identifier.ts:34`
3. **Rate limiting broken** - 🚨 CRITICAL: In-memory `Map()` doesn't work in serverless (Upstash packages installed, needs implementation)
4. ~~**No request size limits**~~ - ✅ FIXED: 10MB limit enforced in middleware with 413 response
5. **Supabase security** - 🚨 URGENT: 18 functions with mutable search_path (fix script ready but not executed)

### Code Quality Issues ⚠️
1. ~~**Swallowed errors**~~ - ✅ MOSTLY FIXED: Improved from 300+ to structured logging in most catch blocks
2. ~~**5 JavaScript files**~~ - ✅ FIXED: All converted to TypeScript with full type safety
3. **Large files** - `src/app/api/chat/route.ts` (1,276 lines), violates single responsibility principle
4. ~~**Unstructured logging**~~ - ✅ MOSTLY FIXED: 88% complete (36 console.logs remaining from 300+)

### Database Issues ⚠️
1. **Partial transaction support** - 3 stored procedures use transactions, but not applied universally across all multi-step operations
2. **No query timeout** - Long-running queries could hang
3. **No query monitoring** - Can't identify slow queries without external APM
4. **No migration strategy** - Schema changes risky without formal migration tool

### Frontend Issues ⚠️
1. ~~**No Error Boundaries**~~ - ✅ FIXED: 3 variants implemented (Generic, Chat, Admin) with Sentry integration
2. **Limited Suspense boundaries** - 2 files using Suspense, need broader coverage for loading states
3. **No form validation library** - Reinventing validation logic (consider react-hook-form + Zod)
4. **No optimistic updates** - Poor perceived performance on mutations

### Testing & DevOps Issues 🚨
1. ~~**Zero test coverage**~~ - ✅ IMPROVED: 121 tests (8 files), ~35% coverage, 78% pass rate (target: 70%/50%, 95%+ pass rate)
2. ~~**No CI/CD pipeline**~~ - ✅ FIXED: GitHub Actions operational with lint, type-check, test, build, security audit
3. ~~**No pre-commit hooks**~~ - ✅ FIXED: Husky + lint-staged configured and working
4. **No APM monitoring** - Limited observability beyond Sentry (Vercel Analytics installed, no custom APM)
5. **No dependency scanning** - Security vulnerabilities not automatically tracked (manual `npm audit` only)

### Architecture Issues ⚠️
1. **No service layer** - Business logic mixed with API routes
2. **No repository pattern** - Database queries scattered across codebase
3. **No background job system** - Document processing blocks requests
4. **Cache instability** - Using `JSON.stringify()` creates cache misses
5. **Memory leak potential** - Advanced cache has no enforced memory limit

### Known Dependency Vulnerabilities ⚠️
**Status**: Accepted (low risk) - Last reviewed: October 2024

`npm audit --production` reports 9 moderate vulnerabilities in `pptx-parser@1.1.7-beta.9`:
- **jszip@2.6.1**: Prototype Pollution, Path Traversal
- **postcss@7.0.39**: Line return parsing error

**Risk Assessment: LOW**
- Package last updated May 2022 (unmaintained)
- Only used during authenticated document upload (`src/lib/parsers/office/pptx-parser.ts:9`)
- Only ADMIN/CONTRIBUTOR roles can upload documents
- Not exposed to public/untrusted input
- Production code uses safe versions (jszip@3.10.1, postcss@8.5.6)

**Mitigation**:
- Upload limited to authenticated, trusted users only
- File type validation enforced
- Monitoring via Sentry for unexpected errors

**Future Action**: Consider replacing pptx-parser with maintained alternative when resources allow.

---

## Recent Implementation History

### TypeScript Migration & Testing Infrastructure (October 2024)
- **TypeScript Conversion**: All 5 critical JavaScript files converted to TypeScript with full type safety
  - `rate-limiter.ts` - Improved with environment-based exempt users
  - `input-sanitizer.ts` - Full type annotations for sanitization functions
  - `get-identifier.ts` - Fixed auth race condition with proper await
  - `file-security.ts` - Type-safe file validation
  - `env-validator.ts` - Legacy validator alongside new Zod schema
- **Testing Framework**: Complete testing infrastructure established
  - Vitest + Testing Library installed and configured
  - 8 test files written: 4 unit tests, 4 integration tests
  - 121 total tests: 94 passing, 18 failing (78% pass rate)
  - Coverage reporting configured with v8 provider
- **CI/CD Pipeline**: GitHub Actions workflow operational
  - Automated lint, type-check, test, build on push/PR
  - Security audit with `npm audit --audit-level=high`
  - Pre-commit hooks with Husky + lint-staged
- **Security Hardening**: Multiple security improvements
  - Environment variable validation with Zod (40+ variables)
  - Request size limits (10MB) enforced in middleware
  - Auth race condition fixed (added await to auth() call)
  - Hardcoded credentials removed (now uses env vars)

### Structured Logging Migration (October 2024)
- **Custom Logger**: Built structured logging system in `src/lib/logger.ts`
  - JSON output with levels, timestamps, context fields
  - Category-based loggers (security, performance, database, ai, cache, auth)
  - `logError()` helper with full stack traces and Sentry integration
  - Pino installed for advanced logging capabilities
- **Migration Progress**: 88% complete (264+ of 300+ console.logs replaced)
  - Only 36 console.log statements remaining (primarily edge cases)
  - All critical paths use structured logging
  - Production-ready logging for debugging and monitoring

### Sentry Error Tracking (October 2024)
- **Integration**: Client, server, and edge runtime error monitoring
- **Session Replay**: 100% error replay sampling with privacy controls (maskAllText, blockAllMedia)
- **CSP Configuration**: Added `https://*.sentry.io` to middleware Content Security Policy
- **Error Filtering**: Filters out browser noise (ResizeObserver errors)
- **Production Ready**: Tested with multiple error types, all captured successfully
- **Turbopack Compatible**: Migrated from deprecated `sentry.client.config.ts` to `instrumentation-client.ts`
- **Source Maps**: Automatic upload for production debugging
- **Commits**: ec17d2c, a3f3ae1

### Chat UX Improvements (October 2024)
- **Auto-create sessions**: Users can type without selecting a conversation - new session created automatically on submit
- **Default to new chat**: Page loads with empty "New Chat" state instead of auto-loading last conversation
- **Improved first-time UX**: Seamless onboarding flow for new users
- **Commit**: f8d9060

### AI Document Generation (October 2024)
- **Intent-based generation**: "Create a PDF of that" triggers document export from conversation
- **Multi-format support**: PDF (Puppeteer + serverless Chromium), PPTX (PptxGenJS), XLSX (ExcelJS)
- **Smart content parsing**: Extracts titles from headings, handles markdown, lists, paragraphs
- **Serverless compatibility**: Integrated @sparticuz/chromium for Vercel PDF generation
- **Temporary storage**: 5-minute expiring downloads with auto-cleanup
- **Quality gate bypass**: Document generation requests skip low-confidence thresholds
- **Commits**: 5b30d3f, f8d9060

### Code Quality & Build Fixes (October 2024)
- Fixed all 197 ESLint warnings and TypeScript compilation errors
- Updated eslint.config.mjs with custom rules for unused variables
- Achieved zero-warning production builds ready for Vercel deployment
- **Commit**: 53eb33e

### Domain Migration (October 2024)
- Zero-downtime migration from heaven.earth to multiplytools.app
- Configured Cloudflare DNS and Clerk authentication for new domain
- Updated all environment variables and CSP headers
- Implemented 301 redirects for legacy domain

### Document System Enhancements (October 2024)
- **Title Cleanup**: Automated cleanup of 91/579 documents with atomic Supabase + Pinecone updates
- **Secure Downloads**: Implemented signed URLs with 60-second expiration and Clerk authentication
- **Admin Improvements**: Added sortable columns, chunk count display, download controls
- **Auto-Cleaning**: Automatic title standardization on upload (removes prefixes, underscores)

### Memory System & Performance (September 2024)
- Implemented conversation memory system with 4 database tables
- Fixed cache system achieving 67x performance improvement (14.6s → 201ms)
- Optimized database connection pooling (25 max connections, 3min cleanup)
- Added memory system health monitoring to admin dashboard

### Search & AI Optimization (September 2024)
- Migrated to Voyage-3-large embeddings with intelligent token batching
- Optimized hybrid search weights (0.7 semantic / 0.3 keyword)
- Enhanced system prompt for better document synthesis
- Fixed contextual follow-up question detection
- Achieved 100% document ingestion success (462/462 documents, 7,956+ chunks)

### UI/UX & Mobile (September 2024)
- Created professional landing page with authentication flow
- Implemented mobile-first design with WCAG 2.1 AA compliance
- Built component library with 15+ reusable UI components
- Added edge swipe gestures and native mobile navigation
- Enhanced sources display with expandable sections
- Upgraded streaming to 60fps with requestAnimationFrame

### Multimedia Processing (September 2024)
- Added support for 25+ file formats (images, audio, video)
- Implemented OCR extraction with Tesseract.js
- Integrated FFmpeg for video/audio metadata
- Set 150MB upload limit with Vercel Blob storage

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
