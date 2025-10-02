# Document Cleanup & GitHub Download System Implementation Plan

**Created**: October 1, 2025
**Status**: Ready for Execution
**Estimated Total Time**: 55-60 minutes for 450 documents

---

## Overview

Two-phase system to clean up document titles and provide GitHub-hosted download links:

1. **Phase 1**: Clean titles in Supabase + Pinecone (20-25 minutes)
2. **Phase 2**: Rename files, upload to GitHub, add download URLs (30-35 minutes)

---

## PHASE 1: Bulletproof Title Cleanup

### Objective
Rename 450+ documents from unprofessional names to clean titles:
- `5a Vision Casting...` → `Vision Casting...`
- `Chinese_2414_Book` → `Chinese 2414 Book`
- `_Part 1 - CPM` → `Part 1 - CPM`

### Prerequisites

**IMPORTANT**: Before running cleanup-titles.js, add the `old_title` column:

```sql
-- Run in Supabase SQL Editor:
ALTER TABLE documents ADD COLUMN IF NOT EXISTS old_title TEXT;
```

Or run: `scripts/add-old-title-column.sql`

### Script: `scripts/cleanup-titles.js`

### Execution Flow (Per Document)

```javascript
// 1. Fetch document from Supabase
const document = await supabase.from('documents').select('*').eq('id', docId).single()

// 2. Clean title with rules
function cleanTitle(title) {
  return title
    .replace(/^\d+[a-z]\s+/i, '')  // Remove "5a ", "12b "
    .replace(/^[_\s]+/, '')         // Remove leading underscores/spaces
    .replace(/_/g, ' ')             // Underscores → spaces
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .trim()
}

// 3. ATOMIC UPDATE (both systems together)
// SAVES OLD_TITLE IN DATABASE FOR PERMANENT RECOVERY
await supabase.from('documents').update({
  old_title: document.title,  // Save original (database-level backup)
  title: cleaned              // Update to clean version
}).eq('id', docId)

await pinecone.update({ filter: { documentId: docId }, metadata: { documentTitle: cleaned } })

// 4. Wait for Pinecone consistency (2 seconds)
await sleep(2000)

// 5. Verify update succeeded
const verification = await verifyUpdate(docId, cleaned)

// 6. Retry on failure (3 attempts)
if (!verification.success) {
  await retryUpdate(docId, cleaned)
}

// 7. Rate limit delay (150ms)
await sleep(150)
```

### Three Operating Modes

```bash
# Mode 1: Preview only (NO CHANGES)
node scripts/cleanup-titles.js --dry-run
# Output: "Would rename: '5a Vision Casting...' → 'Vision Casting...'"

# Mode 2: Verify current integrity
node scripts/cleanup-titles.js --verify
# Checks: Supabase ↔ Pinecone ↔ Chunks consistency

# Mode 3: Execute with full verification
node scripts/cleanup-titles.js
# Creates backup → Updates → Verifies → Reports
```

### Safety Features

#### 1. Database-Level Backup (old_title Column)
**NEW SAFETY FEATURE**: Original titles saved directly in database

```sql
-- Before cleanup: old_title is NULL
SELECT id, title, old_title FROM documents LIMIT 1;
-- id | title                        | old_title
-- .. | 5a Vision Casting...         | NULL

-- After cleanup: old_title preserves original
-- id | title                        | old_title
-- .. | Vision Casting...            | 5a Vision Casting...
```

**Benefits**:
- ✅ Permanent backup in database (survives file system changes)
- ✅ Queryable audit trail: `SELECT old_title, title FROM documents WHERE old_title IS NOT NULL`
- ✅ Simple rollback: `UPDATE documents SET title = old_title WHERE old_title IS NOT NULL`
- ✅ No dependency on JSON backup files

#### 2. Automatic JSON Backup (Before Any Changes)
```json
{
  "timestamp": "2025-10-01T10:30:00.000Z",
  "documentCount": 450,
  "documents": [
    {
      "id": "uuid-123",
      "oldTitle": "5a Vision Casting and Strategy",
      "newTitle": "Vision Casting and Strategy",
      "storage_path": "documents/5a-vision-casting.pdf"
    }
  ]
}
```
Saved to: `./backups/title-cleanup-TIMESTAMP.json`

