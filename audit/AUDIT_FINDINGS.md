# MultiplyTools / patmosllm — Architecture & Code-Quality Audit

**Date:** 2026-06-17 · **Mode:** read-only static analysis (no source changed, no live services touched)
**Method:** 10 parallel domain subagents → lead synthesis. Every finding cites `path:line` that was actually read.

---

## Executive Summary (one page)

**Current health read: 7.5/10 is fair, and better than the docs claim.** The codebase is in materially better shape than `CLAUDE.md` states — the chat-route refactor is *done* (`chat/route.ts` is **599 lines**, not 1,276; `src/services/chatService.ts` exists), the test suite has **0 failing tests** (not 18), `any` hygiene is **excellent** (3 explicit, all eslint-disabled at library boundaries), server-side `console.log` migration is **complete** (0 ad-hoc in `lib`/`api`), and there are **no unsafe build-bypass flags**. The real debt is concentrated and addressable: missing input validation, duplicated auth/fetch boilerplate, observability that silently drops errors, and a pile of dead code + repo bloat.

### Top 10 issues by impact

| # | ID(s) | Issue | Sev | Why it matters |
|---|-------|-------|-----|----------------|
| 1 | **log-1** | `logError()` never forwards to Sentry; ~79 consumers + 131 API catch blocks log to console only | High | Production server errors are effectively invisible. **One-file fix** covers all call sites. |
| 2 | **api-1 / types-1** | Zod request-body validation in **0 of 60** routes, despite CLAUDE.md "Zod at every boundary" | Critical | `await request.json()` is `any`; unvalidated `role`/`email`/`sessionId` reach business logic. |
| 3 | **auth-2** | `documents/download/[documentId]` does authentication but **no object-level authorization** | High | Any logged-in user can download any document by enumerating IDs. (Verify intent — corpus may be shared-read.) |
| 4 | **auth-1** | RLS claimed in `schema.md` but never applied; all access via RLS-bypassing `supabaseAdmin` (34 importers) | High | Authz is app-layer only — no defense-in-depth. A forgotten `.eq()` filter = data exposure. Stop-and-plan. |
| 5 | **api-2 / auth-3 / svc-6** | Auth + role + rate-limit boilerplate copy-pasted across ~49 handlers; 57 inline role-array checks; `requireAuth` helper used 0× | Medium | ~350–700 LOC of duplication; one typo'd role array = privilege escalation. |
| 6 | **ai-4 / ai-3** | Advanced cache `maxMemoryMB:50` declared but **never enforced** (count-only eviction); `estimateMemoryUsage()` `JSON.stringify`s the whole cache on every `set()` | Medium | Memory-leak potential + hot-path CPU waste on every cache write. |
| 7 | **dead-8** | `github-files/` = **297 MB** of committed binary corpus (550 files), used only by ops scripts | High | Dominates repo size; not application code. |
| 8 | **ui-1 / ui-2** | `useChat`(280) + `useSessions`(152) hooks and `CleanChatInterface`(394) are **dead**; `chat/page.tsx` re-implements all of it inline | High | Two streaming implementations to maintain; ~826 LOC of dead/duplicated UI. |
| 9 | **ai-10** | Recursive `createEmbeddings` retry/split drops `userId`/`requestId` → Voyage cost untracked for any large (split) document | Medium | Donation/cost-transparency accounting is silently incomplete. |
| 10 | **test-2** | Upload integration suite takes **88s** on real `setTimeout` backoff (`route.ts:202,241`) | High | 99% of total test runtime; throttles the dev/CI feedback loop. |

### Single highest-leverage change
**Implement `log-1`** — adding `Sentry.captureException` inside `logError()` (≈3 lines, per `SENTRY_SETUP.md:103-138`) instantly gives Sentry coverage to ~210 call sites without touching any of them. Highest impact-to-effort ratio in the entire audit. (Pair with `log-5`, a server-side `beforeSend` PII scrubber, so it lands safely.)

### Framework/version quirks for STACK_LEARNINGS.md (not yet written)
- **ESLint 9 + Next 15.5:** flat `eslint.config.mjs` is authoritative; the legacy `.eslintrc.json` is silently ignored — and the two disagree (legacy enables `react-hooks/exhaustive-deps`, flat drops it). (dep-1)
- **`next lint` is deprecated** in Next 15.3+ (removed in 16); CI depends on it. (dep-7)
- **Tailwind v4** reads theme from CSS `@theme`, but a v3-style `tailwind.config.js` still coexists half-migrated. (dep-9)
- **`@types/cheerio@0.22`** mis-types cheerio 1.x (which ships its own types); hidden by `skipLibCheck`. (dep-4)
- **`@next/bundle-analyzer@16` on `next@15`** is a major-version mismatch. (dep-8)
- **Doc drift:** CLAUDE.md overstates debt — chat route 599 (not 1,276), 0 failing tests (not 18), 20 client console.* (not 36). Worth correcting so the roadmap targets real work. (test-1, log-4, dead-10)

---

## Domain 1 — API Routes

**ID: api-1 — Zero Zod validation despite CLAUDE.md mandate**
Location(s): all 34 body-parsing routes — `src/app/api/chat/route.ts:74`, `admin/invitations/route.ts:26`, `admin/invite/route.ts:27`, `upload/process-blob/route.ts:71`, `user/update-profile/route.ts:24`, `auth/login-supabase/route.ts:14`
Severity: high · Effort: L
Evidence: `grep -rl "from 'zod'" src/app/api` → 0 files. Handlers hand-roll `const { question, sessionId } = await _request.json()` then `if (!sanitizedQuestion || typeof … !== 'string')`. Role validation is a repeated literal array test.
Recommendation: per-route Zod schemas + shared `parseBody(schema, request)` → 400 on failure; map Zod errors to existing `{success:false,error}` shape. Keep `sanitizeInput`/`sanitizeEmail` running after parse.
Risk if touched: low logic risk; preserve exact error messages clients may match on.

**ID: api-2 — Duplicated auth + role + rate-limit boilerplate (~49 handlers)**
Location(s): `upload/blob/route.ts:32-57`, `upload/process-blob/route.ts:30-68`, `upload/process`, `upload/presigned`, `upload/processes`; `getCurrentUser` in 49 files; role-array guard in 19; `'Authentication required'` 401 block 38×
Severity: medium · Effort: M
Evidence: verbatim triple block (auth→role→rate-limit) recurs char-for-char between blob:32-57 and process-blob:30-68.
Recommendation: `withAuth(handler, {roles?, rateLimit?})` wrapper. ~500–700 LOC saved.
Risk if touched: auth/RLS — preserve order (rate-limit AFTER auth) and per-route role sets (they differ); wrong default = privilege escalation.

