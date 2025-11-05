# Joshua Project Integration - Revised Technical Plan v2.0

**Status**: Draft 2 - Zero-Degradation Architecture
**Created**: October 20, 2025
**Focus**: Preserve PatmosLLM's quality (7.5/10, 500+ users, 67x cache improvement)
**Timeline**: 5-6 weeks (64-86 hours) - includes safeguards
**Cost**: $1.02 initial + $0.10/month

---

## Table of Contents
1. [Core Principle: Zero Impact on Existing App](#core-principle-zero-impact-on-existing-app)
2. [Critical Fixes from Draft 1](#critical-fixes-from-draft-1)
3. [Multi-Source Architecture](#multi-source-architecture)
4. [Source-Aware Formatting](#source-aware-formatting)
5. [Service Layer Extraction](#service-layer-extraction)
6. [Performance Safeguards](#performance-safeguards)
7. [Implementation Phases (Revised)](#implementation-phases-revised)
8. [Testing Strategy](#testing-strategy)
9. [Rollback Plan](#rollback-plan)

---

## Core Principle: Zero Impact on Existing App

### Non-Negotiable Requirements

**Before JP Integration**:
- ✅ 500+ concurrent users
- ✅ 67x cache improvement (3ms cached, 201ms uncached)
- ✅ 40% better hybrid search accuracy
- ✅ 462 documents, 7,956+ chunks searchable
- ✅ GPT-4o-mini streaming responses with context
- ✅ Source attribution for user uploads

**After JP Integration**:
- ✅ **ALL of the above UNCHANGED**
- ✅ JP data available as **additional source** (not replacement)
- ✅ User documents **NEVER suppressed**
- ✅ Non-JP queries have **ZERO performance impact**
- ✅ Chat route remains maintainable (<100 lines added)

### Verification Metrics

| Metric | Before JP | After JP | Tolerance |
|--------|-----------|----------|-----------|
| Cache hit latency | 3ms | ≤5ms | +67% max |
| Cache miss latency | 201ms | ≤220ms | +10% max |
| User doc suppression | 0% | 0% | **ZERO TOLERANCE** |
| Test pass rate | 78% | ≥78% | No regression |
| Chat route LOC | 1,276 | ≤1,350 | <6% increase |

---

## Critical Fixes from Draft 1

### ❌ Draft 1 Issues (REJECTED)

| Issue | Draft 1 Approach | Why It's Bad |
|-------|------------------|--------------|
| **Source Suppression** | "Filter out non-JP sources when JP data detected" | Hides user's own documents. Reduces answer quality. Breaks trust. |
| **Number Formatting Leak** | Auto-append "(estimate)" via regex on full text | Contaminates financial data, non-JP percentages. Global side effects. |
| **Performance Impact** | No conditional execution, JP logic runs on all queries | Slows down non-JP queries. Breaks 67x cache improvement. |
| **Code Bloat** | Add JP logic directly to `/api/chat/route.ts` (1,276 lines) | Makes unmaintainable file worse. Violates single responsibility. |

### ✅ Draft 2 Solutions

| Fix | Approach | Why It's Better |
|-----|----------|-----------------|
| **Multi-Source Rendering** | Show ALL sources side-by-side with clear attribution | User sees complete picture. No information loss. |
| **Source-Aware Formatting** | Apply JP rules ONLY to JP chunks (via metadata) | Zero side effects on user data. Surgical precision. |
| **Conditional Execution** | Early exit if no JP sources detected | Zero overhead for non-JP queries. Maintains performance. |
| **Service Layer** | Extract to `/src/lib/services/source-formatting-service.ts` | Chat route stays clean. Testable, maintainable. |

---

## Multi-Source Architecture

### Design Principle: **Coexistence, Not Suppression**

All sources (JP, user uploads, future APIs) coexist harmoniously with **per-source rendering rules**.

### Response Structure

```typescript
type SourcedResponse = {
  sources: {
    joshua_project?: SourceGroup;
    user_uploads?: SourceGroup;
    other?: SourceGroup;
  };
  combined_answer: string; // LLM synthesis from ALL sources
  citations: Citation[];
};

type SourceGroup = {
  chunks: Chunk[];
  attribution: string; // e.g., "Data provided by Joshua Project"
  formatting_rules: FormattingRules; // Source-specific
};

type FormattingRules = {
  numbers_as_estimates: boolean;
  show_definitions: boolean;
  link_out: boolean;
};
```

### Example: Mixed-Source Query

**User Query**: "Tell me about the Uyghur people"

**Retrieval Results**:
- 5 chunks from Joshua Project (api_source='joshua_project')
- 3 chunks from user's "Uyghur Field Report.pdf" (api_source=null)
- 2 chunks from another uploaded doc

**Response Strategy**:
```typescript
// 1. Group by source
const groups = groupChunksBySource(allChunks);

// 2. Apply source-specific formatting
const jpFormatted = formatJoshuaProjectChunks(groups.joshua_project);
const userFormatted = formatUserChunks(groups.user_uploads);

// 3. Send ALL to LLM with source labels
const context = `
JOSHUA PROJECT DATA (use exact numbers, append "(estimate)"):
${jpFormatted.text}

USER'S UPLOADED DOCUMENTS (use as-is, no modifications):
${userFormatted.text}
`;

// 4. LLM synthesizes from BOTH sources
const answer = await llm.generate(context);

// 5. Append grouped citations
return {
  answer,
  citations: [
    { source: 'Joshua Project', accessed: '2025-10-20', url: 'https://joshuaproject.net' },
    { source: 'Uyghur Field Report.pdf', uploaded: '2025-09-15' }
  ]
};
```

**Final Output**:
```
The Uyghur are a Turkic ethnic group primarily in Xinjiang, China.

According to Joshua Project, they have a population of approximately
12 million (estimate) and are 0.01% Evangelical (estimate).

Your field report notes that local church planting efforts have
increased by 15% in the past year, with 3 new house churches established
in urban areas.

---
Sources:
• Data provided by Joshua Project — accessed Oct 20, 2025
• Uyghur Field Report.pdf (uploaded by you on Sep 15, 2025)
```

**Key Points**:
- ✅ BOTH sources shown
- ✅ JP numbers have "(estimate)"
- ✅ User's "15%" does NOT have "(estimate)"
- ✅ Clear source attribution
- ✅ User sees complete picture

---

## Source-Aware Formatting

### Problem: Global Regex is Dangerous

**Draft 1 Approach (BAD)**:
```typescript
function formatNumbers(text: string): string {
  // DANGER: Runs on ALL text regardless of source
  return text.replace(/(\d+\.?\d*%)/g, '$1 (estimate)'); // ❌
}
```

**Why This Breaks**:
```
Input: "Joshua Project: 0.1% Evangelical. User's report: Revenue up 12.5%"
Output: "Joshua Project: 0.1% (estimate) Evangelical. User's report: Revenue up 12.5% (estimate)"
                                                                                    ^^^^^^^^^^^^^^^^
                                                                                    CONTAMINATED ❌
```

### Solution: Per-Chunk Source Metadata

**Draft 2 Approach (GOOD)**:
```typescript
type Chunk = {
  id: string;
  content: string;
  document_id: string;
  api_source: string | null; // 'joshua_project' or null
  api_metadata: Record<string, any> | null;
  // ... other fields
};

function formatChunk(chunk: Chunk): FormattedChunk {
  // Only apply JP rules to JP chunks
  if (chunk.api_source === 'joshua_project') {
    return formatJoshuaProjectChunk(chunk);
  }

  // User chunks pass through unchanged
  return {
    content: chunk.content,
    attribution: `Source: ${chunk.document.filename}`
  };
}

function formatJoshuaProjectChunk(chunk: Chunk): FormattedChunk {
  const metadata = chunk.api_metadata as JPMetadata;

  // Extract specific JP fields for formatting
  let formatted = chunk.content;

  // Replace ONLY known JP numeric fields
  if (metadata.percentevangelical !== undefined) {
    const pattern = new RegExp(String(metadata.percentevangelical), 'g');
    formatted = formatted.replace(pattern, `${metadata.percentevangelical} (estimate)`);
  }

  if (metadata.population !== undefined) {
    const pattern = new RegExp(String(metadata.population), 'g');
    formatted = formatted.replace(pattern, `${metadata.population} (estimate)`);
  }

  // Add JP-specific attribution
  return {
    content: formatted,
    attribution: `Data provided by Joshua Project — accessed ${chunk.api_last_synced}`,
    source_url: 'https://joshuaproject.net'
  };
}
```

**Why This Works**:
- ✅ JP formatting ONLY applies to chunks with `api_source='joshua_project'`
- ✅ Uses metadata to identify exact fields to format
- ✅ User chunks skip JP formatting entirely
- ✅ Zero side effects

### Per-Chunk Provenance in Embeddings

**During Ingestion** (add metadata to each chunk):
```typescript
async function ingestJPGroup(group: PeopleGroup): Promise<void> {
  const chunks = chunkGroupContent(group);

  for (const chunk of chunks) {
    // Store source metadata in chunk
    await supabase.from('chunks').insert({
      content: chunk.text,
      document_id: jpDocumentId,
      api_source: 'joshua_project', // ← Source marker
      api_metadata: {
        peopcode: group.peopcode,
        // Store ONLY the fields present in this chunk
        fields: extractFieldsFromChunk(chunk.text, group),
        // e.g., { population: 12000000, percentevangelical: 0.01 }
      }
    });
  }
}
```

**Why This Matters**:
- Each chunk knows its source
- Formatter can extract exact values from metadata
- No regex guessing needed

---

## Service Layer Extraction

### Problem: Chat Route is Already Too Large

**Current State**:
- `/src/app/api/chat/route.ts` = **1,276 lines** (violates single responsibility)
- Already identified as technical debt in CLAUDE.md

**Draft 1 Approach**: Add JP logic directly to this file
**Result**: Makes bad situation worse (1,276 → 1,400+ lines)

### Solution: Extract to Service Layer

**New Architecture**:
```
/src/lib/services/
  ├── source-formatting-service.ts  (NEW - handles all source formatting)
  ├── joshua-project-service.ts     (NEW - JP-specific logic)
  └── chat-service.ts                (FUTURE - extract chat logic)

/src/app/api/chat/route.ts (THIN ORCHESTRATOR)
  ↓ calls
  SourceFormattingService.formatChunks(chunks)
    ↓ delegates to
    JoshuaProjectService.formatJPChunk(chunk) (if JP source detected)
```

### Implementation

**1. Source Formatting Service** (Generic, extensible):
```typescript
// /src/lib/services/source-formatting-service.ts

import { JoshuaProjectService } from './joshua-project-service';

export class SourceFormattingService {
  private jpService = new JoshuaProjectService();

  /**
   * Format chunks based on their source, applying source-specific rules.
   * Non-source chunks pass through unchanged.
   */
  formatChunks(chunks: Chunk[]): FormattedChunk[] {
    return chunks.map(chunk => {
      switch (chunk.api_source) {
        case 'joshua_project':
          return this.jpService.formatChunk(chunk);

        case null:
        case undefined:
          // User-uploaded documents - no special formatting
          return this.formatUserChunk(chunk);

        default:
          // Future sources (e.g., 'operation_world', 'pew_research')
          return this.formatGenericAPIChunk(chunk);
      }
    });
  }

  private formatUserChunk(chunk: Chunk): FormattedChunk {
    return {
      content: chunk.content,
      source_type: 'user_upload',
      attribution: `Source: ${chunk.document.filename}`,
      formatting_applied: false
    };
  }

  private formatGenericAPIChunk(chunk: Chunk): FormattedChunk {
    return {
      content: chunk.content,
      source_type: 'api',
      attribution: `Source: ${chunk.api_source}`,
      formatting_applied: false
    };
  }

  /**
   * Group formatted chunks by source for citation rendering
   */
  groupBySource(chunks: FormattedChunk[]): SourceGroups {
    return {
      joshua_project: chunks.filter(c => c.source_type === 'joshua_project'),
      user_uploads: chunks.filter(c => c.source_type === 'user_upload'),
      other_apis: chunks.filter(c => c.source_type === 'api')
    };
  }
}
```

**2. Joshua Project Service** (JP-specific logic):
```typescript
// /src/lib/services/joshua-project-service.ts

export class JoshuaProjectService {
  /**
   * Format a JP chunk according to their 6 requirements
   */
  formatChunk(chunk: Chunk): FormattedChunk {
    if (!this.isJPChunk(chunk)) {
      throw new Error('Not a Joshua Project chunk');
    }

    const metadata = chunk.api_metadata as JPMetadata;
    let formatted = chunk.content;

    // Apply JP-specific rules
    formatted = this.formatNumbers(formatted, metadata);
    formatted = this.preserveNuance(formatted, metadata);

    return {
      content: formatted,
      source_type: 'joshua_project',
      attribution: this.getAttribution(chunk),
      metadata: this.sanitizeMetadata(metadata),
      formatting_applied: true
    };
  }

  private formatNumbers(text: string, metadata: JPMetadata): string {
    let result = text;

    // Only format numbers that exist in metadata (source of truth)
    const numericFields = [
      { key: 'population', value: metadata.population },
      { key: 'percentevangelical', value: metadata.percentevangelical },
      { key: 'percentadherents', value: metadata.percentadherents }
    ];

    for (const field of numericFields) {
      if (field.value !== undefined && field.value !== null) {
        // Match the exact number or percentage
        const pattern = new RegExp(
          `\\b${field.value}%?\\b`,
          'g'
        );
        result = result.replace(pattern, `${field.value} (estimate)`);
      }
    }

    return result;
  }

  private preserveNuance(text: string, metadata: JPMetadata): string {
    // Ensure alternate names, subgroups, etc. are included
    // This was already handled during chunking, so just validate
    return text;
  }

  private getAttribution(chunk: Chunk): string {
    const accessDate = new Date(chunk.api_last_synced).toLocaleDateString();
    return `Data provided by Joshua Project — accessed ${accessDate}`;
  }

  private isJPChunk(chunk: Chunk): boolean {
    return chunk.api_source === 'joshua_project' &&
           chunk.api_metadata !== null;
  }

  private sanitizeMetadata(metadata: JPMetadata): Record<string, any> {
    // Return only fields needed for UI (definitions, etc.)
    return {
      jpscale: metadata.jpscale,
      frontier: metadata.frontier,
      definitions: metadata.definitions
    };
  }
}
```

**3. Updated Chat Route** (Thin orchestrator):
```typescript
// /src/app/api/chat/route.ts (ONLY ~50 LINES ADDED)

import { SourceFormattingService } from '@/lib/services/source-formatting-service';

export async function POST(req: Request) {
  // ... existing auth, session setup (unchanged)

  const userMessage = await req.json();

  // EXISTING CODE: Hybrid search (unchanged)
  const chunks = await hybridSearch(userMessage.content, userId);

  // NEW CODE: Format chunks based on source (conditional execution)
  const formattingService = new SourceFormattingService();
  const formattedChunks = formattingService.formatChunks(chunks);
  const sourceGroups = formattingService.groupBySource(formattedChunks);

  // NEW CODE: Build source-aware context
  const context = buildMultiSourceContext(sourceGroups);

  // EXISTING CODE: LLM streaming (unchanged)
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context }
    ],
    stream: true
  });

  // EXISTING CODE: Stream response (unchanged)
  return new StreamingTextResponse(stream);
}

function buildMultiSourceContext(groups: SourceGroups): string {
  let context = '';

  if (groups.joshua_project.length > 0) {
    context += `
JOSHUA PROJECT DATA (use exact numbers with "(estimate)" suffix):
${groups.joshua_project.map(c => c.content).join('\n\n')}
`;
  }

  if (groups.user_uploads.length > 0) {
    context += `
USER'S UPLOADED DOCUMENTS (use as-is, no modifications):
${groups.user_uploads.map(c => c.content).join('\n\n')}
`;
  }

  if (groups.other_apis.length > 0) {
    context += `
OTHER DATA SOURCES:
${groups.other_apis.map(c => c.content).join('\n\n')}
`;
  }

  return context;
}
```

**Benefits**:
- ✅ Chat route adds only ~50 lines (vs. 200+ in Draft 1)
- ✅ All JP logic isolated in `joshua-project-service.ts`
- ✅ Future sources (Operation World, etc.) follow same pattern
- ✅ Testable in isolation
- ✅ Single responsibility maintained

---

## Performance Safeguards

### 1. Early Exit for Non-JP Queries

**Goal**: Zero overhead when JP data not involved

```typescript
export class SourceFormattingService {
  formatChunks(chunks: Chunk[]): FormattedChunk[] {
    // Early exit: If no chunks have api_source, skip all formatting
    const hasAPISources = chunks.some(c => c.api_source !== null);

    if (!hasAPISources) {
      // Fast path: Return as-is (zero processing)
      return chunks.map(c => ({
        content: c.content,
        source_type: 'user_upload',
        formatting_applied: false
      }));
    }

    // Slow path: Apply source-specific formatting (only when needed)
    return chunks.map(chunk => {
      // ... source-specific logic
    });
  }
}
```

**Performance Impact**:
- **Non-JP queries**: +0.1ms (single array check)
- **JP queries**: +5-10ms (formatting overhead, but only when JP data present)

### 2. Optimize Database Queries

**Problem**: JSONB queries can be slow

**Solution 1: Composite Index**:
```sql
-- Fast lookup for JP documents
CREATE INDEX idx_documents_api_source_user
ON documents(api_source, auth_user_id)
WHERE api_source IS NOT NULL;
```

**Solution 2: Denormalize api_source to chunks table**:
```sql
-- Add api_source to chunks for faster filtering
ALTER TABLE chunks ADD COLUMN api_source TEXT;

-- Copy from parent document
UPDATE chunks c
SET api_source = d.api_source
FROM documents d
WHERE c.document_id = d.id;

-- Index for fast filtering
CREATE INDEX idx_chunks_api_source ON chunks(api_source);
```

**Performance Impact**:
- **Before**: Sequential scan on chunks table (slow)
- **After**: Index-only scan (fast)

### 3. Cache Key Stability

**Problem**: Different formatting for same query breaks cache

**Solution**: Include source types in cache key
```typescript
function generateCacheKey(query: string, userId: string, chunks: Chunk[]): string {
  const sourceTypes = new Set(chunks.map(c => c.api_source || 'user'));
  const sortedSources = Array.from(sourceTypes).sort().join(',');

  return `chat:${userId}:${hashQuery(query)}:sources:${sortedSources}`;
}
```

**Why This Works**:
- Same query with same sources → same cache key → cache hit
- Same query with different sources → different cache key → correct formatting

**Performance Impact**:
- Maintains 67x cache improvement
- Cache hit rate unchanged

### 4. Pinecone Namespace (Optional Optimization)

**Current**: All vectors in default namespace
**Proposed**: Separate namespace for JP data

```typescript
// Ingest JP data to separate namespace
await pineconeIndex.upsert({
  vectors: jpVectors,
  namespace: 'joshua_project' // ← Isolated
});

// Query with namespace filtering
const jpResults = await pineconeIndex.query({
  vector: queryEmbedding,
  namespace: 'joshua_project',
  topK: 10
});

const userResults = await pineconeIndex.query({
  vector: queryEmbedding,
  namespace: 'default', // User uploads
  topK: 10
});

// Merge results
const allResults = [...jpResults, ...userResults];
```

**Benefits**:
- ✅ Explicit source separation
- ✅ Can query JP-only or user-only efficiently
- ✅ No metadata filtering overhead

**Trade-offs**:
- ⚠️ Two Pinecone queries instead of one (adds ~50ms latency)
- ⚠️ More complex merging logic

**Recommendation**: Start WITHOUT namespaces (simpler). Add later if needed for performance.

---

## Implementation Phases (Revised)

### Phase 0: Baseline & Safety Net (NEW)
**Timeline**: 4-6 hours
**Goal**: Establish performance baseline and rollback capability

#### Tasks
1. **Performance Baseline** (2 hours)
   - Benchmark current metrics:
     - Cache hit latency: 3ms
     - Cache miss latency: 201ms
     - Hybrid search latency: 150ms
     - End-to-end response time: 800ms
   - Document in `benchmarks/pre-jp-integration.json`
   - Set up automated performance regression tests

2. **Feature Flag Setup** (2 hours)
   - Add env var: `FEATURE_FLAG_JP_INTEGRATION=false`
   - Wrap all JP code in feature flag checks
   - Test flag toggling (on/off/on)

3. **Rollback Plan** (1 hour)
   - Document database rollback steps
   - Create `scripts/rollback-jp-integration.sql`
   - Test rollback procedure in dev environment

4. **Monitoring Setup** (1 hour)
   - Add Sentry breadcrumbs for JP formatting
   - Create dashboard for JP-specific metrics
   - Set up alerts for performance degradation

#### Deliverables
- ✅ Performance baseline documented
- ✅ Feature flag operational
- ✅ Rollback script tested
- ✅ Monitoring configured

---

### Phase 1: Service Layer Foundation (REVISED)
**Timeline**: 20-24 hours (was 16-20)
**Goal**: Build JP infrastructure without touching existing code

#### Tasks
1. **Database Migration** (3 hours - was 2)
   - Create `scripts/add-joshua-project-schema.sql`
   - Add columns: `api_source`, `api_external_id`, `api_last_synced`, `api_sync_hash`, `api_metadata`
   - Add indexes: `idx_documents_api_source_user`, `idx_chunks_api_source`
   - Add `api_source` to chunks table (denormalization)
   - Test migration with rollback

2. **Service Layer** (8-10 hours - NEW)
   - Create `/src/lib/services/source-formatting-service.ts`
   - Create `/src/lib/services/joshua-project-service.ts`
   - Implement multi-source formatting logic
   - Write comprehensive unit tests (95% coverage)

3. **API Client** (6-8 hours)
   - Create `/src/lib/joshua-project-client.ts`
   - Implement rate limiting (adaptive backoff, not fixed delay)
   - Add exponential backoff for errors
   - Handle pagination
   - Write unit tests

4. **Data Transformer** (4-6 hours)
   - Create `/src/lib/joshua-project-transformer.ts`
   - Implement `transform()` method
   - Preserve anthropological nuance in chunking
   - Compute SHA-256 hash for change detection
   - Extract numeric fields to metadata
   - Write unit tests

5. **Manual Sync Script** (3-4 hours - was 4)
   - Create `/scripts/sync-joshua-project-manual.ts`
   - Add progress logging
   - Add checkpoint/resume capability
   - Feature flag check

#### Deliverables
- ✅ Database schema updated
- ✅ Service layer operational (with tests)
- ✅ API client working (with tests)
- ✅ Manual sync script ready
- ✅ Zero impact on existing chat route

---

### Phase 2: Chat Integration (REVISED)
**Timeline**: 12-16 hours (was 8-12)
**Goal**: Integrate JP formatting into chat flow with safeguards

#### Tasks
1. **Chat Route Integration** (6-8 hours - was 6-8)
   - Update `/src/app/api/chat/route.ts` (add ~50 lines)
   - Integrate `SourceFormattingService`
   - Build multi-source context
   - Feature flag wrapper
   - Preserve existing code paths

2. **System Prompt Update** (2 hours - NEW)
   - Update system prompt to handle multi-source context
   - Add instructions for source-aware synthesis
   - Test with various source combinations

3. **Performance Testing** (4-6 hours - NEW)
   - Benchmark with JP integration enabled
   - Compare to Phase 0 baseline
   - Verify cache still works (67x improvement)
   - Test non-JP queries (should be unchanged)

#### Deliverables
- ✅ Chat integration complete
- ✅ Multi-source responses working
- ✅ Performance metrics meet tolerance
- ✅ Feature flag operational

---

### Phase 3: Initial Sync & Validation (REVISED)
**Timeline**: 12-16 hours (was included in Phase 1)
**Goal**: Ingest JP data and validate search quality

#### Tasks
1. **Test Sync** (4 hours)
   - Sync 100 people groups first
   - Validate data quality in Supabase
   - Check Pinecone vectors created
   - Verify metadata structure

2. **Search Quality Testing** (4 hours)
   - Test 20 people group queries
   - Verify JP chunks returned correctly
   - Verify user docs NOT suppressed
   - Check source attribution

3. **Full Sync** (4 hours)
   - Run full 17K sync (~3.5 hours)
   - Monitor progress and errors
   - Validate completion

4. **Validation** (2-4 hours)
   - Query Supabase: 17K documents present
   - Query Pinecone: 170K vectors present
   - End-to-end chat tests

#### Deliverables
- ✅ 17,000 people groups ingested
- ✅ Search returns JP results correctly
- ✅ User documents still searchable
- ✅ Multi-source responses working

---

### Phase 4: Automated Cron (UNCHANGED)
**Timeline**: 8-12 hours
**Goal**: Monthly sync automation

#### Tasks
1. **Cron Endpoint** (6-8 hours)
   - Create `/src/app/api/cron/sync-joshua-project/route.ts`
   - Implement change detection
   - Add checkpointing
   - Sentry integration
   - CRON_SECRET authentication

2. **Vercel Cron Config** (1 hour)
   - Update `vercel.json`
   - Deploy to staging
   - Verify schedule

3. **Testing** (3-5 hours)
   - Manual trigger test
   - Change detection test
   - Load test (10% change rate)

#### Deliverables
- ✅ Monthly sync operational
- ✅ Change detection working
- ✅ Logs visible in dashboard

---

### Phase 5: Comprehensive Testing (REVISED)
**Timeline**: 16-20 hours (was 8-12)
**Goal**: Exhaustive validation, zero regressions

#### Tasks
1. **Scenario Testing** (8 hours - was 4)
   - Test all 4 scenarios:
     1. Mixed sources (user doc + JP)
     2. Financial data (no contamination)
     3. Non-JP performance (unchanged)
     4. Comparison queries (both sources shown)
   - Document results

2. **Regression Testing** (4 hours - NEW)
   - Run full test suite (121 tests)
   - Verify 78% pass rate maintained
   - No new failures introduced

3. **Performance Regression** (4 hours - NEW)
   - Compare to Phase 0 baseline
   - Verify all metrics within tolerance
   - Document any deviations

4. **Load Testing** (4 hours - was 2)
   - Simulate 500 concurrent users
   - Mix of JP and non-JP queries
   - Verify system stability

5. **Security Audit** (2 hours)
   - API key storage
   - Cron authentication
   - Error message leaks

6. **Documentation** (2 hours)
   - Update CLAUDE.md
   - API documentation
   - Deployment guide

#### Deliverables
- ✅ All scenarios passing
- ✅ No regressions detected
- ✅ Performance within tolerance
- ✅ Load testing passed
- ✅ Documentation complete

---

## Testing Strategy

### Unit Tests

**Source Formatting Service**:
```typescript
describe('SourceFormattingService', () => {
  it('should format JP chunks with estimates', () => {
    const jpChunk = createMockJPChunk({
      content: 'Population: 12000000. Evangelical: 0.01%',
      api_metadata: { population: 12000000, percentevangelical: 0.01 }
    });

    const formatted = service.formatChunks([jpChunk])[0];

    expect(formatted.content).toContain('12000000 (estimate)');
    expect(formatted.content).toContain('0.01 (estimate)');
  });

  it('should NOT format user chunks', () => {
    const userChunk = createMockUserChunk({
      content: 'Revenue increased by 12.5% last quarter'
    });

    const formatted = service.formatChunks([userChunk])[0];

    expect(formatted.content).toBe('Revenue increased by 12.5% last quarter');
    expect(formatted.content).not.toContain('(estimate)');
  });

  it('should handle mixed sources correctly', () => {
    const chunks = [
      createMockJPChunk({ content: 'JP data: 0.1%', api_metadata: { percentevangelical: 0.1 } }),
      createMockUserChunk({ content: 'User data: 15% growth' })
    ];

    const formatted = service.formatChunks(chunks);

    expect(formatted[0].content).toContain('0.1 (estimate)');
    expect(formatted[1].content).toBe('User data: 15% growth');
  });

  it('should skip formatting when no API sources present', () => {
    const userChunks = [
      createMockUserChunk({ content: 'Doc 1' }),
      createMockUserChunk({ content: 'Doc 2' })
    ];

    const formatted = service.formatChunks(userChunks);

    expect(formatted[0].formatting_applied).toBe(false);
    expect(formatted[1].formatting_applied).toBe(false);
  });
});
```

### Integration Tests

**Chat Route**:
```typescript
describe('POST /api/chat with JP integration', () => {
  beforeEach(() => {
    process.env.FEATURE_FLAG_JP_INTEGRATION = 'true';
  });

  it('should return JP data with estimates', async () => {
    // Setup: Ingest JP data for Uyghur people
    await ingestJPGroupForTest({ peopcode: '12345', name: 'Uyghur' });

    const response = await POST({
      json: () => ({ content: 'Tell me about the Uyghur people' })
    });

    const text = await response.text();

    expect(text).toContain('(estimate)');
    expect(text).toContain('Data provided by Joshua Project');
  });

  it('should NOT suppress user documents', async () => {
    // Setup: Ingest both JP data AND user document
    await ingestJPGroupForTest({ peopcode: '12345', name: 'Uyghur' });
    await ingestUserDocForTest({ filename: 'Uyghur Report.pdf', content: 'Field notes...' });

    const response = await POST({
      json: () => ({ content: 'Tell me about the Uyghur people' })
    });

    const text = await response.text();

    // Should mention BOTH sources
    expect(text).toContain('Joshua Project');
    expect(text).toContain('Uyghur Report.pdf');
  });

  it('should NOT affect non-JP queries', async () => {
    // Setup: User document only (no JP data)
    await ingestUserDocForTest({ filename: 'Financial Report.pdf', content: 'Revenue: $1M' });

    const response = await POST({
      json: () => ({ content: 'What was our revenue?' })
    });

    const text = await response.text();

    expect(text).toContain('$1M');
    expect(text).not.toContain('(estimate)');
    expect(text).not.toContain('Joshua Project');
  });
});
```

### Performance Tests

**Benchmark Suite**:
```typescript
describe('Performance benchmarks', () => {
  it('should maintain cache performance', async () => {
    const query = 'Tell me about the Uyghur people';

    // First query (cache miss)
    const start1 = Date.now();
    await POST({ json: () => ({ content: query }) });
    const duration1 = Date.now() - start1;

    // Second query (cache hit)
    const start2 = Date.now();
    await POST({ json: () => ({ content: query }) });
    const duration2 = Date.now() - start2;

    // Verify cache improvement still present
    expect(duration2).toBeLessThan(duration1 * 0.1); // 10x minimum
    expect(duration2).toBeLessThan(10); // <10ms cached
  });

  it('should NOT slow down non-JP queries', async () => {
    const baseline = await benchmarkQuery('What is our revenue?');

    // Enable JP integration
    process.env.FEATURE_FLAG_JP_INTEGRATION = 'true';

    const withJP = await benchmarkQuery('What is our revenue?');

    // Should be within 10% tolerance
    expect(withJP).toBeLessThan(baseline * 1.1);
  });
});
```

---

## Rollback Plan

### Immediate Rollback (0-5 minutes)

**If Critical Issue Detected**:
1. Disable feature flag:
   ```bash
   vercel env rm FEATURE_FLAG_JP_INTEGRATION production
   ```

2. Redeploy:
   ```bash
   vercel --prod
   ```

**Result**: JP integration disabled, app returns to previous state

### Database Rollback (5-15 minutes)

**If Database Issues**:
```bash
# Run rollback script
psql $DATABASE_URL < scripts/rollback-jp-integration.sql
```

**Rollback Script**:
```sql
-- /scripts/rollback-jp-integration.sql

BEGIN;

-- Remove JP-specific columns from documents
ALTER TABLE documents
  DROP COLUMN IF EXISTS api_source,
  DROP COLUMN IF EXISTS api_external_id,
  DROP COLUMN IF EXISTS api_last_synced,
  DROP COLUMN IF EXISTS api_sync_hash,
  DROP COLUMN IF EXISTS api_metadata;

-- Remove JP-specific columns from chunks
ALTER TABLE chunks
  DROP COLUMN IF EXISTS api_source;

-- Drop indexes
DROP INDEX IF EXISTS idx_documents_api_source_user;
DROP INDEX IF EXISTS idx_chunks_api_source;

-- Delete JP documents (optional - keeps data for investigation)
-- DELETE FROM documents WHERE api_source = 'joshua_project';

COMMIT;
```

### Pinecone Rollback

**Delete JP Vectors**:
```typescript
// scripts/rollback-pinecone-jp.ts

import { pinecone } from '@/lib/pinecone';

async function rollbackJPVectors() {
  const index = pinecone.Index('patmosllm');

  // Delete all JP vectors by metadata filter
  await index.delete({
    filter: { api_source: 'joshua_project' }
  });

  console.log('✅ JP vectors deleted from Pinecone');
}

rollbackJPVectors();
```

### Code Rollback

**Revert Git Commit**:
```bash
# Find commit before JP integration
git log --oneline

# Revert to that commit
git revert <commit-hash>

# Deploy
git push origin main
vercel --prod
```

---

## Revised Timeline & Effort

### Total Effort: 64-86 hours (vs. 44-56 in Draft 1)

| Phase | Hours | Deliverable |
|-------|-------|-------------|
| Phase 0: Baseline & Safety Net | 4-6 | Feature flag, benchmarks, rollback plan |
| Phase 1: Service Layer | 20-24 | Service layer, API client, transformer, tests |
| Phase 2: Chat Integration | 12-16 | Multi-source rendering, performance validation |
| Phase 3: Initial Sync | 12-16 | 17K groups ingested, search quality validated |
| Phase 4: Automated Cron | 8-12 | Monthly sync operational |
| Phase 5: Testing | 16-20 | Comprehensive validation, zero regressions |
| **Total** | **72-94** | **Production-ready with safeguards** |

### Why More Time?

| Area | Draft 1 | Draft 2 | Justification |
|------|---------|---------|---------------|
| **Phase 0 (NEW)** | 0 hours | 4-6 hours | Baseline + rollback capability essential |
| **Service Layer** | Included in Phase 1 | 8-10 hours | Proper abstraction, avoid code bloat |
| **Performance Testing** | 2 hours | 8 hours | Comprehensive benchmarking required |
| **Scenario Testing** | 4 hours | 8 hours | 4 critical scenarios need thorough validation |
| **Regression Testing** | 0 hours | 4 hours | Must verify no existing tests break |

**Bottom Line**: The extra 20-30 hours ensures PatmosLLM's quality (7.5/10, 500+ users, 67x cache) is preserved.

---

## Summary: Zero-Degradation Guarantees

### What We're Preserving

| Metric | Current | After JP | Guarantee |
|--------|---------|----------|-----------|
| **User doc suppression** | 0% | 0% | NEVER suppress user documents |
| **Non-JP query performance** | 3ms / 201ms | ≤5ms / 220ms | <10% degradation allowed |
| **Cache improvement** | 67x | ≥60x | Maintain cache efficiency |
| **Test pass rate** | 78% | ≥78% | No regressions |
| **Code maintainability** | Chat route 1,276 LOC | ≤1,350 LOC | <6% growth |

### What We're Adding

- ✅ 17,000 Joshua Project people groups searchable
- ✅ Multi-source responses (JP + user docs coexist)
- ✅ Source-aware formatting (no side effects)
- ✅ Monthly automated sync
- ✅ Compliance with all 6 JP requirements
- ✅ Feature flag for instant rollback
- ✅ Service layer for maintainability

### Implementation Approach

1. **Phase 0**: Establish baseline and safety net
2. **Phase 1**: Build service layer in isolation (zero impact)
3. **Phase 2**: Integrate with chat route (thin orchestration)
4. **Phase 3**: Ingest data and validate search quality
5. **Phase 4**: Automate monthly sync
6. **Phase 5**: Comprehensive testing and validation

**Ready to proceed with this revised plan?** It adds 20-30 hours but guarantees your app's quality is preserved.
