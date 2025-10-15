# PatmosLLM - Active TODO List

## 🔴 Critical Issues

### Production Blockers
- [ ] **🚨 URGENT: Fix Rate Limiting** (BROKEN IN PRODUCTION)
  - **Issue**: In-memory `Map()` doesn't work in serverless - each invocation gets new memory
  - **Impact**: Rate limiting completely non-functional across serverless instances
  - **Solution**: Implement Upstash Redis (packages already installed: `@upstash/ratelimit`, `@upstash/redis`)
  - **Location**: `src/lib/rate-limiter.ts:15` (line with `const rateLimitMap = new Map()`)
  - **Estimated Time**: 2-3 hours
  - **Priority**: CRITICAL - Security vulnerability

- [x] **✅ COMPLETE: Supabase Security Functions** (Previously Fixed)
  - **Status**: All 18 database functions have secure `search_path=pg_catalog, pg_temp`
  - **Verification**: Confirmed via SQL query on 2025-10-15
  - **No Action Required**: Functions already properly secured

### Phase 3 Migration - In Progress
- [ ] **Complete Phase 3 manual testing**
  - ✅ Login/Logout - Working
  - ✅ Chat - Working
  - ✅ Document Upload - Working
  - ✅ Document Download - Working
  - ✅ Invite User - Working
  - ✅ Delete Document - Working (backend)
  - ⏳ Web Scraping - Needs testing
- [ ] **Complete Phase 4: Cutover Preparation** (testing, monitoring)
- [ ] **Complete Phase 5: Feature Flag Flip** (prefer Supabase)
- [ ] **Complete Phase 6: Enforcement** (migrations 005-006)
- [x] **✅ COMPLETE: Phase 7 Supabase Invitation System** (2025-10-15)
  - ✅ Database migrations (invitation_tokens, GDPR consent columns, nullable clerk_id)
  - ✅ Invitation acceptance API with consent capture
  - ✅ Auth user conflict resolution (update vs create)
  - ✅ Login flow recognition for Supabase-only users
  - ✅ Full end-to-end testing (invite → accept → login)
  - **Status**: Production-ready, fully tested

## 🟡 High Priority

### Testing & CI/CD
- [ ] **Fix Integration Test Failures** (18 tests failing, 78% pass rate)
  - **Issue**: 18 integration tests failing due to mocking issues
  - **Current**: 121 tests total, 94 passing, 18 failing (78% pass rate)
  - **Target**: 95%+ pass rate for reliable CI/CD
  - **Files**: `tests/api/*.integration.test.ts` (chat, upload-blob, documents, admin-invite)
  - **Estimated Time**: 4-6 hours

- [ ] **Expand Test Coverage** (~35% → target 70%/50%)
  - **Current**: ~35% coverage estimated
  - **Target**: 70% utilities, 50% routes
  - **Missing Coverage**:
    - Zero tests for embeddings, hybrid search, memory system
    - Zero tests for parsers (PDF, DOCX, PPTX)
    - Zero tests for admin routes beyond invite
  - **Estimated Time**: 12-16 hours

### UX Issues
- [ ] **Delete Document Modal - Auto-close on success**
  - **Issue**: Modal doesn't auto-close after successful deletion (returns 200)
  - **Location**: Admin documents page - delete confirmation modal
  - **Impact**: User must manually close modal even though deletion succeeded
  - **Fix**: Frontend needs to detect 200 response and auto-close modal + refresh document list
  - **Files**: Likely in `/src/app/admin/page.tsx` around the delete handler

### Code Quality
- [ ] **Refactor Chat Route** (1,276 lines → Service Layer)
  - **Current**: `src/app/api/chat/route.ts` is 1,276 lines (grew from 799)
  - **Target**: Split into `ChatService.ts`, `ConversationRepository.ts`, `StreamingService.ts`
  - **Impact**: Easier testing, reusable business logic, better maintainability
  - **Estimated Time**: 16-20 hours

## 🟢 Medium Priority