**ID: api-3 — Inconsistent response envelopes**
Location(s): `{success,...}` in 39 files; bare `{error}` in 29 (`auth/login-supabase/route.ts:80`, `scrape-website/route.ts:1275`, `question-assistant/route.ts:15`); chat uses raw `new Response(JSON.stringify(...))` (chat:45-48)
Severity: medium · Effort: M
Evidence: same auth failure is `{success:false,error}` in chat but `{error}` in question-assistant.
Recommendation: `ok(data)` / `err(message,status)` helpers; standardize on dominant `{success,...}` (additive — existing `{error}` consumers keep working).
Risk if touched: auth — login/signout responses drive client redirects; verify frontend doesn't switch on `success` absence.

**ID: api-4 — `cleanTextContent` copied into 4 routes** (also svc-4)
Location(s): `upload/blob/route.ts:16-27`, `upload/process-blob/route.ts:14-25`, `upload/process`, `scrape-website/save`
Severity: low · Effort: S
Evidence: identical null-byte/control-char/whitespace function defined 4×.
Recommendation: move to `src/lib/input-sanitizer.ts` (already imported by all four). ~44 LOC saved.
Risk if touched: data integrity — keep regex byte-identical (runs before DB insert).

**ID: api-5 — `upload/blob` and `upload/process-blob` are near-duplicate handlers (~450 LOC dup)**
Location(s): `upload/blob/route.ts` (474) vs `upload/process-blob/route.ts` (402)
Severity: medium · Effort: L
Evidence: shared auth/role/rate-limit, `cleanTextContent`, metadata extraction, doc-record assembly, `processDocumentVectors`+milestone+cache-invalidation tail (blob:404-443). Only source-acquisition differs.
Recommendation: extract `persistAndIngestDocument({...})` (see svc-5). ~250–300 LOC saved.
Risk if touched: RLS/search — preserve `uploaded_by:user.id` and insert-before-vectorize ordering or vectors orphan.

**ID: api-6 — `scrape-website` POST = 148-line dispatcher in a 1,416-line file with module-level mutable state**
Location(s): `scrape-website/route.ts:1268-1415`; BrowserPool `:16-63`; `_sitemapCache` `:81`; dead commented block `:65-78`
Severity: high · Effort: L
Evidence: single POST switches on `action==='discover'|'scrape'`; module-level `browserPool` singleton mutated across requests (unsafe under serverless concurrency); unused `_sitemapCache`.
Recommendation: split into `src/lib/scraper/{discovery,pageScraper,browserPool}.ts`; route delegates. Delete dead block + unused cache. (Stop-and-plan: large.)
Risk if touched: search/ingest — keep discover/scrape JSON output shapes identical (`:1339-1356`, `:1397-1400`).

**ID: api-7 — Error-detail exposure surface**
Location(s): `scrape-website/route.ts:1413` (`details:''` placeholder), `admin/invitations/route.ts:236-239` (parses provider error string into user text)
Severity: low · Effort: S
Recommendation: drop unused `details`; centralize rate-limit detection in email lib instead of string-matching.

**ID: api-8 — Bespoke DB rate-limiter in privacy/export instead of shared limiter**
Location(s): `privacy/export/route.ts:83-121` (`checkExportRateLimit`, fails open at :119)
Severity: low · Effort: M
Recommendation: keep (durable cross-instance hourly cap via audit table) but document the fail-open GDPR posture, or migrate to Upstash with a `privacy_export` tier.
Risk if touched: GDPR — loosening is low-risk, tightening could deny a legitimate Article 20 export.

**ID: api-9 — Inconsistent logger `operation` taxonomy (40+ ad-hoc strings)**
Location(s): `'API admin/invitations'` (invitations:317) vs `'POST /api/scrape-website'` (scrape:1407) vs `'API chat'` (chat:590)
Severity: low · Effort: S
Recommendation: derive `operation` from `method + pathname` inside the `withAuth` wrapper (api-2).

---

## Domain 2 — Service / Data Layer

**ID: svc-1 — Dead duplicate query helpers in `supabase.ts` (also subtly buggy)**
Location(s): `src/lib/supabase.ts:96-159` (`validateChatSession`, `fetchConversationHistory`, `insertConversation`, `updateSessionTimestamp`)
Severity: medium · Effort: S
Evidence: zero call sites outside the file; functional duplicates of `chatService` versions, but **missing the `.is('deleted_at', null)` filter** the live versions have.
Recommendation: delete (~64 LOC). Zero behavioral risk (unreferenced).

**ID: svc-2 — Entire `src/lib/auth-helpers.ts` is dead code**
Location(s): `src/lib/auth-helpers.ts:1-91` (`getAuthUserId`, `getAuthUserEmail`, `getAuthUser`, `requireAuth`)
Severity: medium · Effort: S
Evidence: `grep auth-helpers` across `src/` → no imports; app uses `getCurrentUser()` from `auth.ts:9`.
Recommendation: delete the file (91 LOC). Zero importers.

**ID: svc-3 — `createServerClient` cookie-bridge boilerplate ×3**
Location(s): `auth.ts:11-24`, `auth-helpers.ts:17-29` & `:43-55`
Severity: low · Effort: S
Recommendation: after svc-2, extract one `createServerAuthClient()`. ~20 LOC.
Risk: auth path — preserve read-only no-op set/remove.

**ID: svc-4 — `cleanTextContent` duplicated** — see api-4.

**ID: svc-5 — No `DocumentRepository`; insert + pg-error-code mapping duplicated across 4 routes**
Location(s): inserts at `upload/process/route.ts:229-263`, `upload/process-blob/route.ts:305`, `upload/blob/route.ts:373`, `scrape-website/save`; error mapping `process/route.ts:239` (22P05/23505/23502)
Severity: high · Effort: M
Evidence: `documents` table = 22 query sites; identical `documentRecord` build + `.insert().select().single()` + error mapping.
Recommendation: `src/services/documentRepository.ts` — `insertDocument()`, `mapDocumentInsertError()`, `findExistingDocumentByPath()`. ~60–80 LOC saved.
Risk if touched: preserve exact error messages + `download_enabled` default (`:218` → true).

