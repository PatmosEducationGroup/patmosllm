# PatmosLLM - AI-Powered Document Search & Chat System

## Quick Start Commands

```bash
# Development
npm run dev                               # Start development server
npm run build                             # Production build
npm run lint                              # Run linter

# Testing & Quality (To Be Implemented)
npm run test                              # Run unit tests
npm run test:e2e                          # Run E2E tests
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

### Database Schema
- `users` - Role-based access (ADMIN/CONTRIBUTOR/USER)
- `documents` - Metadata & content storage
- `chunks` - Vector search segments
- `conversations` - Chat history
- `chat_sessions` - Session management
- `user_context` - Memory: topic familiarity & preferences
- `conversation_memory` - Memory: conversation analysis & satisfaction
- `topic_progression` - Memory: learning progression tracking
- `question_patterns` - Memory: query pattern analysis

### Core Data Flow
1. **Upload**: File → Process → Chunk → Embed → Pinecone
2. **Query**: User → Embed → Hybrid Search → Context → LLM → Stream
3. **Auth**: Clerk → Middleware → Role validation

### Key API Routes
- `/api/chat/*` - Streaming chat with session management
- `/api/upload/*` - Document processing pipeline
- `/api/admin/*` - System administration
- `/api/documents/download/[documentId]` - Secure document downloads

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
- **Features**: Memory system, secure downloads, mobile-first UI, 25+ file formats

### Key Metrics
- **500+ concurrent users** via optimized connection pooling
- **67x faster cache hits** (201ms → 3ms for repeated questions)
- **75% faster database** queries with connection management
- **40% better search** accuracy with semantic + keyword hybrid
- **100% document ingestion** success rate (462/462 documents, 7,956+ chunks)

### Recent Completions
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
- [ ] Remove hardcoded user IDs from rate limiter → environment variables (`src/lib/rate-limiter.js:69-76`)
- [ ] Fix async auth() bug in `get-identifier.js` (add await)
- [ ] Convert 5 JavaScript files to TypeScript (`rate-limiter.js`, `input-sanitizer.js`, `get-identifier.js`, `file-security.js`, `env-validator.js`)
- [ ] Add environment variable validation using Zod
- [ ] Set up Sentry for error tracking
- [ ] Implement structured logging (winston/pino) to replace 300+ console.log statements

**Estimated Time**: 10-14 hours | **Impact**: Prevent security breaches, enable production debugging

#### Testing Foundation
- [ ] Install Vitest + @testing-library/react
- [ ] Write unit tests for critical functions (auth, sanitization, search, embeddings)
- [ ] Write integration tests for API routes (`/api/chat`, `/api/auth`, `/api/upload/*`)
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Add pre-commit hooks with Husky
- [ ] Configure test coverage reporting (target: 70% utilities, 50% routes)

**Estimated Time**: 16-20 hours | **Impact**: Catch bugs before production, enable safe refactoring

### ⚡ High Priority (Week 3-4)

#### Performance & Scalability
- [ ] Set up Upstash Redis or Vercel KV
- [ ] Replace in-memory rate limiting with distributed cache
- [ ] Implement database transactions for multi-step operations
- [ ] Add bundle size monitoring (`@next/bundle-analyzer`)
- [ ] Optimize cache key generation (replace `JSON.stringify`)
- [ ] Add performance monitoring middleware

**Estimated Time**: 12-16 hours | **Impact**: Better scalability, faster responses

#### Code Quality & Maintainability
- [ ] Refactor chat route into service layer (`ChatService.ts`, `ConversationRepository.ts`, `StreamingService.ts`)
- [ ] Standardize API response format (envelope pattern)
- [ ] Add JSDoc documentation to public functions
- [ ] Implement React Error Boundaries
- [ ] Add Suspense boundaries for async components
- [ ] Remove commented debug code (100+ instances)

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
1. **Hardcoded credentials** (`src/lib/rate-limiter.js:69-76`) - User IDs hardcoded, security risk if repo goes public
2. **Auth race condition** (`src/lib/get-identifier.js:6`) - `auth()` not awaited, rate limiting broken
3. **Rate limiting broken** - In-memory `Map()` doesn't work in serverless (each instance has separate memory)
4. **No request size limits** - Potential DoS vector on POST requests

### Code Quality Issues ⚠️
1. **Swallowed errors** - 300+ `catch (_error)` blocks with no logging (production debugging impossible)
2. **5 JavaScript files** in critical paths (no type safety)
3. **Large files** - `src/app/api/chat/route.ts` (799 lines), violates single responsibility
4. **No error tracking** - Zero visibility into production errors
5. **Unstructured logging** - 300+ console.log statements need structured logging

### Database Issues ⚠️
1. **No transactions** - Multi-step operations can fail partially (conversation save + session update + memory)
2. **No query timeout** - Long-running queries could hang
3. **No query monitoring** - Can't identify slow queries
4. **No migration strategy** - Schema changes are risky

### Frontend Issues ⚠️
1. **No Error Boundaries** - Errors crash entire app
2. **No Suspense boundaries** - Can't show proper loading states
3. **No form validation library** - Reinventing validation logic
4. **No optimistic updates** - Poor perceived performance

### Testing & DevOps Issues 🚨
1. **Zero test coverage** - High regression risk, fear of refactoring
2. **No CI/CD pipeline** - Manual testing required
3. **No monitoring** - No APM, error tracking, or observability
4. **No dependency scanning** - Security vulnerabilities not tracked

### Architecture Issues ⚠️
1. **No service layer** - Business logic mixed with API routes
2. **No repository pattern** - Database queries scattered across codebase
3. **No background job system** - Document processing blocks requests
4. **Cache instability** - Using `JSON.stringify()` creates cache misses
5. **Memory leak potential** - Advanced cache has no enforced memory limit

---

## Recent Implementation History

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
- Test coverage (target: 70% utilities, 50% routes)
- TypeScript strict mode compliance
- Bundle size (budget: 300kb JS, 100kb CSS)
- Lighthouse scores

### Business
- Active users
- Questions per user
- Document upload rate
- Search quality/user satisfaction
- Session duration