### Security & Monitoring
- [ ] **Fix Sentry CSP Error** (Production Issue)
  - **Issue**: Sentry tracing bundle blocked by Content Security Policy
  - **Error**: `Refused to load 'https://browser.sentry-cdn.com/8.0.0/bundle.tracing.min.js'`
  - **Impact**: Sentry performance tracing not working, losing monitoring data
  - **Location**: `src/middleware.ts` - CSP configuration
  - **Fix**: Add `https://browser.sentry-cdn.com` to `script-src` CSP directive
  - **Estimated Time**: 15-30 minutes
  - **Priority**: MEDIUM - App works fine, but losing valuable monitoring data

### Performance & Scalability
- [ ] **Add Bundle Size Monitoring**
  - **Tool**: Install `@next/bundle-analyzer`
  - **Current**: 218 kB First Load JS (within 300 kB budget ✅)
  - **Goal**: Track bundle size trends, prevent bloat
  - **Estimated Time**: 1-2 hours

- [ ] **Add Playwright E2E Tests**
  - **Status**: Playwright not installed
  - **Need**: E2E tests for critical user flows (login, chat, upload, download)
  - **Estimated Time**: 12-16 hours

### GDPR Compliance
- [ ] **Cookie Consent Banner** (GDPR Phase 6)
  - **Status**: Not implemented (no grep matches for "cookie consent")
  - **Requirement**: GDPR requires explicit cookie consent
  - **Estimated Time**: 8-10 hours

- [ ] **Data Export UI** (GDPR Phase 8)
  - **Status**: Database table exists, no user-facing UI
  - **Need**: User-facing data export/download functionality
  - **Estimated Time**: 6-8 hours

## 🔵 Low Priority / Nice to Have

### Dependency Warnings
- [ ] **Fix Node.js Deprecation Warnings**
  - **Issue**: Node.js DEP0169 (url.parse) and DEP0060 (util._extend) deprecation warnings
  - **Source**: Dependencies (likely Clerk or other node_modules packages)
  - **Impact**: None (just warnings, doesn't break functionality)
  - **Solution**: Update dependencies or wait for package maintainers to fix
  - **Errors**:
    - `DEP0169: url.parse() behavior is not standardized`
    - `DEP0060: util._extend API is deprecated`
  - **Estimated Time**: 2-4 hours (audit dependencies, test updates)
  - **Priority**: LOW - Cosmetic issue, not affecting functionality

---

## ✅ Recently Completed (Last 30 Days)

### October 2024
- ✅ **TypeScript Migration Complete** - All 5 critical JS files converted to TS (Oct 2024)
  - rate-limiter.ts, input-sanitizer.ts, get-identifier.ts, file-security.ts, env-validator.ts
- ✅ **Testing Infrastructure Complete** - Vitest, Testing Library, 121 tests, CI/CD, Husky (Oct 2024)
- ✅ **Security Hardening** - Environment validation (Zod), request size limits, auth race fix (Oct 2024)
- ✅ **Structured Logging Migration** - 88% complete (264/300 console.logs replaced) (Oct 2024)
- ✅ **Error Boundaries** - 3 variants with Sentry integration (Oct 2024)
- ✅ **Sentry Integration** - Client, server, edge runtime monitoring (Oct 2024)
- ✅ **ESLint Zero Warnings** - Fixed all 197 warnings, zero-warning builds (Oct 2024)
- ✅ Fixed invite user endpoint (`clerk_user_id` NOT NULL constraint) - 2025-10-09
- ✅ Fixed delete document (admin override for library assets) - 2025-10-09
- ✅ Updated API routes to use `getCurrentUser()` dual-read pattern - 2025-10-09
- ✅ Implemented Phase 3: Dual-read authentication (Supabase + Clerk) - 2025-10-09
- ✅ Completed Phase 2: Database migrations (001-004) - 2025-10-09
- ✅ Completed Phase 1: Planning and backup - 2025-10-09

---

**Last Updated**: 2025-10-14