**ID: svc-6 — No `UserRepository`; `users` queried at 38 sites with divergent duplicate-email guards**
Location(s): 38 `.from('users')` sites incl. `auth.ts:35`, `middleware.ts:115`; two email checks: `admin/invitations/route.ts:45-49` (`.single()`) vs `invitation-service.ts:55-59` (`.maybeSingle()`)
Severity: high · Effort: M
Recommendation: `userRepository.ts` — `getUserByAuthId()`, `findUserByEmail()` (standardize on `maybeSingle`), `updateUserProfile()`. ~40–50 LOC.
Risk if touched: medium-high — `getUserByAuthId` on auth hot path; `.single()` vs `.maybeSingle()` semantics differ.

**ID: svc-7 — Two parallel invitation systems — INVESTIGATED 2026-06-17 (surfaced a live bug)**
Location(s): `admin/invitations/route.ts:163` (→ `invitation_tokens`, token from `@/lib/email`) vs `invitation-service.ts:44,70,121` (→ `users.invitation_token` + `user_sent_invitations_log`, *locally redefined* `generateInvitationToken`)
Severity: high · Effort: L
**Ground truth (investigation):**
- **Admin path = `invitation_tokens`, fully wired end-to-end** and live: create (`admin/users/page.tsx:300` → `POST /api/admin/invitations`), list/resend/delete, accept (`auth/accept-invitation/route.ts:43-46`), validate (`invite/[token]/validate/route.ts:26-39`).
- **User self-invite path = `users` table**, live from `settings/invitations/page.tsx` → `/api/user/invitations` (the only importer of `invitation-service.ts`).
- **🔴 CRITICAL split-brain bug:** user self-invites write the token ONLY to `users.invitation_token` (+ `user_sent_invitations_log`), but the accept (`auth/accept-invitation/route.ts:43-46`) and validate (`invite/[token]/validate/route.ts:26-39`) endpoints read ONLY from `invitation_tokens`. So a **user-generated invite link (`/invite/{token}/accept`, built at `settings/invitations/page.tsx:122`) cannot be redeemed** — it fails with "Invalid invitation token." The two systems share no storage.
- **Dead-but-dangerous:** `POST /api/admin/invite` (`invite/route.ts:62-78`, writes `users.invitation_token`) and `POST /api/admin/invite/resend` and `GET /api/invite/[token]` are functional HTTP endpoints with no UI caller; if ever hit they'd mint invites the accept flow can't redeem.
Recommendation: **stop-and-plan** (touches invite/accept flow; possibly schema). Likely fix: have `invitation-service.createInvitation` write to the canonical `invitation_tokens` store (keeping the quota log), so accept/validate work unchanged. Quick safe win regardless: dedupe the two `generateInvitationToken` definitions. **Verify first** whether the user self-invite feature is exposed to real users (if so, this is a production bug, not just debt).
Risk if touched: high — invite/accept is the new-user on-ramp; a wrong move locks people out. Verify which entry points are user-reachable before changing.

**ID: svc-8 — Orphaned-auth-user cleanup duplicated ×3 (O(all users) each)**
Location(s): `admin/invitations/route.ts:128-144` & `:466-472`, `auth/accept-invitation/route.ts`
Severity: medium · Effort: S
Recommendation: add to userRepository: `findAuthUserByEmail()`, `deleteOrphanedAuthUser()`. ~30 LOC. Preserve the `!last_sign_in_at` guard. (See also auth-8 — paginated `listUsers` is a correctness bug at scale.)

**ID: svc-9 — Streaming/SSE logic still inline in chat route, not a `StreamingService`**
Location(s): `chat/route.ts:133-159, 260-285, 411-579`; SSE enqueue pattern ~9×
Severity: low · Effort: M
Recommendation: `StreamingService.sseEvent(type,payload)` + stream builders; seed `ConversationRepository` from `chatService.ts:138,162,479,503`. ~25–30 LOC in route.
Risk if touched: SSE wire format (`sources`/`chunk`/`complete`/`document`/`error`) must be byte-preserved for client.

**ID: svc-10 — chat route still owns repeated non-answer save+memory+respond branches**
Location(s): `chat/route.ts:290-311, 332-341, 352-361` (3 near-identical branches)
Severity: low · Effort: M
Recommendation: `chatService.handleNonAnswer(...)` collapsing the three. ~30 LOC. (Confirms CLAUDE.md "1,276 lines" is stale — actual 599.)

---

## Domain 3 — Search & AI Pipeline

> **Hard-rule status: COMPLIANT in the default path.** 70/30 weighting correctly applied (`hybrid-search.ts:35,219,230,235`); `voyage-3-large` @ 1024 dims confirmed (`openai.ts:166`, `pinecone.ts:208,255`). **Flag (ai-11):** `intelligentSearch` (`hybrid-search.ts:400-419`, the live path) overrides weights by intent — conceptual 0.8/0.2, comparative 0.6/0.4 — deviating from a strict 70/30 reading. Left untouched per hard rules; flagged for awareness.

**ID: ai-1 — Double cache-key encoding (`userId` folded in twice)**
Location(s): `hybrid-search.ts:175-187, 299-313`; `advanced-cache.ts:55-66`
Severity: medium · Effort: S
Recommendation: drop redundant `{userId: opts.userId}` 3rd arg at both sites (key already contains `user:${userId}`).
Risk: changes literal key string → one-time cold cache on deploy.

**ID: ai-2 — `JSON.stringify` cache keys still used for all non-search namespaces (util is search-only)**
Location(s): `advanced-cache.ts:62`
Severity: medium · Effort: M
Evidence: roadmap item is half-done — `cache-key.ts` (xxHash) used only by hybrid-search; everything else keys via `JSON.stringify` in `generateKey`. Ordering now stable via `.sort()`, but per-value stringify remains.
Recommendation: document as search-only / partially complete; don't change other namespaces' hashing without a cold-cache migration note.

**ID: ai-3 — `estimateMemoryUsage()` JSON.stringifies the entire cache on every `set()`**
Location(s): `advanced-cache.ts:202-211`, called from `updateStats()` `:192-195` ← `set()` `:87`
Severity: medium · Effort: S
Recommendation: compute lazily in `getStats()` only; in `set()` just set `totalEntries=this.cache.size`. Identical stats output, removes per-write full-cache serialization.
Risk: very low (`memoryUsage` already consumed only via `getStats`).

