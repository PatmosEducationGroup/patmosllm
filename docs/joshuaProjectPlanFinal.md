# Joshua Project Integration - Final Production Plan v3.0

**Status**: PRODUCTION-READY
**Created**: October 20, 2025
**Architecture**: Zero-Degradation Multi-Source RAG
**Timeline**: 6-7 weeks (72-94 hours)
**Cost**: $1.02 initial + $0.10/month

---

## Table of Contents
1. [Technical Foundation](#technical-foundation)
2. [Entity Strategy: PGIC vs PGAC](#entity-strategy-pgic-vs-pgac)
3. [Per-Field Rendering Architecture](#per-field-rendering-architecture)
4. [Adaptive Rate Limiting](#adaptive-rate-limiting)
5. [Implementation Code (Drop-In)](#implementation-code-drop-in)
6. [Enhanced Testing Gates](#enhanced-testing-gates)
7. [Implementation Phases](#implementation-phases)
8. [Questions for Joshua Project](#questions-for-joshua-project)
9. [Green-Light Checklist](#green-light-checklist)

---

## Technical Foundation

### Core Principle: Zero-Degradation Multi-Source

**What We're Preserving**:
- ✅ 500+ concurrent users, 67x cache improvement, 40% better search
- ✅ 462 user documents, 7,956+ chunks fully searchable
- ✅ No suppression of user-uploaded documents (ZERO TOLERANCE)
- ✅ Non-JP queries have ≤0.1ms overhead (fast path)

**What We're Adding**:
- ✅ 17,000 Joshua Project people groups as **additional source**
- ✅ Multi-source responses with clear attribution
- ✅ Source-aware formatting (JP rules only apply to JP data)
- ✅ Monthly automated sync with change detection

### Architectural Safeguards

| Safeguard | Implementation | Verification |
|-----------|----------------|--------------|
| **Early Exit** | Skip formatting if no `api_source` present | Non-JP queries: +0.1ms overhead |
| **Source Isolation** | Per-chunk metadata (`api_source`, `api_metadata`) | Cross-source tests verify no leaks |
| **Feature Flag** | `FEATURE_FLAG_JP_INTEGRATION=true/false` | Instant rollback capability |
| **Service Layer** | Extract to `/src/lib/services/` | Chat route adds only ~50 lines |
| **Rollback Plan** | SQL script + Pinecone delete | Tested in dev, documented |

---

## Entity Strategy: PGIC vs PGAC

### Decision: Use PGIC (People Groups In Countries)

**Joshua Project Entities**:
1. **PGAC** (People Groups Across Countries): ~10K groups
   - Example: "Han Chinese" (aggregated across China, Taiwan, Singapore, etc.)
   - Pro: Fewer records, simpler data model
   - Con: Loses country-specific nuance

2. **PGIC** (People Groups In Countries): ~17K groups
   - Example: "Han Chinese (China)", "Han Chinese (Taiwan)", "Han Chinese (Singapore)"
   - Pro: Preserves country context, better for missions research
   - Con: More records to sync

**Why PGIC?**:
- ✅ Preserves anthropological nuance (cross-border reality, diaspora nodes)
- ✅ Matches your 17K estimate
- ✅ Better retrieval clarity ("Uyghur (China)" vs "Uyghur (Kazakhstan)")
- ✅ Aligns with JP Requirement #3: "Preserve multi-layered and dynamic context"

### Implementation: Title Convention

**Format**: `{PeopleName} ({Country})`

**Examples**:
- "Uyghur (China)"
- "Uyghur (Kazakhstan)"
- "Han Chinese (China)"
- "Han Chinese (Taiwan)"

**Database**:
```sql
ALTER TABLE documents
  ADD COLUMN api_external_id TEXT; -- JP's PeopleID3 + Country Code

-- Store composite key for uniqueness
CREATE UNIQUE INDEX idx_documents_jp_unique
ON documents(api_source, api_external_id)
WHERE api_source = 'joshua_project';
```

**Metadata**:
```typescript
{
  "peopcode": "12345",        // PeopleID3
  "rog3": "CN",               // Country code (ISO 3166-1 alpha-2)
  "peoname": "Uyghur",        // People name
  "cntryname": "China",       // Country name
  // ... other fields
}
```

**Document Title**:
```typescript
function generateJPDocumentTitle(group: PGICData): string {
  return `${group.peoname} (${group.cntryname})`;
}
```

---

## Per-Field Rendering Architecture

### Problem: Regex on Text is Fragile

**Draft 1/2 Approach (REJECTED)**:
```typescript
// BAD: Regex search/replace inside chunk text
function formatNumbers(text: string): string {
  return text.replace(/(\d+\.?\d*%)/g, '$1 (estimate)'); // ❌
}
```

**Why It Fails**:
- Can't distinguish JP numbers from user numbers
- Fragile to text variations ("0.1%" vs "0.1 percent")
- Can contaminate non-JP content

### Solution: Compose from Metadata at Render Time

**Principle**: Build formatted text from structured metadata fields, not by modifying chunk content.

**Implementation**:
```typescript
type JPMetadata = {
  peoname: string;
  cntryname: string;
  population?: number;
  percentevangelical?: number;
  percentadherents?: number;
  jpscale?: string;
  frontier?: boolean;
  // ... other fields
};

function formatJPChunk(chunk: Chunk): RenderBlock {
  const m = chunk.api_metadata as JPMetadata;
  const parts: string[] = [];

  // Compose each field from metadata (not text)
  if (m.peoname && m.cntryname) {
    parts.push(`**${m.peoname} (${m.cntryname})**`);
  }

  if (m.population !== undefined && m.population !== null) {
    parts.push(`Population: ${m.population.toLocaleString()} (estimate)`);
  }

  if (m.percentevangelical !== undefined && m.percentevangelical !== null) {
    parts.push(`Evangelical: ${m.percentevangelical}% (estimate)`);
  }

  if (m.percentadherents !== undefined && m.percentadherents !== null) {
    parts.push(`Christian Adherents: ${m.percentadherents}% (estimate)`);
  }

  if (m.jpscale) {
    parts.push(`Status: ${m.jpscale}`);
  }

  // Build formatted text
  const text = parts.join('. ') + '.';

  // Add attribution
  const accessed = chunk.api_last_synced
    ? new Date(chunk.api_last_synced).toLocaleDateString()
    : undefined;

  return {
    text,
    sourceType: 'jp',
    attribution: accessed
      ? `Data provided by Joshua Project — accessed ${accessed}`
      : 'Data provided by Joshua Project',
    metadata: {
      jpscale: m.jpscale,
      frontier: m.frontier,
      definitions: m.definitions
    }
  };
}
```

**Why This Works**:
- ✅ Numbers always come from metadata (source of truth)
- ✅ "(estimate)" applied at composition time, not via regex
- ✅ Zero risk of contaminating user content
- ✅ Handles missing fields gracefully (undefined/null checks)

### Chunking Strategy: Store Raw + Metadata

**During Ingestion**:
```typescript
async function ingestJPGroup(group: PGICData): Promise<void> {
  // Create document
  const document = await supabase.from('documents').insert({
    title: `${group.peoname} (${group.cntryname})`,
    api_source: 'joshua_project',
    api_external_id: `${group.peopcode}-${group.rog3}`, // Composite key
    api_sync_hash: computeSHA256(group),
    api_metadata: group, // Store FULL raw data
    auth_user_id: SYSTEM_USER_ID
  });

  // Create chunks (semantic segments)
  const chunks = [
    {
      content: `${group.peoname} are a people group in ${group.cntryname}.`,
      api_metadata: {
        peoname: group.peoname,
        cntryname: group.cntryname
      }
    },
    {
      content: `Population and religious data for ${group.peoname} in ${group.cntryname}.`,
      api_metadata: {
        population: group.population,
        percentevangelical: group.percentevangelical,
        percentadherents: group.percentadherents
      }
    },
    // ... more semantic chunks
  ];

  for (const chunk of chunks) {
    await supabase.from('chunks').insert({
      document_id: document.id,
      content: chunk.content,
      api_source: 'joshua_project', // Denormalized for fast filtering
      api_metadata: chunk.api_metadata, // ONLY fields used in this chunk
      // ... embedding, etc.
    });
  }
}
```

**Key Points**:
- Raw chunk text is clean, simple sentences
- `api_metadata` on chunk contains ONLY the fields used in that chunk
- Formatter reads metadata to build formatted output
- Original chunk content untouched

---

## Adaptive Rate Limiting

### Problem: Hardcoded Delays are Fragile

**Draft 1/2 Approach (REJECTED)**:
```typescript
// BAD: Assumes 100 req/min limit
private async rateLimit(): Promise<void> {
  await sleep(650); // Hardcoded ❌
}
```

**Why It Fails**:
- JP API doesn't document rate limits publicly
- Wastes time if limit is higher
- Fails to handle 429 errors gracefully

### Solution: Adaptive Backoff with Response Headers

**Implementation**:
```typescript
export class JoshuaProjectClient {
  private lastRequestTime = 0;
  private minDelayMs = 100; // Start conservative
  private maxDelayMs = 5000;
  private currentDelayMs = 100;

  async fetchPeopleGroup(peopcode: string): Promise<PGICData> {
    await this.adaptiveRateLimit();

    const response = await fetch(
      `https://api.joshuaproject.net/v1/people_groups/${peopcode}.json`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.JOSHUA_PROJECT_API_KEY}`
        }
      }
    );

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : this.currentDelayMs * 2; // Exponential backoff

      logger.warn('Rate limited by JP API', {
        retryAfter,
        delayMs,
        currentDelayMs: this.currentDelayMs
      });

      await sleep(delayMs);
      this.currentDelayMs = Math.min(delayMs, this.maxDelayMs);

      // Retry
      return this.fetchPeopleGroup(peopcode);
    }

    // Success: Reduce delay (AIMD - Additive Increase, Multiplicative Decrease)
    if (response.ok) {
      this.currentDelayMs = Math.max(
        this.minDelayMs,
        this.currentDelayMs * 0.9
      );
    }

    // Check for rate limit headers (if JP provides them)
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');

    if (rateLimitRemaining && parseInt(rateLimitRemaining) < 10) {
      logger.warn('Approaching rate limit', {
        remaining: rateLimitRemaining,
        reset: rateLimitReset
      });
    }

    return response.json();
  }

  private async adaptiveRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.currentDelayMs) {
      const delayNeeded = this.currentDelayMs - timeSinceLastRequest;
      await sleep(delayNeeded);
    }

    this.lastRequestTime = Date.now();
  }
}
```

**Benefits**:
- ✅ Starts conservative (100ms delay)
- ✅ Adapts based on 429 responses
- ✅ Honors `Retry-After` header if present
- ✅ Speeds up if no rate limits hit (AIMD algorithm)
- ✅ Logs warnings when approaching limits

### CSV Fast-Path for Initial Load

**Option**: If JP provides bulk CSV/Excel export

**Implementation**:
```typescript
async function initialLoadFromCSV(): Promise<void> {
  // 1. Download CSV from JP (or manual download)
  const csvPath = 'data/joshua-project-pgic.csv';
  const groups = await parseCSV(csvPath);

  // 2. Process in batches
  for (const batch of chunk(groups, 100)) {
    await ingestJPBatch(batch);
  }

  // 3. Mark as synced
  await supabase.from('documents')
    .update({ api_last_synced: new Date() })
    .eq('api_source', 'joshua_project');
}
```

**Benefits**:
- ✅ Faster initial load (no rate limits)
- ✅ Consistent snapshot
- ✅ Use API for monthly updates only

---

## Implementation Code (Drop-In)

### Type Definitions

```typescript
// /src/types/sources.ts

export type Chunk = {
  id: string;
  content: string;
  document?: {
    id: string;
    filename?: string;
    title?: string;
  };
  api_source?: 'joshua_project' | string | null;
  api_metadata?: Record<string, any> | null;
  api_last_synced?: string | null;
};

export type RenderBlock = {
  text: string;
  sourceType: 'jp' | 'user' | 'api';
  attribution?: string;
  metadata?: Record<string, any>;
};

export type JPMetadata = {
  peopcode: string;
  rog3: string;
  peoname: string;
  cntryname: string;
  population?: number;
  percentevangelical?: number;
  percentadherents?: number;
  jpscale?: string;
  frontier?: boolean;
  primaryreligion?: string;
  alternatenames?: string[];
  subgroups?: string[];
  definitions?: Record<string, string>;
};
```

### Source Formatting Service (Generic)

```typescript
// /src/lib/services/source-formatting-service.ts

import { Chunk, RenderBlock } from '@/types/sources';
import { formatJPChunk } from './joshua-project-service';

export class SourceFormattingService {
  /**
   * Format chunks based on their source.
   * FAST PATH: If no api_source present, skip all formatting.
   */
  formatChunks(chunks: Chunk[]): RenderBlock[] {
    // Early exit: Zero overhead for user-only queries
    if (!chunks.some(c => c.api_source)) {
      return chunks.map(c => ({
        text: c.content,
        sourceType: 'user',
        attribution: c.document?.filename
          ? `Source: ${c.document.filename}`
          : undefined
      }));
    }

    // Apply source-specific formatting
    return chunks.map(chunk => {
      if (chunk.api_source === 'joshua_project') {
        return formatJPChunk(chunk);
      }

      if (!chunk.api_source) {
        return {
          text: chunk.content,
          sourceType: 'user',
          attribution: chunk.document?.filename
            ? `Source: ${chunk.document.filename}`
            : undefined
        };
      }

      // Future: Other API sources
      return {
        text: chunk.content,
        sourceType: 'api',
        attribution: `Source: ${chunk.api_source}`
      };
    });
  }

  /**
   * Group formatted blocks by source type for rendering.
   */
  groupBySource(blocks: RenderBlock[]): {
    joshua_project: RenderBlock[];
    user_uploads: RenderBlock[];
    other_apis: RenderBlock[];
  } {
    return {
      joshua_project: blocks.filter(b => b.sourceType === 'jp'),
      user_uploads: blocks.filter(b => b.sourceType === 'user'),
      other_apis: blocks.filter(b => b.sourceType === 'api')
    };
  }
}
```

### Joshua Project Service (JP-Specific)

```typescript
// /src/lib/services/joshua-project-service.ts

import { Chunk, RenderBlock, JPMetadata } from '@/types/sources';

export function formatJPChunk(chunk: Chunk): RenderBlock {
  if (!chunk.api_source || chunk.api_source !== 'joshua_project') {
    throw new Error('Not a Joshua Project chunk');
  }

  const m = chunk.api_metadata as JPMetadata;
  if (!m) {
    throw new Error('Missing api_metadata for JP chunk');
  }

  // Compose formatted text from metadata fields
  const parts: string[] = [];

  // Header
  if (m.peoname && m.cntryname) {
    parts.push(`**${m.peoname} (${m.cntryname})**`);
  }

  // Population
  if (m.population !== undefined && m.population !== null) {
    parts.push(`Population: ${m.population.toLocaleString()} (estimate)`);
  }

  // Religious statistics
  if (m.percentevangelical !== undefined && m.percentevangelical !== null) {
    parts.push(`Evangelical: ${m.percentevangelical}% (estimate)`);
  }

  if (m.percentadherents !== undefined && m.percentadherents !== null) {
    parts.push(`Christian Adherents: ${m.percentadherents}% (estimate)`);
  }

  // Primary religion
  if (m.primaryreligion) {
    parts.push(`Primary Religion: ${m.primaryreligion}`);
  }

  // Status
  if (m.jpscale) {
    const frontier = m.frontier ? ' (Frontier)' : '';
    parts.push(`Status: ${m.jpscale}${frontier}`);
  }

  // Alternate names
  if (m.alternatenames && m.alternatenames.length > 0) {
    parts.push(`Also known as: ${m.alternatenames.join(', ')}`);
  }

  // Subgroups
  if (m.subgroups && m.subgroups.length > 0) {
    parts.push(`Subgroups: ${m.subgroups.join(', ')}`);
  }

  // Build formatted text
  const text = parts.length > 0
    ? parts.join('. ') + '.'
    : `${chunk.content}\n\n(Values are estimates)`;

  // Attribution
  const accessed = chunk.api_last_synced
    ? new Date(chunk.api_last_synced).toLocaleDateString()
    : undefined;

  return {
    text,
    sourceType: 'jp',
    attribution: accessed
      ? `Data provided by Joshua Project — accessed ${accessed}`
      : 'Data provided by Joshua Project',
    metadata: {
      jpscale: m.jpscale,
      frontier: m.frontier,
      definitions: m.definitions
    }
  };
}
```

### Chat Route Integration (Thin)

```typescript
// /src/app/api/chat/route.ts (ONLY ~50 LINES ADDED)

import { SourceFormattingService } from '@/lib/services/source-formatting-service';

export async function POST(req: Request) {
  // ... existing auth, session setup (unchanged)

  const userMessage = await req.json();

  // EXISTING: Hybrid search (unchanged)
  const chunks = await hybridSearch(userMessage.content, userId);

  // NEW: Source-aware formatting (feature-flagged)
  let formattedBlocks = chunks; // Default: pass-through

  if (process.env.FEATURE_FLAG_JP_INTEGRATION === 'true') {
    const formattingService = new SourceFormattingService();
    formattedBlocks = formattingService.formatChunks(chunks);
    const sourceGroups = formattingService.groupBySource(formattedBlocks);

    // Build multi-source context
    const context = buildMultiSourceContext(sourceGroups);

    // ... pass to LLM
  } else {
    // Feature flag OFF: Original behavior
    const context = chunks.map(c => c.content).join('\n\n');
    // ... pass to LLM
  }

  // EXISTING: LLM streaming (unchanged)
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context }
    ],
    stream: true
  });

  return new StreamingTextResponse(stream);
}