#### 3. Verification After Each Update
- ✅ Supabase title matches
- ✅ Pinecone metadata matches
- ✅ Chunk relationships intact (UUID check)
- ✅ Vector count unchanged

#### 4. Automatic Retry Logic
- 3 attempts per document
- Exponential backoff (2s, 4s, 8s)
- Separate retry for Supabase vs Pinecone failures
- Detailed error logging

#### 5. Rate Limit Protection
- 150ms delay between documents
- 2000ms Pinecone consistency wait
- Prevents API throttling
- Respects service limits

#### 6. Graceful Failure Handling
- Continues on individual failures
- Logs failed documents to `./backups/failed-updates.json`
- Can retry failed documents separately
- No cascade failures

### Architecture Safety Analysis

#### What Cannot Break (UUID-Based Relationships)

```
documents.id (UUID) ←─── chunks.document_id (UUID)
                    ←─── Pinecone metadata.documentId (UUID)

Vector Search: Uses embeddings (1024-dim vectors), NOT titles
Foreign Keys: All use UUIDs, never titles
Chat Routing: chunk_id → content lookup (UUID-based)
```

**Core functionality is 100% safe because:**
- UUIDs never change during title updates
- Vector embeddings never change
- Database foreign keys use UUIDs
- Search uses semantic similarity, not titles

#### What COULD Break (Title-Based Metadata Lookup)

**Location**: `src/app/api/chat/route.ts:500-528`

```typescript
// Gets titles from Pinecone metadata
const uniqueDocumentTitles = [...new Set(relevantChunks.map(chunk => chunk.documentTitle))]

// Queries Supabase by title - THIS IS THE CRITICAL DEPENDENCY
const documentsWithMetadata = await supabaseAdmin
  .from('documents')
  .select('title, author, amazon_url, resource_url, download_enabled, contact_person, contact_email')
  .in('title', uniqueDocumentTitles)

// Matches by title
const metadata = documentsWithMetadata?.find(doc => doc.title === chunk.documentTitle)
```

**Impact of Title Mismatch:**
- ✅ Search still works (uses embeddings)
- ✅ AI response still works (uses chunk content)
- ✅ Sources list still works (shows document titles)
- ⚠️ Metadata buttons missing (amazon_url, resource_url, contact info)

**Duration of Mismatch:**
- Atomic update minimizes window to < 500ms per document
- Pinecone consistency usually < 2-5 seconds
- Self-healing (new title works once Pinecone updates)

**Worst Case Scenario:**
- User searches during 2-second update window
- Pinecone has old title, Supabase has new title
- Result: Source appears without metadata buttons
- Severity: Minor UI glitch, not a breaking error

### Timeline

```
Per Document:
- Supabase update: 50-100ms
- Pinecone update: 200-500ms
- Consistency wait: 2000ms (fixed)
- Verification: 200-300ms
- Rate limit delay: 150ms (fixed)
Total: ~2.75-3.35 seconds per document

For 450 Documents:
- Estimated: 20-25 minutes
- During low traffic: Recommended
- During peak hours: Still safe, minor UI glitches possible
```

### Execution Checklist

- [ ] **Add old_title column**: Run `scripts/add-old-title-column.sql` in Supabase SQL Editor
- [ ] Review backup location: `./backups/`
- [ ] Run `--dry-run` to preview changes
- [ ] Run `--verify` to check current integrity
- [ ] Schedule during low-traffic hours (optional)
- [ ] Execute main script
- [ ] Review logs for any failures
- [ ] Run `--verify` again to confirm
- [ ] Verify old_title column populated: `SELECT old_title, title FROM documents WHERE old_title IS NOT NULL LIMIT 5`
- [ ] Keep backup files for 30 days

---

## PHASE 2: GitHub Download URLs

### Objective
Provide downloadable files for all documents via GitHub-hosted URLs

### Prerequisites
- Phase 1 completed (titles cleaned in database)
- GitHub account with public repository created
- Repository name: `patmosllm-documents` (or similar)

### Step 2a: Download & Rename Files

**Script**: `scripts/prepare-github-files.js`