**ID: ai-4 — `maxMemoryMB:50` declared but never enforced (count-only eviction)**
Location(s): `advanced-cache.ts:39` config, `:73-76` set, `:156-171` evictLRU
Severity: medium · Effort: M
Evidence: only trigger is `cache.size >= maxEntries` (1000); `maxMemoryMB` never compared. 1000 SearchResult[] entries can far exceed 50MB.
Recommendation: either document as advisory, or (after ai-3) evict while `estimateMemoryUsage() > maxMemoryMB`. **Changing eviction is a behavior change → measure first (could regress the 67x hit-rate).** Stop-and-plan if altering policy.

**ID: ai-5 — `evictLRU()` O(n) full scan per insert at capacity**
Location(s): `advanced-cache.ts:156-171`
Severity: low · Effort: M
Recommendation: low priority (Map of 1000 is cheap); leave unless profiled hot.

**ID: ai-6 — Double Pinecone batching**
Location(s): `ingest.ts:187-203` (batches 100) calls `storeChunks` which **also** batches 100 (`pinecone.ts:48-64`)
Severity: low · Effort: S
Recommendation: replace the ingest loop with a single `await storeChunks(pineconeChunks)`. ~15 LOC, identical upserts. (Note typo `pineconeeBatchSize`.)

**ID: ai-7 — Dead methods in `intelligent-clarification.ts`**
Location(s): `:693-707` (`generateNaturalClarificationMessage`, never called), `:983-1013` (`generateContextualSuggestions`, zero callers)
Severity: low · Effort: S
Recommendation: delete (~45 LOC). Live path uses `generateConversationalClarification`.

**ID: ai-8 — Over-engineering in `intelligent-clarification.ts` (1,396 LOC)**
Location(s): `:330-417` (~90 LOC hardcoded religious-domain keyword map); `content_diversity` disabled at `:815-825` yet `analyzeDocumentDiversity` (`:195-237`) still runs every request
Severity: low (design) · Effort: M
Recommendation: extract keyword map to `clarification-patterns.ts` (~90 LOC out); consider early-return for disabled analyzers. **Stop-and-plan** — on chat critical path; can shift `confidence` values (`route.ts:332` gate).

**ID: ai-9 — `chunkText` token estimate (chars/4) diverges from multilingual `estimateTokenCount`**
Location(s): `fileProcessors.ts:526,533,551` vs `openai.ts:547-561`
Severity: low · Effort: S
Evidence: stored `token_count` (chunks table + Pinecone meta) uses naive chars/4; off ~40–65% for Arabic/CJK.
Recommendation: optionally use `estimateTokenCount` for the *stored* value only. **Do NOT change chunk boundaries** — that forces full re-ingest/re-embed (hard stop-and-plan).

**ID: ai-10 — Recursive `createEmbeddings` drops `userId`/`requestId` → untracked Voyage cost**
Location(s): `openai.ts:258, 344, 363, 382, 400`
Severity: medium · Effort: S
Evidence: split/retry recursion calls `createEmbeddings(batch, retryCount)` without `userId`/`requestId`; `trackUsage` (`:285`) is in the non-split branch only → all cost for large (always-split) docs is untracked.
Recommendation: thread `userId, requestId` through the 5 recursive sites. No change to embedding output.

**ID: ai-12 — `pMap` concurrency control is a no-op**
Location(s): `utils/performance.ts:96-126` (`findIndex(exec => exec === exec)` always 0)
Severity: low · Effort: S
Recommendation: verify callers repo-wide; if unused, delete; if used, replace with correct slot-based impl.

---

## Domain 4 — Auth / RLS / Middleware

**ID: auth-1 — RLS not the enforcement boundary; all access via RLS-bypassing service-role client**
Location(s): `supabase.ts:49-62` (`supabaseAdmin`, 34 importers); RLS policy SQL exists only in plan docs (`user_invitation_plan.md:349`, `Plans/migrations/README.md:219`), never applied
Severity: high (architectural) · Effort: L (stop-and-plan)
Evidence: CLAUDE.md/`schema.md:3` claim "RLS on every user-data table"; `grep "create policy|enable row level security"` finds none applied. Authz is app-layer only.
Recommendation: **REPORT only.** Document the real posture; inventory every `supabaseAdmin` query for a matching ownership/role filter. Do NOT enable RLS without auditing all 34 service-role sites.
Risk if touched: enabling RLS blindly breaks service-role flows or gives false confidence.

**ID: auth-2 — Document download has no object-level authorization** — **RESOLVED BY DESIGN (2026-06-17)**
Location(s): `documents/download/[documentId]/route.ts:21-64`
Severity: ~~high~~ → informational · Effort: S (doc only)
Evidence: only `if (!user) 401`; fetches doc by ID via `supabaseAdmin` (`:40-44`), mints signed URL (`:62-64`) with no role/ownership check.
**Decision:** the document corpus is **intentionally shared-read** — any authenticated user must be able to download a cited library resource immediately. Current behavior is correct; **do not add an ownership filter.** Action: add a code comment + doc note. **Becomes a hard constraint on auth-1:** the future `documents` RLS policy must permit read/download for all authenticated users.

**ID: auth-3 — 57 inline role-array checks, 49 `getCurrentUser()` sites, `requireAuth` used 0×**
Location(s): `ingest/route.ts:19,83`; `admin/users/[userId]/route.ts:21-57`; `admin/documents/route.ts:18,65`; `upload/presigned/route.ts:21`; … ; helper at `auth-helpers.ts:82` (unused)
Severity: medium · Effort: M
Recommendation: single `withAuth(handler,{roles})` guard (see Components doc). ~310–360 net LOC; one auditable place for role logic.
Risk if touched: status codes differ across routes (401/403/404; `useAdminAuth.ts:46` depends on 404) — apply route-by-route, preserve each response shape.

**ID: auth-4 — Per-call client re-creation; no request-level auth memoization**
Location(s): `auth.ts:9-56`, `auth-helpers.ts:15-60`, `get-identifier.ts:33-51`, `auth/session-check/route.ts:17-34` (5 duplicate cookie-adapter blocks); `getAuthUser` does 2 round-trips
Severity: low · Effort: M
Recommendation: one `createAnonServerClient()` factory; single `getUser()` returning id+email; optional request-scoped `cache()`.
Risk if touched: `cache()` must be request-scoped, not module-scoped (would leak auth across users).

