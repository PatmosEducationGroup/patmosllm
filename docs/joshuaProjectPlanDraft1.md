# Joshua Project API Integration - Implementation Plan v1.0

**Document Status**: Draft
**Created**: October 20, 2025
**Author**: Claude Code (Codebase Audit)
**Estimated Timeline**: 4-5 weeks (44-56 hours)
**Estimated Cost**: $1.02 initial + $0.10/month ongoing

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Requirements Compliance](#requirements-compliance)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema Changes](#database-schema-changes)
5. [Implementation Phases](#implementation-phases)
6. [Cost Analysis](#cost-analysis)
7. [Risk Assessment](#risk-assessment)
8. [Questions for Joshua Project](#questions-for-joshua-project)
9. [Appendix: Codebase Audit Findings](#appendix-codebase-audit-findings)

---

## Executive Summary

### Goal
Ingest 17,000 people groups from Joshua Project API into PatmosLLM's RAG system with monthly automated updates while maintaining strict data integrity requirements.

### Approach
- **Initial Ingest**: One-time download of all people groups (~3.5 hours)
- **Monthly Sync**: Automated refresh via Vercel cron (1st of month, 2 AM UTC)
- **Smart Updates**: Hash-based change detection to minimize re-embedding costs (90% skip rate)
- **Compliance**: All 6 Joshua Project requirements met with automated enforcement

### Key Metrics
- **17,000 people groups** ingested into existing RAG pipeline
- **170,000 vector embeddings** (10 chunks per group)
- **$1.02** one-time embedding cost
- **$0.10/month** ongoing sync cost
- **3.5 hours** initial ingest time
- **30 minutes** monthly sync time (with change detection)

### Success Criteria
1. All 17K people groups searchable via PatmosLLM chat interface
2. Monthly sync runs automatically without manual intervention
3. Chat responses comply with all 6 Joshua Project data integrity requirements
4. Embedding costs stay below $5/month
5. 95%+ test pass rate with comprehensive test coverage

---

## Requirements Compliance

### ✅ 6/6 Joshua Project Requirements Met

| # | Requirement | Implementation Strategy | Verification Method |
|---|------------|-------------------------|---------------------|
| **1** | **Definition Consistency** | Store verbatim JP metadata in dedicated `api_metadata` jsonb field. Filter out non-JP sources when JP data is detected in chat responses. | Unit test: Verify non-JP sources filtered when JP data present. Manual QA: Ask chat about people groups, confirm only JP definitions used. |
| **2** | **Numbers as Estimates** | Auto-append "(estimate)" to all percentages/populations in `joshua-project-formatter.ts`. Display as ranges when available (e.g., "0.1–2.0%"). | Unit test: Pass JP data through formatter, verify "(estimate)" appended. Manual QA: Verify all numbers show as estimates in chat. |
| **3** | **Anthropological Nuance** | Preserve full context in chunking strategy: subgroups, alternate names/endonyms, cross-border reality, diaspora nodes, language shift. Store in `api_metadata` and embed in chunk content. | Manual QA: Verify nuanced context appears in search results. Review embeddings for cultural complexity. |
| **4** | **Numeric Faithfulness** | SHA-256 hash-based change detection ensures verbatim JP numbers (no silent rounding). Never mix sources in same sentence via source-aware formatter. | Unit test: Verify hash detects content changes. Manual QA: Compare JP API response with stored data (exact match). |
| **5** | **Source Attribution** | Inject inline citation in every JP-related answer: "Source: Joshua Project — accessed [date]". Use `api_last_synced` timestamp from database. | Unit test: Verify citation injected by formatter. Manual QA: All JP responses include source line. |
| **6** | **Delivery Method** | **Monthly API sync** (recommended) with 100 req/min rate limiting via built-in client. Alternative: Periodic export if JP provides it. | Performance test: Verify sync completes within Vercel function timeout (10 min max). Monitor rate limit compliance. |

---

## Architecture Overview

### Data Flow: Initial Ingest + Monthly Sync

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: INITIAL INGEST (One-Time, ~3.5 hours)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Joshua Project API (17,000 people groups)                     │
│           ↓ (100 req/min rate limit)                           │
│  JoshuaProjectClient.fetchAllGroups()                          │
│           ↓ (rate-limited fetch)                               │
│  JoshuaProjectTransformer.transform()                          │
│           ↓ (JP data → PatmosLLM format)                       │
│  generateEmbeddings() (Voyage-3-large)                         │
│           ↓ (10 chunks/group × 17K = 170K vectors)            │
│  ┌─────────────────────┐     ┌─────────────────────┐          │
│  │ Supabase (metadata) │     │ Pinecone (vectors)  │          │
│  │ - documents table   │     │ - namespace: main   │          │
│  │ - api_source        │     │ - 170K embeddings   │          │
│  │ - api_sync_hash     │     │                     │          │
│  │ - api_metadata      │     │                     │          │
│  └─────────────────────┘     └─────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: MONTHLY SYNC (Automated, ~30 min/month)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Vercel Cron Trigger (1st of month, 2 AM UTC)                 │
│           ↓                                                     │
│  POST /api/cron/sync-joshua-project                            │
│           ↓                                                     │
│  JoshuaProjectClient.fetchAllGroups()                          │
│           ↓ (re-fetch all 17K groups)                         │
│  For each group:                                               │
│    1. Compute SHA-256 hash of content                          │
│    2. Compare with stored api_sync_hash                        │
│    3. If changed:                                              │
│       - Re-embed (Voyage-3-large)                              │
│       - Update Supabase + Pinecone                             │
│       - Update api_last_synced timestamp                       │
│    4. If unchanged:                                            │
│       - Skip (no re-embedding, no cost)                        │
│           ↓                                                     │
│  Expected: ~10% changed (1,700 groups)                         │
│  Cost: $0.10 in embeddings                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: CHAT RESPONSE FORMATTING                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Question: "Tell me about the Uyghur people"             │
│           ↓                                                     │
│  Hybrid Search (semantic + keyword)                            │
│           ↓ (retrieve top 10 chunks from Pinecone)            │
│  Detect JP sources in results                                  │
│           ↓ (check api_source='joshua_project')               │
│  JoshuaProjectFormatter.format()                               │
│    - Convert numbers → "X% (estimate)"                         │
│    - Add source attribution                                    │
│    - Filter non-JP sources from response                       │
│           ↓                                                     │
│  GPT-4o-mini streaming response                                │
│           ↓                                                     │
│  User sees:                                                     │
│  "The Uyghur are a people group in China with a population    │
│   of approximately 12 million (estimate). They are 0.01%      │
│   Evangelical (estimate).                                      │
│                                                                 │
│   Source: Joshua Project — accessed Oct 20, 2025."            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. API Client (`/src/lib/joshua-project-client.ts`)
- **Responsibilities**:
  - Fetch people groups from Joshua Project API
  - Rate limiting (100 req/min compliance via 650ms delay)
  - Exponential backoff on API errors
  - Pagination handling
  - Error recovery

- **Key Methods**:
  ```typescript
  class JoshuaProjectClient {
    async fetchAllGroups(): Promise<PeopleGroup[]>
    async fetchGroupById(id: string): Promise<PeopleGroup>
    private rateLimit(): Promise<void> // 650ms delay
  }
  ```

#### 2. Data Transformer (`/src/lib/joshua-project-transformer.ts`)
- **Responsibilities**:
  - Convert JP API format → PatmosLLM document format
  - Preserve anthropological nuance (subgroups, alternate names, etc.)
  - Generate SHA-256 hash for change detection
  - Structure metadata for compliance

- **Key Methods**:
  ```typescript
  class JoshuaProjectTransformer {
    transform(group: PeopleGroup): Document
    generateGroupContent(group: PeopleGroup): string // Preserve nuance
    computeHash(content: string): string // SHA-256
  }
  ```

#### 3. Response Formatter (`/src/lib/joshua-project-formatter.ts`)
- **Responsibilities**:
  - Format numbers as estimates
  - Inject source attribution
  - Filter non-JP sources when JP data present
  - Apply JP definition tooltips (future: frontend integration)

- **Key Methods**:
  ```typescript
  class JoshuaProjectFormatter {
    formatResponse(chunks: Chunk[]): string
    private formatNumbers(text: string): string // Add "(estimate)"
    private addSourceAttribution(text: string, date: Date): string
    private filterNonJPSources(chunks: Chunk[]): Chunk[]
  }
  ```

#### 4. Cron Job (`/src/app/api/cron/sync-joshua-project/route.ts`)
- **Responsibilities**:
  - Automated monthly sync triggered by Vercel cron
  - Batch processing with checkpointing (Vercel timeout handling)
  - Change detection and selective re-embedding
  - Error logging to Sentry

- **Endpoint**:
  ```typescript
  POST /api/cron/sync-joshua-project
  Authorization: Bearer <CRON_SECRET>

  Response: {
    success: true,
    stats: {
      total: 17000,
      changed: 1700,
      unchanged: 15300,
      errors: 0,
      duration: "28m 34s"
    }
  }
  ```

---

## Database Schema Changes

### Migration: `scripts/add-joshua-project-schema.sql`

```sql
-- Add API source tracking columns to documents table
ALTER TABLE documents
  ADD COLUMN api_source TEXT,              -- 'joshua_project'
  ADD COLUMN api_external_id TEXT,         -- JP people group ID (e.g., '12345')
  ADD COLUMN api_last_synced TIMESTAMPTZ,  -- Last sync timestamp
  ADD COLUMN api_sync_hash TEXT,           -- SHA-256 hash for change detection
  ADD COLUMN api_metadata JSONB;           -- JP-specific data (verbatim)

-- Indexes for efficient querying
CREATE INDEX idx_documents_api_source ON documents(api_source);
CREATE INDEX idx_documents_api_external_id ON documents(api_external_id);
CREATE INDEX idx_documents_api_last_synced ON documents(api_last_synced);

-- Example api_metadata structure for JP data:
-- {
--   "peopcode": "12345",
--   "poplulation": 15000000,
--   "jpscale": "Unreached",
--   "percentevangelical": 0.01,
--   "percentadherents": 2.5,
--   "primaryreligion": "Islam",
--   "alternatenames": ["Uighur", "Weiwuer"],
--   "subgroups": ["Northern Uyghur", "Southern Uyghur"],
--   "diasporanodes": ["Kazakhstan", "Kyrgyzstan"],
--   "progressscale": 1.0,
--   "frontier": true,
--   "definitions": {
--     "unreached": "Less than 2% Evangelical and less than 5% Christian Adherents",
--     "frontier": "Less than 0.1% Christian"
--   }
-- }

-- Comments for documentation
COMMENT ON COLUMN documents.api_source IS 'External API source (e.g., joshua_project)';
COMMENT ON COLUMN documents.api_external_id IS 'External ID from source API';
COMMENT ON COLUMN documents.api_sync_hash IS 'SHA-256 hash for change detection';
COMMENT ON COLUMN documents.api_metadata IS 'Source-specific metadata (JSONB)';
```

### Key Design Decisions

1. **Why JSONB for `api_metadata`?**
   - Preserves verbatim JP data structure (no data loss)
   - Queryable via PostgreSQL JSONB operators (e.g., `api_metadata->>'jpscale'`)
   - Flexible for future API sources (not JP-specific schema)

2. **Why SHA-256 hash for change detection?**
   - Deterministic: Same content → same hash
   - Fast comparison: Avoids deep object diffing
   - Cost optimization: Skip 90% of re-embedding on monthly sync

3. **Why `api_source` column?**
   - Prevents mixing JP data with other sources
   - Enables source filtering in chat responses (Requirement #1)
   - Future-proof for additional API integrations

---

## Implementation Phases

### Phase 1: Core API Integration + Manual Sync
**Timeline**: 16-20 hours (Week 1-2)
**Goal**: Ingest 17,000 people groups successfully, validate search works

#### Tasks
1. **Database Migration** (2 hours)
   - Create `scripts/add-joshua-project-schema.sql`
   - Run migration on development database
   - Verify schema changes with `\d documents` in psql

2. **API Client** (6-8 hours)
   - Create `/src/lib/joshua-project-client.ts`
   - Implement rate limiting (100 req/min = 650ms delay)
   - Add exponential backoff for 429 errors
   - Handle pagination (if JP API uses it)
   - Write unit tests: `joshua-project-client.test.ts`

3. **Data Transformer** (4-6 hours)
   - Create `/src/lib/joshua-project-transformer.ts`
   - Implement `transform()` method (JP API → PatmosLLM format)
   - Preserve anthropological nuance in content generation
   - Compute SHA-256 hash for change detection
   - Write unit tests: `joshua-project-transformer.test.ts`

4. **Manual Sync Script** (4 hours)
   - Create `/scripts/sync-joshua-project-manual.ts`
   - Reuse existing ingestion pipeline (`/src/lib/ingest.ts`)
   - Add batch processing (process 100 groups at a time)
   - Add progress logging (e.g., "1000/17000 complete")

5. **Testing** (4-6 hours)
   - Test with 100 groups: `node scripts/sync-joshua-project-manual.ts --limit 100`
   - Validate data quality in Supabase (check `api_metadata` structure)
   - Run full sync: `node scripts/sync-joshua-project-manual.ts` (~3.5 hours)
   - Test chat search: "Tell me about the Uyghur people"
   - Verify Pinecone vectors created correctly

#### Deliverables
- ✅ 17,000 people groups ingested into Supabase + Pinecone
- ✅ Manual sync script operational
- ✅ Unit tests passing (API client, transformer)
- ✅ Chat search returns JP results correctly

#### Files Created
```
/scripts/
  add-joshua-project-schema.sql
  sync-joshua-project-manual.ts

/src/lib/
  joshua-project-client.ts
  joshua-project-client.test.ts
  joshua-project-transformer.ts
  joshua-project-transformer.test.ts
```

---

### Phase 2: Automated Monthly Cron
**Timeline**: 8-12 hours (Week 3)
**Goal**: Vercel cron runs monthly sync automatically without manual intervention

#### Tasks
1. **Cron Endpoint** (6-8 hours)
   - Create `/src/app/api/cron/sync-joshua-project/route.ts`
   - Implement change detection (compare SHA-256 hashes)
   - Add batch processing with checkpointing (Vercel 10 min timeout)
   - Integrate Sentry error tracking
   - Add authentication (CRON_SECRET env var)

2. **Vercel Cron Configuration** (1 hour)
   - Update `vercel.json` with cron schedule
   - Deploy to Vercel staging environment
   - Verify cron appears in Vercel dashboard

3. **Testing** (3-5 hours)
   - Manual trigger: `curl http://localhost:3000/api/cron/sync-joshua-project -H "Authorization: Bearer <CRON_SECRET>"`
   - Verify change detection (modify 1 group in JP API mock, confirm only 1 re-embedded)
   - Load test: Simulate 10% change rate (1,700 groups)
   - Monitor Sentry logs for errors

#### Deliverables
- ✅ Automated monthly sync operational
- ✅ Change detection working (90% skip rate)
- ✅ Vercel cron logs visible in dashboard
- ✅ Error monitoring via Sentry

#### Files Created
```
/src/app/api/cron/sync-joshua-project/
  route.ts

/vercel.json (updated)
```

#### Vercel Cron Configuration
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-joshua-project",
      "schedule": "0 2 1 * *"  // 2 AM UTC, 1st of month
    }
  ]
}
```

---

### Phase 3: UI Enhancements (JP-Compliant Formatting)
**Timeline**: 12-16 hours (Week 4)
**Goal**: Chat responses comply with all 6 Joshua Project requirements

#### Tasks
1. **Response Formatter** (6-8 hours)
   - Create `/src/lib/joshua-project-formatter.ts`
   - Implement number formatting (add "(estimate)" suffix)
   - Implement source attribution injection
   - Implement source filtering (remove non-JP when JP present)
   - Write unit tests: `joshua-project-formatter.test.ts`

2. **Chat Integration** (4-6 hours)
   - Update `/src/app/api/chat/route.ts`
   - Detect JP sources in search results
   - Apply formatter before streaming response
   - Handle mixed sources (JP + non-JP in same query)

3. **Frontend Tooltips** (Optional, 4-6 hours)
   - Create `<JPDefinitionTooltip>` component
   - Detect JP terms in chat responses (Unreached, Frontier, etc.)
   - Display inline tooltips with definitions from `api_metadata`

4. **Testing** (4-6 hours)
   - Manual QA: Ask 20 people group questions
   - Verify all 6 requirements met:
     - ✅ Definition consistency
     - ✅ Numbers as estimates
     - ✅ Anthropological nuance
     - ✅ Numeric faithfulness
     - ✅ Source attribution
   - Automated tests: `joshua-project-formatter.test.ts` (95%+ coverage)

#### Deliverables
- ✅ Chat responses formatted per JP requirements
- ✅ Source attribution on every JP-related answer
- ✅ Numbers displayed as estimates
- ✅ JP definitions not mixed with other sources
- ✅ Unit tests passing (formatter)

#### Files Created
```
/src/lib/
  joshua-project-formatter.ts
  joshua-project-formatter.test.ts

/src/app/api/chat/
  route.ts (updated)

/src/components/ (optional)
  JPDefinitionTooltip.tsx
```

#### Example Formatted Response
```
User: "Tell me about the Uyghur people"

Assistant: The Uyghur are a people group primarily located in Xinjiang, China, with a population of approximately 12 million (estimate). They are predominantly Muslim (99.9% estimate) and are classified as an Unreached people group with only 0.01% Evangelical (estimate).

The Uyghur language belongs to the Turkic language family. There are several subgroups and alternate names including "Uighur" and "Weiwuer". Significant diaspora communities exist in Kazakhstan, Kyrgyzstan, and Uzbekistan.

Source: Joshua Project — accessed Oct 20, 2025.
```

---

### Phase 4: Validation & Testing
**Timeline**: 8-12 hours (Week 5)
**Goal**: Production-ready with comprehensive tests

#### Tasks
1. **Unit Testing** (4 hours)
   - Write tests for API client (mock API responses)
   - Write tests for transformer (JP data → document format)
   - Write tests for formatter (compliance rules)
   - Target: 95% coverage for new code

2. **Integration Testing** (2 hours)
   - Test full pipeline: API fetch → transform → embed → store
   - Test monthly sync with change detection
   - Test chat responses with JP data

3. **Performance Testing** (2 hours)
   - Measure sync time for 17K groups (should be <4 hours)
   - Measure monthly sync time with 10% change rate (should be <30 min)
   - Monitor embedding costs (should be <$0.20/month)

4. **Security Audit** (2 hours)
   - Verify API key storage (env vars, not committed)
   - Test cron authentication (CRON_SECRET required)
   - Review error messages (no sensitive data leaked)

5. **Documentation** (2 hours)
   - Update CLAUDE.md with Joshua Project integration
   - Add API documentation (client, transformer, formatter)
   - Document cron job configuration

#### Deliverables
- ✅ 95%+ test pass rate
- ✅ Production deployment checklist complete
- ✅ Documentation updated
- ✅ Security audit passed

---

## Cost Analysis

### Initial Ingest (One-Time)

| Item | Quantity | Unit Cost | Total |
|------|----------|-----------|-------|
| API Calls | 17,000 requests | Free | $0.00 |
| Embeddings (Voyage-3-large) | 170,000 chunks | $0.00006/chunk | **$1.02** |
| Storage (Pinecone free tier) | 170,000 vectors | Free (up to 1M) | $0.00 |
| Supabase storage | 17,000 rows | Free (up to 500MB) | $0.00 |

**Total Initial Cost**: **$1.02**

### Monthly Sync (Ongoing)

| Item | Quantity | Unit Cost | Total |
|------|----------|-----------|-------|
| API Calls | 17,000 requests | Free | $0.00 |
| Embeddings (10% changed) | 17,000 chunks | $0.00006/chunk | **$0.10** |
| Storage (Pinecone) | 170,000 vectors | Free | $0.00 |

**Monthly Cost**: **$0.10**
**Annual Cost**: **$1.22**

### Pinecone Upgrade Threshold

If total documents exceed 100,000 (>1M vectors), upgrade to paid tier:
- **Pinecone Starter**: $70/month (10M vectors, 100 queries/sec)
- **Current usage**: 170K vectors (17% of free tier limit)
- **Headroom**: Can add 83K more documents before upgrade needed

### Cost Optimization Strategies

1. **Change Detection** (Implemented)
   - SHA-256 hashing skips 90% of groups on monthly sync
   - Saves ~$0.90/month in embedding costs

2. **Chunking Strategy** (Adjustable)
   - Current: 10 chunks/group = 170K vectors
   - Alternative: 5 chunks/group = 85K vectors (50% cost reduction)
   - Trade-off: Lower search granularity

3. **Sync Frequency** (Configurable)
   - Current: Monthly (recommended)
   - Alternative: Quarterly ($0.03/month average)
   - Trade-off: Stale data for 3 months

---

## Risk Assessment

### High Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Vercel function timeout** (10 min max) | Medium | High | Batch processing with checkpointing. Resume on next cron run. Save progress every 1000 groups. |
| **API rate limit violations** (100 req/min) | Low | Medium | Built-in 650ms delay between requests. Exponential backoff on 429 errors. Monitor rate limit headers. |
| **Mixing JP data with other sources** | Medium | High | Source filtering in formatter. Metadata-based isolation. Unit tests verify no mixing. |

### Medium Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Embedding cost overruns** | Low | Medium | Change detection skips 90% of groups. Budget alert at $5/month. Monitor costs in Vercel dashboard. |
| **Data quality issues** (missing fields) | Medium | Medium | Validate JP API responses before ingestion. Log warnings for missing data. Fallback to "Unknown" for optional fields. |
| **Pinecone storage limits** (1M vectors) | Low | Medium | Monitor vector count. Alert at 800K vectors. Reduce chunks/group if needed (10 → 5). |

### Low Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **JP API downtime** | Low | Low | Retry logic with exponential backoff. Graceful degradation (keep old data searchable). Alert on sync failures. |
| **Cron job failures** | Low | Medium | Sentry error tracking. Email alerts on failures. Manual trigger endpoint for recovery. |
| **Hash collisions** (SHA-256) | Very Low | Low | Astronomically unlikely (2^256 possibilities). No mitigation needed. |

---

## Questions for Joshua Project

### 1. API Optimization
**Question**: Does your API support incremental updates (e.g., `GET /v3/people_groups?updated_since=2025-09-01`)?

**Why**: This would reduce monthly sync time from 3.5 hours → ~30 minutes by fetching only changed records.

**Alternative**: If not available, consider offering a monthly bulk export (CSV/JSON dump) for faster ingestion.

### 2. Rate Limiting
**Question**: Is the 100 req/min rate limit shared across all API users or per API key?

**Why**: If shared, high traffic could cause sync delays. If per-key, we can optimize batch size.

**Current Approach**: Conservative 650ms delay (92 req/min) to stay under limit.

### 3. API Stability
**Question**: How often does the API schema change? Are there versioning guarantees (e.g., `/v3` vs `/v4`)?

**Why**: Need to plan for schema migration testing and backwards compatibility.

### 4. Definition Updates
**Question**: How often do JP definitions change (e.g., "Unreached", "Frontier", "Progress Scale")?

**Why**: Need to sync definition updates to keep tooltips current. Should we fetch definitions from API or hard-code them?

### 5. Bulk Export Availability
**Question**: Do you offer periodic bulk exports (monthly CSV/JSON dump) as an alternative to API sync?

**Why**: Bulk exports would be faster (no rate limits) and reduce API load. We could switch to this if available.

**Recommendation**: Monthly API sync is acceptable for now, but bulk export would optimize performance.

---

## Appendix: Codebase Audit Findings

### Existing Infrastructure (Highly Reusable)

#### ✅ Mature Document Ingestion Pipeline
**Location**: `/src/lib/ingest.ts`
**Capabilities**:
- Processes 25+ file formats (PDF, DOCX, images, audio, video)
- OCR and multimedia extraction
- Chunking with overlap (optimize for RAG retrieval)
- Embedding generation (Voyage-3-large)
- Pinecone + Supabase storage
- 100% success rate (462/462 documents, 7,956+ chunks)

**Reusability**: Can ingest JP API data with minimal changes (just need API client + transformer)

#### ✅ Hybrid Search Infrastructure
**Location**: `/src/lib/search.ts`
**Capabilities**:
- Semantic search (Pinecone vector similarity)
- Keyword search (PostgreSQL full-text search)
- Hybrid scoring (40% better accuracy than semantic alone)
- Caching (67x performance improvement)

**Reusability**: JP data searchable immediately after ingestion (no search code changes needed)

#### ✅ Streaming Chat with Context
**Location**: `/src/app/api/chat/route.ts`
**Capabilities**:
- GPT-4o-mini streaming responses
- Context injection from search results
- Session management
- Source attribution (already implemented for documents)

**Reusability**: Can extend to format JP responses with compliance rules

#### ✅ Error Tracking  Logging
**Location**: Sentry integration + structured logging
**Capabilities**:
- Sentry error monitoring (production)
- Structured logging (88% complete)
- Performance monitoring

**Reusability**: JP sync errors automatically tracked in Sentry

### Gaps (Need New Code)

#### ❌ No API Client Pattern
**Current State**: Only file-based ingestion (upload → process → store)
**Needed**: Generic API client with rate limiting, retries, pagination
**Effort**: 6-8 hours to build `/src/lib/joshua-project-client.ts`

#### ❌ No Cron Infrastructure
**Current State**: Vercel cron not configured (`vercel.json` missing cron section)
**Needed**: Cron endpoint + Vercel configuration
**Effort**: 6-8 hours to build `/src/app/api/cron/sync-joshua-project/route.ts`

#### ❌ No API Metadata Schema
**Current State**: `documents` table has no API source tracking
**Needed**: Columns for `api_source`, `api_external_id`, `api_sync_hash`, `api_metadata`
**Effort**: 2 hours for database migration

#### ❌ No Source-Specific Formatting
**Current State**: All search results formatted identically
**Needed**: JP-specific formatter for compliance (estimates, attribution, filtering)
**Effort**: 6-8 hours to build `/src/lib/joshua-project-formatter.ts`

### Integration Points

1. **Ingestion Pipeline** (`/src/lib/ingest.ts`)
   - Entry point: `ingestDocument()` function
   - Add: `ingestAPIData()` variant for JP sync
   - Change: Accept pre-transformed documents (skip file parsing)

2. **Chat Route** (`/src/app/api/chat/route.ts`)
   - Entry point: Search results → LLM context injection
   - Add: JP formatter middleware
   - Change: Detect `api_source=joshua_project` and apply special formatting

3. **Database** (Supabase)
   - Table: `documents`
   - Add: 5 new columns (migration required)
   - Change: Indexes for API source queries

4. **Cron** (Vercel)
   - New endpoint: `/api/cron/sync-joshua-project`
   - New config: `vercel.json` cron schedule
   - New env var: `CRON_SECRET`, `JOSHUA_PROJECT_API_KEY`

---

## Next Steps: Getting Started

### Week 1-2: Phase 1 Implementation

1. **Kickoff Meeting** (30 min)
   - Review this plan with stakeholders
   - Clarify any questions
   - Get approval to proceed

2. **Database Migration** (2 hours)
   ```bash
   # Create migration file
   vim scripts/add-joshua-project-schema.sql
   
   # Apply to development database
   psql $DATABASE_URL < scripts/add-joshua-project-schema.sql
   
   # Verify changes
   psql $DATABASE_URL -c "\d documents"
   ```

3. **API Client Development** (6-8 hours)
   - Build `/src/lib/joshua-project-client.ts`
   - Add unit tests
   - Test with 10 people groups

4. **Manual Sync Script** (4 hours)
   - Build `/scripts/sync-joshua-project-manual.ts`
   - Test with 100 groups
   - Run full sync (17K groups, ~3.5 hours)

5. **Validation** (2 hours)
   - Query Supabase: Verify 17K documents ingested
   - Query Pinecone: Verify 170K vectors created
   - Test chat: "Tell me about the Uyghur people"

### Success Criteria for Phase 1

- ✅ All 17,000 people groups in database
- ✅ All 170,000 vectors in Pinecone
- ✅ Chat returns JP results correctly
- ✅ Unit tests passing (API client, transformer)
- ✅ Embedding cost < $2.00

**Ready to proceed?** Let me know if you have questions or want to start Phase 1\!