**Process:**
1. Fetch all documents from Supabase (id, title, storage_path, mime_type)
2. Download file from Supabase Storage using storage_path
3. Generate filesystem-safe filename from cleaned title:
   ```javascript
   function sanitizeFilename(title, mimeType) {
     const ext = getExtension(mimeType) || 'pdf'
     return title
       .toLowerCase()
       .replace(/[^a-z0-9]+/g, '-')  // Special chars → hyphens
       .replace(/^-+|-+$/g, '')      // Trim hyphens
       + '.' + ext
   }
   // "Vision Casting and Strategy" → "vision-casting-and-strategy.pdf"
   ```
4. Save to `./github-files/` directory
5. Create mapping JSON:
   ```json
   {
     "documents": [
       {
         "id": "uuid-123",
         "title": "Vision Casting and Strategy",
         "oldPath": "documents/5a-vision-casting.pdf",
         "newFilename": "vision-casting-and-strategy.pdf",
         "mimeType": "application/pdf"
       }
     ]
   }
   ```
   Saved to: `./github-files/file-mapping.json`

**Modes:**
```bash
# Preview only
node scripts/prepare-github-files.js --dry-run

# Execute
node scripts/prepare-github-files.js
```

**Timeline**: ~15 minutes for 450 documents

### Step 2b: Upload to GitHub

**Manual Process** (one-time):

```bash
# 1. Create public repository on GitHub
#    Name: patmosllm-documents
#    Visibility: Public

# 2. Clone and upload
cd github-files
git init
git add .
git commit -m "Initial upload: 450 documents with cleaned filenames"
git branch -M main
git remote add origin https://github.com/USERNAME/patmosllm-documents.git
git push -u origin main

# 3. Test URL format
# https://raw.githubusercontent.com/USERNAME/patmosllm-documents/main/vision-casting-and-strategy.pdf
```

**Alternative**: Use GitHub's web interface to upload files (drag & drop)

**Timeline**: ~10 minutes for upload and verification

### Step 2c: Populate Download URLs

**Script**: `scripts/populate-download-urls.js`

**Process:**
1. Read `./github-files/file-mapping.json`
2. Get GitHub repository info from user:
   ```javascript
   const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'your-username'
   const GITHUB_REPO = process.env.GITHUB_REPO || 'patmosllm-documents'
   const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'
   ```
3. For each document:
   ```javascript
   const url = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filename}`

   // Verify URL is accessible
   const response = await fetch(url, { method: 'HEAD' })
   if (!response.ok) throw new Error(`URL not accessible: ${url}`)

   // Update database
   await supabase.from('documents')
     .update({
       resource_url: url,
       download_enabled: true
     })
     .eq('id', documentId)
   ```
4. Verification after each update
5. Rate limiting (100ms delay)

**Modes:**
```bash
# Preview only
GITHUB_USERNAME=yourname node scripts/populate-download-urls.js --dry-run

# Verify URLs only (no database updates)
GITHUB_USERNAME=yourname node scripts/populate-download-urls.js --verify-urls

# Execute
GITHUB_USERNAME=yourname node scripts/populate-download-urls.js
```

**Timeline**: ~10 minutes for 450 documents

### Step 2d: UI Verification

**Existing UI Code** (already implemented in `src/app/chat/page.tsx:1126-1143`):

```typescript
{source.resource_url && source.download_enabled && (
  <a
    href={ensureHttps(source.resource_url)}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium rounded-lg no-underline transition-all duration-200 bg-gradient-to-r from-green-400/20 to-green-400/10 text-green-600 border border-green-400/30 hover:scale-105 min-h-[44px]"
  >
    <Download className="w-3 h-3" />
    Download
  </a>
)}
```

**Verification Steps:**
1. Ask a question that retrieves documents
2. Verify download buttons appear in sources
3. Click 5-10 random download buttons
4. Verify files download correctly
5. Check browser console for any errors

**Timeline**: ~5 minutes

---

## Recovery Procedures

### If Phase 1 Fails Mid-Run

**Symptoms:**
- Script crashes or stops
- Some documents updated, some not
- Inconsistent titles across documents

**Recovery:**
```bash
# 1. Check logs for failed documents
cat ./backups/failed-updates.json

# 2. Verify current state
node scripts/cleanup-titles.js --verify

# 3. Re-run script (only updates remaining documents)
node scripts/cleanup-titles.js