**ID: auth-5 — Deletion-grace gating uses mutable per-instance in-memory cache + hand-maintained allowlist**
Location(s): `middleware.ts:15` (`deletionCache` Map), `:107-124` (5-min TTL), `:130-139` (allowlist)
Severity: medium · Effort: S
Evidence: cancel-deletion doesn't invalidate the Map → up to 5-min stale lockout/un-gating; per-instance inconsistency; allowlist drifts by hand.
Recommendation: invalidate on cancel/schedule or lower TTL; document the window. Don't drop the cache (it spares a DB query on every matched request).

**ID: auth-6 — `getCurrentUser()` `select('*')` over-fetches; DB error → null → 401 (infra failure looks like logout)**
Location(s): `auth.ts:34-42`
Severity: low · Effort: S
Recommendation: narrow select to needed columns (audit consumers reading `deleted_at` first); distinguish auth-failure from infra-failure.

**ID: auth-7 — `/api/auth/session-check` ungated; leaks cookie/session diagnostics**
Location(s): `auth/session-check/route.ts:14-97` (returns id, email, token expiry, `sb-*` cookie names/lengths `:82-94`); not in `protectedRoutes` (`middleware.ts:18-28`)
Severity: low · Effort: S
Recommendation: gate behind non-prod/admin; remove cookie-name enumeration.

**ID: auth-8 — `accept-invitation` lists ALL auth users to find one by email (paginated → correctness bug at scale)**
Location(s): `auth/accept-invitation/route.ts:85-88`
Severity: low · Effort: S
Evidence: `listUsers()` defaults to ~50/page; a user on page 2+ is treated as nonexistent → duplicate-create attempt (`:128`) fails on unique constraint.
Recommendation: use a direct email lookup or paginate. (Overlaps svc-8.)

---

## Domain 5 — React Components / Pages / Hooks

**ID: ui-1 — `useChat`(280) + `useSessions`(152) hooks are dead; `chat/page.tsx` re-implements them inline**
Location(s): `hooks/useChat.ts:25`, `hooks/useSessions.ts:20` (zero importers) vs `chat/page.tsx:77-357`
Severity: high · Effort: M
Evidence: `loadSessions`/`loadSession`/streaming `handleSubmit` (`page.tsx:200-357`, 157 lines) duplicate the hooks; the hook version is *better* (rAF batching + AbortController ref).
Recommendation: wire the page to the hooks (preferred) or delete them. ~250 LOC out of the 731-line page.
Risk if touched: message shape diverged (`role:'user'` vs `type:'user'`+id+timestamp) — reconcile before swapping or rendering breaks.

**ID: ui-2 — `CleanChatInterface.tsx` (394 LOC) is dead**
Location(s): `components/CleanChatInterface.tsx` (only self-reference)
Severity: medium · Effort: S
Recommendation: delete (likely the original consumer of the ui-1 hooks).

**ID: ui-3 — fetch+`data.success`+`logError`+`setError` boilerplate ~30× across admin/settings**
Location(s): `admin/users/page.tsx:141-149`, `admin/uploaded-documents`, `scraped-webpages`, `invitation-quotas`; settings `profile:53-88`, `email-preferences:40-67`, `delete-account:41-71`
Severity: high · Effort: M
Recommendation: `useApiResource<T>(url,opts)` + `useApiMutation`. Each `loadX` 25→3 lines; ~250–350 LOC.
Risk if touched: bespoke callers (users merges two endpoints `:106`; uploaded-documents pagination `:80`) need a generic-enough signature.

**ID: ui-4 — `admin/users/page.tsx` re-implements sort/header/modal/badge that already exist as shared `admin/*` components**
Location(s): `admin/users/page.tsx:430-489, 727-1005, 1008-1142` (local `SortIcon`, 5 inline `<th>`, 88 inline styles, raw modal) vs `components/admin/{SortableTableHeader,StatusBadge,DeleteConfirmationModal}`
Severity: high · Effort: M
Recommendation: adopt the existing components; extract `useTableSort`. ~90+ LOC.
Risk if touched: shared comparator must handle string+boolean/number keys (uploaded-documents `:172-180` already does — reuse).

**ID: ui-5 — Sort state/comparator duplicated between the two pages that DO use `admin/*`**
Location(s): `uploaded-documents/page.tsx:128-184`, `scraped-webpages/page.tsx`
Severity: medium · Effort: S
Recommendation: `useTableSort<T>(...)`. ~50 LOC/page.

**ID: ui-6 — Edit-document modal bypasses `Modal`+`ui/Input` (10 inline focus/blur style mutations)**
Location(s): `uploaded-documents/page.tsx:690-883`
Severity: medium · Effort: M
Recommendation: wrap in `<Modal>`, use `<Input>`; extract `<DocumentEditModal>`. ~85 LOC.

**ID: ui-7 — No shared `<FormField>`; forms re-paste identical label+input markup**
Location(s): `settings/profile/page.tsx:347-446` (5×), `email-preferences:148-230` (4 checkboxes), `delete-account:433`, `chat/ChatModals.tsx:37-205` (6×)
Severity: medium · Effort: M
Evidence: `admin/users:561` already uses `ui/Input` — app is inconsistent.
Recommendation: standardize on `ui/Input`/`Checkbox`/`Textarea` or add `<FormField label hint error>`. ~120–180 LOC.
Risk if touched: ChatModals glassmorphism variant needs an `ui/Input` `variant` prop or stays custom.

**ID: ui-8 — Minimal Suspense coverage; hand-rolled, inconsistent loading UIs**
Location(s): Suspense in only 4 files; bespoke loaders at `profile:206`, `email-preferences:111`; `delete-account:189` uses `LoadingSpinner` instead
Severity: low · Effort: S
Recommendation: `<PageLoading label>` or `loading.tsx` segments; standardize on `LoadingSpinner`.

**ID: ui-9 — `useAdminAuth.onAuthenticated` stale-closure pattern forces awkward ordering**
Location(s): `hooks/useAdminAuth.ts:73,87` (eslint-disable, `[]` deps), consumed `uploaded-documents/page.tsx:101,121-126`
Severity: low · Effort: S
Recommendation: return `reload`/`isAuthenticated` flags instead of a fire-and-forget callback.