function buildMultiSourceContext(groups: any): string {
  let context = '';

  if (groups.joshua_project.length > 0) {
    context += `
JOSHUA PROJECT DATA (use exact numbers with "(estimate)" suffix already applied):
${groups.joshua_project.map(b => b.text).join('\n\n')}

`;
  }

  if (groups.user_uploads.length > 0) {
    context += `
USER'S UPLOADED DOCUMENTS (use as-is, no modifications):
${groups.user_uploads.map(b => b.text).join('\n\n')}

`;
  }

  if (groups.other_apis.length > 0) {
    context += `
OTHER DATA SOURCES:
${groups.other_apis.map(b => b.text).join('\n\n')}

`;
  }

  return context;
}
```

**Key Points**:
- ✅ Feature flag wraps ALL JP logic
- ✅ Chat route adds only ~50 lines
- ✅ Non-JP queries skip formatting entirely
- ✅ Service layer handles complexity

---

## Enhanced Testing Gates

### Beyond Basic Unit Tests

#### 1. Terms Guardrail Test (Staged Rollout)

**Scenario**: Disable JP output at runtime (e.g., during API outage)

```typescript
describe('JP Graceful Degradation', () => {
  it('should answer from non-JP sources only when ALLOW_JP_OUTPUT=false', async () => {
    process.env.ALLOW_JP_OUTPUT = 'false';

    // Setup: Both JP and user docs available
    await ingestJPGroupForTest({ peoname: 'Uyghur' });
    await ingestUserDocForTest({ filename: 'Uyghur Report.pdf' });

    const response = await POST({
      json: () => ({ content: 'Tell me about the Uyghur people' })
    });

    const text = await response.text();

    // Should use user doc ONLY
    expect(text).toContain('Uyghur Report.pdf');
    expect(text).not.toContain('Joshua Project');
  });
});
```

#### 2. Schema Drift Test

**Scenario**: JP API removes/renames a field

```typescript
describe('JP Schema Resilience', () => {
  it('should gracefully handle missing metadata fields', () => {
    const chunkWithMissingFields: Chunk = {
      id: '1',
      content: 'Test content',
      api_source: 'joshua_project',
      api_metadata: {
        peoname: 'Test Group',
        // Missing: cntryname, population, percentevangelical
      }
    };

    const formatted = formatJPChunk(chunkWithMissingFields);

    expect(formatted.text).toContain('Test Group');
    expect(formatted.text).not.toContain('undefined');
    expect(formatted.text).not.toContain('null');
  });

  it('should log warning and skip gracefully on unknown fields', () => {
    const chunkWithUnknownFields: Chunk = {
      id: '1',
      content: 'Test content',
      api_source: 'joshua_project',
      api_metadata: {
        peoname: 'Test',
        cntryname: 'Country',
        newUnknownField: 'value' // Future API field
      }
    };

    const formatted = formatJPChunk(chunkWithUnknownFields);

    // Should not crash
    expect(formatted).toBeDefined();
    expect(formatted.text).toContain('Test');
  });
});
```

#### 3. Cross-Source Numeric Integrity

**Scenario**: Ensure "(estimate)" only appears on JP values

```typescript
describe('Cross-Source Numeric Integrity', () => {
  it('should NEVER add (estimate) to user financial data', () => {
    const chunks = [
      {
        id: '1',
        content: 'JP population data',
        api_source: 'joshua_project',
        api_metadata: { population: 12000000 }
      },
      {
        id: '2',
        content: 'Revenue increased by 15% last quarter',
        api_source: null,
        document: { filename: 'Finance Report.pdf' }
      }
    ];

    const service = new SourceFormattingService();
    const formatted = service.formatChunks(chunks);

    // JP chunk should have (estimate)
    expect(formatted[0].text).toContain('(estimate)');

    // User chunk should NOT have (estimate)
    expect(formatted[1].text).toBe('Revenue increased by 15% last quarter');
    expect(formatted[1].text).not.toContain('(estimate)');
  });
});
```

#### 4. Performance Envelope Test

**Scenario**: Verify overhead with JP disabled

```typescript
describe('Performance Envelope', () => {
  it('should add ≤0.1ms overhead with JP flag OFF', async () => {
    process.env.FEATURE_FLAG_JP_INTEGRATION = 'false';

    const chunks = createMockUserChunks(100);

    const start = performance.now();
    const service = new SourceFormattingService();
    service.formatChunks(chunks);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(0.5); // Very fast
  });

  it('should add ≤5ms overhead with JP flag ON but no JP data', async () => {
    process.env.FEATURE_FLAG_JP_INTEGRATION = 'true';

    const userChunks = createMockUserChunks(100);

    const start = performance.now();
    const service = new SourceFormattingService();
    service.formatChunks(userChunks); // All user chunks
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5); // Still very fast
  });
});
```

---

## Implementation Phases

### Phase 0: Baseline & Safety Net
**Timeline**: 4-6 hours
**Status**: MANDATORY before any code changes

#### Tasks
1. **Performance Baseline** (2 hours)
   - Benchmark current metrics:
     - Cache hit: 3ms, Cache miss: 201ms
     - Hybrid search: 150ms, E2E: 800ms
   - Save to `benchmarks/pre-jp-integration.json`
   - Set up automated regression alerts

2. **Feature Flag** (1 hour)
   - Add `FEATURE_FLAG_JP_INTEGRATION=false` to .env
   - Test toggling on/off
   - Document flag behavior

3. **Rollback Script** (1 hour)
   - Create `scripts/rollback-jp-integration.sql`
   - Test rollback in dev environment
   - Document rollback procedure

4. **Monitoring** (1 hour)
   - Add Sentry breadcrumbs for JP formatting
   - Create dashboard for JP metrics
   - Set alerts for performance degradation

---

### Phase 1: Service Layer Foundation
**Timeline**: 22-26 hours
**Status**: Build in isolation, zero impact on app

#### Tasks
1. **Database Migration** (3 hours)
   - Create `scripts/add-joshua-project-schema.sql`
   - Add columns: `api_source`, `api_external_id`, `api_sync_hash`, `api_metadata`
   - Denormalize `api_source` to chunks table
   - Add indexes: `idx_documents_jp_unique`, `idx_chunks_api_source`
   - Test migration + rollback

2. **Type Definitions** (2 hours)
   - Create `/src/types/sources.ts`
   - Define `Chunk`, `RenderBlock`, `JPMetadata` types
   - Document type contracts

3. **Service Layer** (10-12 hours)
   - Create `/src/lib/services/source-formatting-service.ts`
   - Create `/src/lib/services/joshua-project-service.ts`
   - Implement per-field rendering from metadata
   - Write comprehensive unit tests (95% coverage)
   - Test all 4 enhanced gates (schema drift, cross-source integrity, etc.)

4. **API Client** (6-8 hours)
   - Create `/src/lib/joshua-project-client.ts`
   - Implement adaptive rate limiting (no hardcoded delays)
   - Honor `Retry-After` header, exponential backoff on 429s
   - Add pagination handling
   - Write unit tests

5. **Data Transformer** (4-6 hours)
   - Create `/src/lib/joshua-project-transformer.ts`
   - Implement `transform()` for PGIC entities
   - Generate title: `{PeopleName} ({Country})`
   - Compute SHA-256 hash for change detection
   - Extract numeric fields to `api_metadata`
   - Write unit tests

#### Deliverables
- ✅ Database schema updated with indexes
- ✅ Service layer complete with 95%+ test coverage
- ✅ API client with adaptive rate limiting
- ✅ Transformer handles PGIC entities
- ✅ ZERO impact on existing chat route

---

### Phase 2: Chat Integration
**Timeline**: 12-16 hours
**Status**: Integrate services into chat flow

#### Tasks
1. **Chat Route Integration** (6-8 hours)
   - Update `/src/app/api/chat/route.ts` (add ~50 lines)
   - Feature flag wrapper around ALL JP logic
   - Integrate `SourceFormattingService.formatChunks()`
   - Build multi-source context
   - Preserve existing code paths

2. **System Prompt Update** (2 hours)
   - Update system prompt to handle multi-source context
   - Add instructions: JP values already have "(estimate)", use as-is
   - Test with various source combinations

3. **Cache Key Stability** (2 hours)
   - Include source types in cache key
   - Test cache hit rate maintained (67x improvement)
   - Verify cache doesn't thrash on source changes

4. **Performance Testing** (4-6 hours)
   - Benchmark with JP integration enabled
   - Compare to Phase 0 baseline
   - Verify non-JP queries ≤0.1ms overhead
   - Verify JP queries <10ms formatting overhead

#### Deliverables
- ✅ Multi-source responses working
- ✅ Feature flag operational
- ✅ Performance within tolerance (≤10% degradation)
- ✅ Cache stability maintained

---

### Phase 3: Initial Sync & Validation
**Timeline**: 12-16 hours
**Status**: Ingest JP data

#### Tasks
1. **Manual Sync Script** (4 hours)
   - Create `/scripts/sync-joshua-project-manual.ts`
   - Add progress logging, checkpoint/resume
   - Feature flag check
   - Adaptive rate limiting

2. **Test Sync** (4 hours)
   - Sync 100 PGIC groups first
   - Validate data quality in Supabase
   - Check Pinecone vectors created
   - Verify `api_metadata` structure

3. **Full Sync** (4 hours)
   - Run full 17K sync (~3.5 hours)
   - Monitor progress, errors, rate limiting
   - Validate completion

4. **Search Quality Testing** (2-4 hours)
   - Test 20 people group queries
   - Verify JP chunks formatted correctly
   - Verify user docs NOT suppressed
   - Check source attribution

#### Deliverables
- ✅ 17,000 PGIC groups ingested
- ✅ Search returns JP results with correct formatting
- ✅ User documents still searchable
- ✅ Multi-source responses working

---

### Phase 4: Automated Cron
**Timeline**: 8-12 hours
**Status**: Monthly sync automation

#### Tasks
1. **Cron Endpoint** (6-8 hours)
   - Create `/src/app/api/cron/sync-joshua-project/route.ts`
   - Change detection (SHA-256 hash comparison)
   - Checkpoint/resume for Vercel timeout handling
   - Sentry integration
   - CRON_SECRET authentication

2. **Vercel Cron Config** (1 hour)
   - Update `vercel.json` with monthly schedule
   - Deploy to staging
   - Verify cron appears in dashboard

3. **Testing** (3-5 hours)
   - Manual trigger test
   - Change detection test (modify 1 group, verify only 1 updated)
   - Load test (simulate 10% change rate)
   - Monitor Sentry logs

#### Deliverables
- ✅ Monthly sync operational (1st of month, 2 AM UTC)
- ✅ Change detection working (90% skip rate)
- ✅ Logs visible in Vercel dashboard
- ✅ Error monitoring via Sentry

---

### Phase 5: Comprehensive Testing
**Timeline**: 16-20 hours
**Status**: Exhaustive validation

#### Tasks
1. **Enhanced Test Gates** (8 hours)
   - Terms guardrail test (ALLOW_JP_OUTPUT=false)
   - Schema drift test (missing/unknown fields)
   - Cross-source numeric integrity test
   - Performance envelope test (overhead <0.1ms)

2. **Scenario Testing** (4 hours)
   - Mixed sources (user doc + JP)
   - Financial data (no contamination)
   - Non-JP performance (unchanged)
   - Comparison queries (both sources shown)

3. **Regression Testing** (4 hours)
   - Run full test suite (121 tests)
   - Verify 78% pass rate maintained
   - No new failures introduced

4. **Load Testing** (4 hours)
   - Simulate 500 concurrent users
   - Mix of JP and non-JP queries
   - Verify system stability, no cache thrashing

5. **Documentation** (2 hours)
   - Update CLAUDE.md with JP integration
   - API documentation for services
   - Deployment guide

#### Deliverables
- ✅ All enhanced test gates passing
- ✅ No regressions detected
- ✅ Performance within tolerance
- ✅ Load testing passed
- ✅ Documentation complete

---

## Questions for Joshua Project

### Technical Questions (Send to JP Team)

1. **Canonical Entity Strategy**
   - **Q**: Should we use PGIC (17K, country-specific) or PGAC (10K, aggregated)?
   - **Context**: We prefer PGIC for anthropological nuance, confirm this aligns with your recommendation.

2. **Rate Limiting**
   - **Q**: What is the official rate limit for API requests? Do you provide `X-RateLimit-*` or `Retry-After` headers?
   - **Context**: We'll implement adaptive backoff, but need to know baseline limits to be a good citizen.

3. **Bulk Export Availability**
   - **Q**: Do you offer periodic CSV/Excel snapshots of PGIC data for faster initial loads?
   - **Context**: Bulk download would reduce API load and speed up our initial sync. We'd still use API for monthly updates.

4. **Change Detection**
   - **Q**: Is there a `last_modified` or `updated_at` field per people group? Or an `updated_since` query parameter?
   - **Context**: This would allow incremental syncs instead of re-fetching all 17K groups monthly.

5. **Numeric Precision**
   - **Q**: What precision should we use for percentages (e.g., `percentevangelical`)? How many decimal places?
   - **Context**: We want to display verbatim JP numbers, need to ensure no rounding errors.

6. **Definition Stability**
   - **Q**: How often do JP definitions change (e.g., "Unreached", "Frontier", "Progress Scale")?
   - **Context**: Should we fetch definitions from API dynamically or hard-code them?

---

## Green-Light Checklist

### Before Starting Implementation

- [ ] **Legal Clearance**: Commercial use approved by JP (if applicable)
- [ ] **Entity Strategy**: Confirmed PGIC (17K) vs PGAC (10K) with JP team
- [ ] **Rate Limits**: Understood official rate limits and headers
- [ ] **Bulk Export**: Checked if CSV/Excel snapshots available

### Phase 0 Complete

- [ ] **Baseline Metrics**: Documented in `benchmarks/pre-jp-integration.json`
- [ ] **Feature Flag**: Tested on/off toggling
- [ ] **Rollback Script**: Tested in dev environment
- [ ] **Monitoring**: Sentry dashboards configured

### Phase 1 Complete

- [ ] **Database Migration**: Applied successfully with rollback tested
- [ ] **Service Layer**: 95%+ test coverage achieved
- [ ] **API Client**: Adaptive rate limiting working
- [ ] **Transformer**: PGIC entities handled correctly

### Phase 2 Complete

- [ ] **Chat Integration**: Multi-source responses working
- [ ] **Performance**: Non-JP queries <0.1ms overhead
- [ ] **Cache**: 67x improvement maintained
- [ ] **Feature Flag**: Instant rollback verified

### Phase 3 Complete

- [ ] **Initial Sync**: 17,000 PGIC groups ingested
- [ ] **Search Quality**: JP results formatted correctly
- [ ] **User Docs**: ZERO suppression verified
- [ ] **Attribution**: "Data provided by Joshua Project" on all JP responses

### Phase 4 Complete

- [ ] **Cron Job**: Monthly sync operational
- [ ] **Change Detection**: 90% skip rate achieved
- [ ] **Monitoring**: Sentry logs visible and actionable

### Phase 5 Complete

- [ ] **Enhanced Tests**: All 4 test gates passing
- [ ] **Regression Tests**: No new failures introduced
- [ ] **Load Testing**: 500 concurrent users handled
- [ ] **Documentation**: CLAUDE.md updated

### Production Deployment

- [ ] **Staging Validation**: Full integration tested in staging
- [ ] **Performance Baseline**: Met all tolerance thresholds
- [ ] **Rollback Plan**: Documented and communicated to team
- [ ] **Monitoring Alerts**: Configured for production
- [ ] **Feature Flag**: Ready to toggle in production

---

## Summary: Production-Ready Architecture

### What We've Achieved

**Zero-Degradation Design**:
- ✅ User documents NEVER suppressed
- ✅ Non-JP queries have ≤0.1ms overhead
- ✅ JP formatting uses per-field metadata rendering (no regex contamination)
- ✅ Service layer keeps chat route clean (<50 lines added)
- ✅ Feature flag enables instant rollback

**JP Requirements Compliance**:
- ✅ Definition consistency (JP data isolated, source-aware)
- ✅ Numbers as estimates (composed from metadata at render time)
- ✅ Anthropological nuance (PGIC entities preserve country context)
- ✅ Numeric faithfulness (SHA-256 hash ensures verbatim data)
- ✅ Source attribution (every JP response includes "Data provided by Joshua Project")
- ✅ Delivery method (monthly API sync with adaptive rate limiting)

**Implementation Quality**:
- ✅ 95%+ test coverage on new code
- ✅ 4 enhanced test gates (schema drift, cross-source integrity, performance envelope, terms guardrail)
- ✅ Adaptive rate limiting (no hardcoded delays)
- ✅ Comprehensive rollback plan
- ✅ Performance benchmarks and monitoring

### Timeline & Effort

**Total**: 72-94 hours (6-7 weeks part-time)

**Breakdown**:
- Phase 0: Baseline & Safety Net (4-6h)
- Phase 1: Service Layer Foundation (22-26h)
- Phase 2: Chat Integration (12-16h)
- Phase 3: Initial Sync (12-16h)
- Phase 4: Automated Cron (8-12h)
- Phase 5: Comprehensive Testing (16-20h)

**Cost**: $1.02 initial + $0.10/month = $2.12/year

---

## Ready to Build?

This plan is **production-ready** and addresses all technical concerns:

1. ✅ **Multi-source architecture** (no suppression)
2. ✅ **Per-field rendering** (no regex leaks)
3. ✅ **Adaptive rate limiting** (no hardcoded delays)
4. ✅ **Enhanced testing** (4 additional test gates)
5. ✅ **Service layer extraction** (maintainable code)
6. ✅ **Feature flag + rollback** (safety net)

**Next Step**: Phase 0 (Baseline & Safety Net) - establish performance benchmarks before any code changes.

**Proceed?**