# 4. Restore from backup if needed (last resort)
node scripts/restore-titles.js ./backups/title-cleanup-TIMESTAMP.json
```

### If Phase 2 File Preparation Fails

**Symptoms:**
- Downloads fail
- Mapping JSON incomplete
- Files missing in ./github-files/

**Recovery:**
```bash
# 1. Check mapping for missing documents
node scripts/verify-file-mapping.js

# 2. Re-download missing files only
node scripts/prepare-github-files.js --resume

# 3. Clean and restart if needed
rm -rf ./github-files
node scripts/prepare-github-files.js
```

### If Phase 2 URL Population Fails

**Symptoms:**
- Some documents have download URLs, some don't
- 404 errors on download buttons
- Database inconsistency

**Recovery:**
```bash
# 1. Verify which URLs are broken
node scripts/populate-download-urls.js --verify-urls

# 2. Check GitHub files exist
# Visit: https://github.com/USERNAME/patmosllm-documents

# 3. Re-run for failed documents only
node scripts/populate-download-urls.js --resume

# 4. Clear all URLs and restart if needed
node scripts/clear-download-urls.js
node scripts/populate-download-urls.js
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] All 450 documents have cleaned titles
- [ ] Supabase titles match Pinecone metadata
- [ ] All chunks still linked (verified via --verify)
- [ ] Backup file exists in ./backups/
- [ ] No failed documents in logs
- [ ] Chat functionality works with new titles

### Phase 2 Complete When:
- [ ] All 450 files renamed in ./github-files/
- [ ] file-mapping.json contains all documents
- [ ] GitHub repository contains all files
- [ ] All documents have resource_url populated
- [ ] All documents have download_enabled = true
- [ ] Download buttons appear in chat sources
- [ ] Random sample downloads work correctly
- [ ] No 404 errors in browser console

---

## Risk Assessment

### High Confidence (Cannot Break)
- ✅ Vector search (uses embeddings)
- ✅ Chunk relationships (UUID-based)
- ✅ Database integrity (foreign keys)
- ✅ User data (no deletions)

### Medium Confidence (Temporary Issues)
- ⚠️ Metadata buttons during update window (2-5 seconds)
- ⚠️ GitHub rate limits (can add delays)
- ⚠️ Network failures (retry logic handles)

### Low Confidence (Requires Attention)
- ⚠️ File naming conflicts (sanitization should prevent)
- ⚠️ GitHub upload size limits (should check repo size)
- ⚠️ Supabase Storage access (existing infrastructure)

---

## Rollback Plan

### Phase 1 Rollback

**Option 1: Database-Level Rollback (Fastest & Easiest)**
```sql
-- Restore all titles from old_title column
UPDATE documents
SET title = old_title
WHERE old_title IS NOT NULL;

-- Update Pinecone metadata (requires running script)
-- Script will automatically sync Pinecone with restored titles
```
Timeline: ~30 seconds for SQL + ~5 minutes for Pinecone sync

**Option 2: JSON Backup Rollback**
```bash
# Restore titles from backup file
node scripts/restore-titles.js ./backups/title-cleanup-TIMESTAMP.json

# Timeline: ~5 minutes
```

### Phase 2 Rollback
```bash
# Clear download URLs from database
node scripts/clear-download-urls.js

# Remove GitHub repository (manual)
# Delete ./github-files/ directory
rm -rf ./github-files

# Timeline: ~2 minutes
```

---

## Post-Implementation Maintenance

### Ongoing Tasks
- New document uploads should include download URLs from the start
- Monitor GitHub repository size (stay under 1GB recommended)
- Periodic verification of download URLs (monthly)
- Update file-mapping.json when adding new documents

### Future Enhancements
- Auto-generate download URLs on document upload
- CDN caching for faster downloads
- Analytics tracking for popular documents
- Alternative storage options (S3, Cloudflare R2)

---

## Contact & Support

If anything goes wrong:
1. Check logs in `./backups/` directory
2. Run verification scripts
3. Restore from backup if needed
4. All scripts are idempotent (safe to re-run)

**Remember**: Core functionality (search, chat, AI responses) cannot break. Only metadata buttons are affected during updates, and they self-heal within seconds.