**ID: ui-10 — Prop drilling in `chat/page.tsx` (12 props to ChatSidebar; modal form state threaded)**
Location(s): `chat/page.tsx:597-611, 688-712`
Severity: low · Effort: M
Recommendation: after ui-1, move session+modal state into hooks/context.

> Cross-cutting: `components/admin/*` (Pagination, SearchInput, SortableTableHeader, StatusBadge, DeleteConfirmationModal) is good but only 2 of 6 `useAdminAuth` pages use it. **The fix is adoption, not new components.**

---

## Domain 6 — Types & Validation

**Headline numbers:** explicit `any` = **3** (all eslint-disabled at lib boundaries: `epubProcessor.ts:84`, `multimediaProcessors.ts:322,324`); zero `@ts-ignore`/`@ts-expect-error`/bare `object`. Zod request-validation coverage = **0/60 routes** (zod used only in `env.ts:9`). `Record<string,unknown>` = **51** across 18 files. Actual route count = **60** (CLAUDE.md says 61).

**ID: types-1 — Zod absent from 59/60 routes** — see api-1. Critical · L. `request.json()` → `any` into business logic (`chat/route.ts:74`, `admin/users/[userId]/route.ts:30`). Build `src/lib/schemas/` + `parseBody`; reuse `emailSchema`/`roleSchema=z.enum([...])`/`uuidSchema`. Roll out per-route with `.optional()`/`.passthrough()` initially.

**ID: types-2 — Four conflicting `Document` interfaces (snake vs camel)**
Location(s): `lib/types.ts:19` (snake) vs `uploaded-documents/page.tsx:23`, `scraped-webpages/page.tsx:24` (camel), `upload-documents/page.tsx:24` (3-field stub)
Severity: high · Effort: M
Recommendation: single `DocumentRow` (DB) + `DocumentDTO` (API); derive views. ~50 LOC.

**ID: types-3 — Duplicate `User`/`Conversation`/`Chunk`**
Location(s): `lib/types.ts:7` vs `admin/users/page.tsx:30` (weakens `role:UserRole`→`string`); `lib/types.ts:63` vs `types/chat.ts:62`; `lib/types.ts:42` vs `performance-tracking.ts:70`
Severity: medium · Effort: M
Recommendation: consolidate; restore `UserRole` union in admin. ~25 LOC.

**ID: types-4 — No generated Supabase types; `lib/types.ts` hand-maintained, ~15 tables untyped**
Location(s): `lib/types.ts:1`; CLAUDE.md tables (user_context, conversation_memory, data_export_requests…) have no interface
Severity: medium · Effort: M
Recommendation: `supabase gen types typescript` → `database.types.ts`; alias `type User = Database['public']['Tables']['users']['Row']`. Eliminates ~95 LOC of hand-drift.
Risk if touched: generated types are stricter (`| null`) — consumers need null-guards. (Stop-and-plan: tooling/schema-adjacent.)

**ID: types-5 — 51× `Record<string,unknown>` incl. core `Document`/`Chunk` `metadata`**
Location(s): `lib/types.ts:39,48`; `advanced-cache.ts` (13), `logger.ts` (11), `middleware.ts` (4), `privacy/export/route.ts` (2)
Severity: low-medium · Effort: M
Recommendation: explicit interfaces where shape is known; keep generic only in cache/logger.

**ID: types-6 — Justified `any` (informational, clean)**
Location(s): `epubProcessor.ts:84`, `multimediaProcessors.ts:322,324`
Recommendation: optional `.d.ts` for ffprobe stream (follow `types/pptx-parser.d.ts`). Very low priority — exemplary hygiene.

---

## Domain 7 — Logging & Observability

**Exact `console.*` count in `src/`: 25** (5 are logger.ts's own sinks; **20** ad-hoc, all client-side). Server `lib`/`api`: **0**. GDPR/secret hard-rule: **PASS** — zero env-to-log/Sentry vectors; IP truncation verified.

**ID: log-1 — `logError()` never forwards to Sentry**
Location(s): `lib/logger.ts:88-104`; 79 consumers; only `app/global-error.tsx:9` calls `captureException`
Severity: high · Effort: S
Evidence: `logError` only `console.error`s; API catch blocks log + return 500, so the error never bubbles to `instrumentation.ts onRequestError`. Per `SENTRY_SETUP.md:103-138` capture was prescribed but never added.
Recommendation: add `Sentry.captureException(error,{contexts:{operation:context}})` in `logError`. Covers ~210 sites with one edit.
Risk if touched: event volume/cost — sample if noisy; pair with log-5.

**ID: log-2 — Handled API errors bypass `onRequestError`** — resolved transitively by log-1. `instrumentation.ts:11-35`; 131 catch blocks in 59 files.

**ID: log-3 — 20 client `console.*`, none structured/Sentry-reported**
Location(s): `useChat.ts:165,200,206,250`; `useSessions.ts:35,67,93,117,135`; `AuthRefreshHandler.tsx:65,69,78`; `admin/page.tsx:133,145`; etc.
Severity: low · Effort: S
Recommendation: add `Sentry.captureException` (consent-gated, per `instrumentation-client.ts:74-78`) to ~6 meaningful catches; leave low-value debug logs.

**ID: log-4 — Doc drift: CLAUDE.md "~36 console.logs" → actual 25 (20 ad-hoc).** Low. Update the metric.

**ID: log-5 — No server-side Sentry `beforeSend` PII scrubber (latent — activates with log-1)**
Location(s): `sentry.server.config.ts:7-18`, `sentry.edge.config.ts:8-19` (no `beforeSend`); contrast client `instrumentation-client.ts:74-96`
Severity: medium · Effort: M
Recommendation: add server `beforeSend` stripping email/token/password/api-key/full-IP/raw-query; keep `sendDefaultPii` false.

**ID: log-6 — GDPR IP truncation verified (PASS, informational)**
Location(s): `get-identifier.ts:13-24,67` (keeps 2 octets / truncates IPv6). No env/secret leak vector found.

> Out-of-scope note (dep-13 echo): no `sentry.client.config.ts` (only edge+server) — possible client-capture gap; the client init lives in `instrumentation-client.ts`. Worth a separate check.

---

## Domain 8 — Tests

**REAL counts (from `npm run test -- --run`):** `Test Files 8 passed (8)` · `Tests 111 passed | 8 skipped (119)` · **0 failing.** Duration 89s. 60 route files, 4 tested.

**ID: test-1 — CLAUDE.md test metrics are false** (claims 121 tests / 18 failing / 78%). Medium (doc integrity). Reality: 119 collected, 111 pass, 0 fail, 8 skipped. Remove the "18 failures" critical-roadmap item.

**ID: test-2 — Upload suite takes 88s on real `setTimeout` backoff**
Location(s): `upload-blob.integration.test.ts` (88,081ms) ← `upload/blob/route.ts:202` (10s initial), `:241` (`Math.pow(2,attempt)*3000`)
Severity: high · Effort: S
Evidence: retry test waits 10+6+12s real; other 7 files run in ~0.2s combined.
Recommendation: `vi.useFakeTimers()` + `advanceTimersByTimeAsync`, or make delays configurable. ~88s → <1s.
Risk if touched: fake timers must `await runAllTimersAsync` carefully or tests hang. Test-only.

**ID: test-3 — ~225 LOC duplicated mock boilerplate across 4 integration tests**
Location(s): `admin-invite`/`upload-blob`/`documents`/`chat`.integration.test.ts (lines ~1–130 each): `vi.mock('@/lib/auth')` (4/4), `logger` (4/4), `rate-limiter`/`get-identifier`/`input-sanitizer` (2/4), hand-rolled supabase builder chains
Severity: medium · Effort: M
Recommendation: `tests/helpers/mocks.ts` — `mockUser`, `mockLogger`, `mockRateLimit`, `mockIdentifier`, `mockSanitizer`, `mockSupabaseTable(dataByTable)`, request builders. Use `vi.hoisted()`. ~225 LOC (~11%).

**ID: test-4 — 8 skipped tests are exactly the error/edge paths**
Location(s): `documents:194,298` (DB error, 404); `chat:549` (context update); `admin-invite:300` (milestone); `upload-blob:200,316,494,523` (size limit, dup title, extraction fail, DB insert fail)
Severity: medium · Effort: M
Recommendation: re-enable behind the shared supabase builder (test-3); prioritize upload 400/409/extraction + documents 404.

**ID: test-5 — Zero coverage on highest-risk modules**
Location(s): ~30 of 33 lib modules untested incl. `hybrid-search.ts`, `auth.ts`/`auth-helpers.ts`/`admin-utils.ts`, `userContextManager.ts`; **all GDPR routes** (`privacy/{export,delete,cancel-deletion,validate-deletion-token}`); all 4 hooks; 1 of ~45 components
Severity: high · Effort: L
Recommendation: prioritize `hybrid-search`, `admin-utils`/`auth-helpers` units + `privacy/delete`+`privacy/export` integration (legal exposure).

**ID: test-6 — Rate-limiter tests only hit in-memory fallback, never Redis**
Location(s): `tests/lib/rate-limiter.test.ts` (Upstash env unset in `vitest.setup.ts`)
Severity: medium · Effort: M
Recommendation: mock `@upstash/redis`, set env, assert per-role multipliers.

**ID: test-7 — No E2E layer (no Playwright)**
Location(s): no `playwright.config.*`/`e2e/`; roadmap items unchecked
Severity: high · Effort: L
Recommendation: 4 Playwright smoke specs (auth, chat, upload, GDPR delete+cancel); nightly CI against seeded env (live-service cost).

---

## Domain 9 — Dead / Duplicated Code

**ID: dead-8 — `github-files/` = 297 MB committed binary corpus (550 files)** — High. Used only by `scripts/prepare-github-files.js` / `populate-download-urls.js`, not `src/`. Largest shrink. **Verify ingest pipeline complete before acting** (move to Blob/git-lfs or remove from history).

**ID: dead-4 — Both env validators dead** — Medium. `lib/env.ts:50` (Zod) and `lib/env-validator.ts:62` (manual) have zero external importers; `instrumentation.ts` never calls either. Keep Zod `env.ts` (wire into startup) and delete `env-validator.ts`. ~120 LOC.

**ID: dead-5 — `lib/utils/sanitize.ts` dead (3rd redundant sanitizer)** — Medium. Zero importers; live ones are `input-sanitizer.ts` (13) + `clientValidation.ts` (3). Delete (~40 LOC).

**ID: dead-7 — `backups/` committed despite gitignore; `backup.tsx` is dead Clerk-era code** — Medium. `git ls-files backups/` → 9 tracked; `backup.tsx` imports `@clerk/nextjs` (migrated away). `git rm -r --cached backups/` + delete `backup.tsx`.

**ID: dead-6 — Broken `migrate:prepopulate` + runner reference missing `scripts/prepopulate-users.ts`** — Medium. `package.json` script and `scripts/prepopulate-users-runner.js:4` both target a nonexistent file. Restore or remove.

**ID: dead-1 — Orphan root scripts** — Low. `check-invitation.js`, `check-scraped-pages.mjs`, `debug-links.js`, `test-token-fix.js`, `test-hook.ts` (self-described "intentional errors" file). Tracked, zero importers. Remove.

**ID: dead-2 — Empty `git` file + committed logs** — Low. `/workspace/git` (0 bytes), `sync-output.log`, `prepopulate-production-output.log` tracked. Remove; add `*.log` to `.gitignore`.

**ID: dead-3 — Stray `.DS_Store`** — Low. `/workspace/.DS_Store`, `src/.DS_Store`, `tests/.DS_Store` (untracked, already gitignored). Delete from tree.

**ID: dead-9 — Three `.html` handoff files at root (~272 KB, untracked)** — Low. Delete/move.

**ID: dead-10 — 27 root `.md` docs (audit/plan sprawl; `optimizeChatRoute.md` describes a completed refactor)** — Low. Consolidate into `docs/archive/`. Confirms chat-route refactor done.

> Verified **NOT** dead (keep): `lib/utils.ts` (`cn()`, 14 importers), `performance-tracking.ts` (1, live), `utils/performance.ts`, `utils/cache-key.ts`, `supabase-client.ts`, `get-identifier.ts`, `titleCleaner.ts`, `intelligent-clarification.ts`, `question-quality-assistant.ts`.

---

## Domain 10 — Dependencies & Config

> **All dependency changes are STOP-AND-PLAN per CLAUDE.md.** Positive finding (dep-12): `next.config.ts` has **no** `ignoreBuildErrors`/`ignoreDuringBuilds` — builds enforce TS+ESLint.

**ID: dep-1 — Two ESLint configs; flat wins, legacy `.eslintrc.json` misleads** — Medium. `eslint.config.mjs` (flat, authoritative) vs `.eslintrc.json` (ignored, but enables `react-hooks/exhaustive-deps` the flat config drops). Delete legacy after porting the rule.

**ID: dep-2 — `tiktoken` unused** — Medium. 0 imports repo-wide; cost calc uses heuristics. Remove (~3–5 MB WASM).

**ID: dep-3 — `@types/mime-types` orphaned** — Medium. Runtime `mime-types` isn't even a dependency. Remove.

**ID: dep-4 — Redundant/stale `@types/*`** — Low/correctness. `dompurify@3.3`, `cheerio@1.1`, `sharp@0.34` ship own types; `@types/cheerio@0.22` actively mis-types cheerio 1.x. Remove `@types/{cheerio,dompurify,sharp}`; run type-check.

**ID: dep-5 — Full `puppeteer` (~170 MB Chromium) for a local-dev-only `executablePath`** — Medium. `document-generator.ts:7` already uses `puppeteer-core`+`@sparticuz/chromium`; only `scrape-website/route.ts:3` pulls full `puppeteer`. Standardize on `puppeteer-core` + a local Chrome path. Biggest install shrink. Stop-and-plan (needs local-dev plan).

**ID: dep-6 — `serverExternalPackages` lists non-deps** — Low. `next.config.ts:9,12` reference `pdf2pic`/`fluent-ffmpeg` (not installed; ffmpeg is via `@ffmpeg-installer`). Remove the two names.

**ID: dep-7 — `next lint` deprecated (Next 15.3+/removed in 16); CI depends on it** — Low. Plan migration to `eslint .`.

**ID: dep-8 — `@next/bundle-analyzer@16` on `next@15`** — Low. Align to `^15.5.x`.

**ID: dep-9 — Tailwind v3 JS config coexists with v4** — Low. `tailwind.config.js` half-migrated; theme split between CSS `@theme` and JS. Pick one source of truth (visual verification needed).

**ID: dep-10 — CI runs lint+type-check+test+build+audit (claim accurate, with caveat)** — Info. `.github/workflows/ci.yml:27-37,75-81`; both `npm audit` steps `continue-on-error:true` (never fail build). Drop on the high-severity step if gating desired.

**ID: dep-11 — tsconfig smells** — Low. `target:ES2017` (dated for Node 20), `allowJs:true` (latent), `skipLibCheck` (hides dep-4 staleness). Bump target to ES2022.

**ID: dep-13 — `jsdom` vs `happy-dom` are NOT duplicates (keep both)** — Low. `jsdom` gives DOMPurify a server `window` (`input-sanitizer.ts:3,6`); `happy-dom` is the Vitest env. Optional future: lighter DOM shim (security-sensitive → stop-and-plan).

---

## Ranked Summary (impact-first)

| ID | Title | Sev | Effort | Impact |
|----|-------|-----|--------|--------|
| log-1 | `logError`→Sentry (one-file, ~210 sites) | High | S | ★★★★★ |
| api-1/types-1 | Zod at all 60 route boundaries | Critical | L | ★★★★★ |
| auth-2 | Doc download object-level authz | High | S* | ★★★★☆ |
| auth-1 | RLS not active (app-layer only) | High | L* | ★★★★☆ |
| api-2/auth-3/svc-6 | `withAuth` guard + repositories | Medium | M | ★★★★☆ |
| ui-1/ui-2 | Dead chat hooks + CleanChatInterface | High | M | ★★★★☆ |
| ai-4/ai-3 | Cache memory cap + hot-path stringify | Medium | S/M | ★★★★☆ |
| dead-8 | 297 MB `github-files/` | High | M* | ★★★★☆ |
| ai-10 | Embedding cost-tracking gap | Medium | S | ★★★☆☆ |
| test-2 | 88s upload suite → fake timers | High | S | ★★★☆☆ |
| log-5 | Server Sentry `beforeSend` scrubber | Medium | M | ★★★☆☆ |
| ui-3 | `useApiResource`/`useApiMutation` | High | M | ★★★☆☆ |
| svc-5 | `DocumentRepository` | High | M | ★★★☆☆ |
| ui-4/ui-5 | Adopt admin table components + `useTableSort` | High/Med | M | ★★★☆☆ |
| api-5 | Merge blob/process-blob via ingest service | Medium | L | ★★★☆☆ |
| svc-1/svc-2/dead-4/dead-5/ai-7 | Delete dead source (~360 LOC) | Medium | S | ★★★☆☆ |
| ui-7 | Shared form primitives | Medium | M | ★★☆☆☆ |
| test-3/test-4 | Shared fixtures + un-skip edge tests | Medium | M | ★★☆☆☆ |
| types-2/types-3 | Consolidate Document/User/Conversation types | High/Med | M | ★★☆☆☆ |
| test-5/test-6/test-7 | Coverage + Redis tests + Playwright | High | L | ★★★☆☆ |
| api-6/ai-8/svc-7 | scrape-website + clarification + invitation fork | High | L* | ★★★☆☆ |
| dep-2/dep-3/dep-4/dep-6/dep-1 | Dead deps + config cleanup | Med/Low | S* | ★★☆☆☆ |
| dep-5/dep-9/dep-11/types-4 | puppeteer / tailwind / tsconfig / gen-types | Med/Low | M* | ★★☆☆☆ |
| ai-1/ai-2/ai-6/ai-12 | Cache-key + batching cleanups | Low/Med | S | ★★☆☆☆ |
| api-3/api-4/api-7/api-9 | Response envelope + helper dedup | Med/Low | S/M | ★★☆☆☆ |
| auth-5/auth-7/auth-8 | Deletion cache / session-check / listUsers | Med/Low | S | ★★☆☆☆ |
| dead-1/2/3/6/7/9/10 | Repo hygiene (orphans, logs, docs) | Low | S | ★☆☆☆☆ |
| test-1/log-4/dead-10 | Fix stale CLAUDE.md metrics | Med/Low | S | ★★☆☆☆ |

\* = decision/stop-and-plan gated (RLS, schema, deps, build config, large architecture, or product intent).

**See `CLEANUP_PLAN.md` for the sequenced phases and `COMPONENTS_PROPOSED.md` for the shared primitives.**
