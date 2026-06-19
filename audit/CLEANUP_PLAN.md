# Cleanup Plan — MultiplyTools / patmosllm

Findings from `AUDIT_FINDINGS.md`, sequenced into **independent, shippable phases** ordered by impact ÷ effort and dependency. Each phase is behavior-preserving unless explicitly flagged **STOP-AND-PLAN**.

**Global acceptance gate (every phase):** `npm run type-check` ✅ · `npm run lint` ✅ · affected Vitest suites ✅ · no new client-side secret · relevant satellite doc updated. Commit before each step (CLAUDE.md "commit before you change"). Work on a branch; push via `runx push`.

**Dependency graph (high level):**
```
P1 (dead code + doc truth)  ─┐
P2 (Sentry coverage)         ─┼─ independent, any order
P3 (cache/AI safe fixes)     ─┘
P4 (Zod) ──────────────► P5 (withAuth + repos)   [P5 reads cleaner post-P4 schemas]
P6 (frontend hooks) ── depends on P1 (dead hooks gone) ──► uses P2 logger
P7 (tests) ── easier after P5/P6 (fixtures align) but startable now
P8 deps/config · P9 RLS/authz · P10 big architecture  = STOP-AND-PLAN, scheduled last
```

---

## Phase 1 — Truth & Dead Code *(safest high-value batch — do first)*

**Goal:** Remove zero-importer dead code and correct stale `CLAUDE.md` metrics so the roadmap targets real work. Pure deletion + docs; no runtime behavior changes.

**Exact files:**
- Delete source (verified zero importers): `src/lib/auth-helpers.ts` (svc-2, 91 LOC), `src/lib/utils/sanitize.ts` (dead-5, ~40), `src/components/CleanChatInterface.tsx` (ui-2, 394).
- Delete dead members: `src/lib/supabase.ts:96-159` (svc-1, 4 fns ~64 LOC), `src/lib/intelligent-clarification.ts:693-707` + `:983-1013` (ai-7, ~45 LOC).
- Pick one env validator: keep `src/lib/env.ts`, delete `src/lib/env-validator.ts` (dead-4). *(Note: neither is currently wired in — wiring `env.ts` into `instrumentation.ts` is optional and belongs to P8 since it changes startup; here, only delete the redundant one.)*
- Repo hygiene: remove `git` (empty), `sync-output.log`, `prepopulate-production-output.log`, root `*.html` handoffs (dead-2/9); orphan scripts `check-invitation.js`, `check-scraped-pages.mjs`, `debug-links.js`, `test-token-fix.js`, `test-hook.ts` (dead-1); add `*.log` + reaffirm `.DS_Store` to `.gitignore`.
- Docs: update `CLAUDE.md` — chat route 599 (not 1,276), **0 failing tests** / 119 collected (not 18 fail / 78%), 20 client console.* (not 36); drop the "fix 18 failing tests" critical item (test-1, log-4, dead-10).

**Closes:** svc-1, svc-2, ai-7, dead-1, dead-2, dead-4, dead-5, dead-9, ui-2, test-1, log-4, partial dead-10.
**Acceptance:** type-check + lint + full test run green (deletions only touch unreferenced symbols — type-check proves no importers). Grep each deleted file's basename across `src/` returns 0 before deleting.
**Rollback:** single revert commit; nothing depends on deleted code.
**Net:** ~700+ LOC source removed, repo de-cluttered, docs truthful. **Note `backups/`, `github-files/` deferred** — they need `git rm --cached` and ingest-pipeline confirmation (P8/separate).

---

## Phase 2 — Observability: route errors reach Sentry *(highest impact-to-effort)*

**Goal:** Make `logError()` forward to Sentry so ~210 server call sites + 131 API catch blocks become visible, without editing any of them. Land the PII scrubber in the same phase so it's safe.

**Exact files:** `src/lib/logger.ts:88-104` (add `Sentry.captureException(error,{contexts:{operation:context}})` + `captureMessage` for non-Error branch, per `SENTRY_SETUP.md:103-138`); `sentry.server.config.ts`, `sentry.edge.config.ts` (add `beforeSend` stripping email/token/password/api-key/full-IP/raw-query; keep `sendDefaultPii` false).

**Closes:** log-1, log-2, log-5.
**Acceptance:** type-check + lint; a unit test asserting `logError` calls `captureException` once and that `beforeSend` redacts a seeded sensitive key; verify no env value can reach Sentry (hard rule). Manual: trigger a dev error, confirm scrubbed payload shape.
**Rollback:** revert `logger.ts` + the two config edits (independent of all other phases).
**Risk:** Sentry event volume/cost — add sampling if noisy. Must verify scrubber covers the `context` objects passed by callers.

---

## Phase 3 — Cache & AI safe correctness/perf fixes

**Goal:** Behavior-preserving fixes to the cache hot path and embedding cost tracking. **Excludes** eviction-policy change (ai-4 behavior change → P9/measure).

**Exact files:**
- `src/lib/advanced-cache.ts:202-211, 87, 192-195` — make `estimateMemoryUsage()` lazy (compute only in `getStats()`); `set()` updates `totalEntries=this.cache.size` (ai-3).
- `src/lib/openai.ts:258,344,363,382,400` — thread `userId,requestId` through recursive `createEmbeddings` (ai-10).
- `src/lib/ingest.ts:187-203` — collapse to single `await storeChunks(pineconeChunks)` (ai-6; fix `pineconeeBatchSize` typo on the way out).
- `src/lib/hybrid-search.ts:186,312` — drop redundant `{userId:opts.userId}` 3rd arg (ai-1).

**Closes:** ai-1, ai-3, ai-6, ai-10. (Document ai-2 as "search-only / partially complete"; ai-4/ai-5 deferred.)
**Acceptance:** type-check + lint; add/extend a unit test for `storeChunks` batching (>100 chunks still upserts in 100s) and one asserting `trackUsage` fires on a split embedding batch. Cache stats output unchanged when read via `getStats()`.
**Rollback:** per-file reverts; each fix is independent.
**Risk:** ai-1 changes the literal cache-key string → one-time cold search cache on deploy (self-heals in seconds). Do NOT touch chunk boundaries or 70/30 weights.

---

## Phase 4 — Zod validation at route boundaries *(Critical mandate; large but independent)*

**Goal:** Satisfy CLAUDE.md "Zod at every boundary." Roll out per-route — fully shippable in sub-batches (e.g. P4a auth+user, P4b admin, P4c upload/chat/privacy).

**Exact files:** new `src/lib/schemas/` (shared `emailSchema`, `roleSchema=z.enum(['SUPER_ADMIN','ADMIN','CONTRIBUTOR','USER'])`, `uuidSchema`) + `parseBody(req,schema)` helper; then each of the ~34 body-parsing routes (start with `auth/login-supabase`, `user/update-profile`, `admin/invitations`, `admin/users/[userId]`, `chat`, `upload/process-blob`).

**Closes:** api-1, types-1 (and removes the implicit-`any` body problem).
**Acceptance:** per sub-batch — type-check + lint + that route's tests; new schema unit tests; manual check that a malformed body returns the **same** 400 shape as before. Use `.optional()`/`.passthrough()` initially so existing clients don't break.
**Rollback:** per-route revert (each route independent).
**Risk:** strict schemas can reject previously-tolerated payloads — roll out incrementally, keep exact error messages clients may match on, keep `sanitizeInput`/`sanitizeEmail` after parse.

---

## Phase 5 — `withAuth` guard + repositories *(big dedup; auth-sensitive)*

**Goal:** Collapse the auth/role/rate-limit boilerplate and the scattered `documents`/`users` queries. Reads cleaner after P4 (typed bodies).

**Exact files:**
- new `src/lib/route-guard.ts` — `withAuth(handler,{roles?,rateLimit?})` (see COMPONENTS_PROPOSED). Apply route-by-route to the ~49 handlers, preserving each route's exact status code/response shape.
- new `src/services/documentRepository.ts` (svc-5) — `insertDocument`, `mapDocumentInsertError`, `findExistingDocumentByPath`; adopt in the 4 upload/save routes.
- new `src/services/userRepository.ts` (svc-6, svc-8) — `getUserByAuthId`, `findUserByEmail` (standardize `maybeSingle`), `updateUserProfile`, `findAuthUserByEmail`, `deleteOrphanedAuthUser`; adopt in `auth.ts:34`, the two email checks, the 3 orphan-cleanup sites.
- move `cleanTextContent` to `input-sanitizer.ts` (api-4/svc-4); derive `operation` log field in the wrapper (api-9).

**Closes:** api-2, api-4, api-9, auth-3, auth-4 (partial), svc-3, svc-4, svc-5, svc-6, svc-8.
**Acceptance:** type-check + lint + all API integration tests; a focused test per role tier confirming 401/403 boundaries unchanged on a sample of migrated routes. Migrate in sub-batches (uploads, admin, user) and run tests between each.
**Rollback:** per-route / per-repository revert; wrapper and repos are additive until adopted.
**Risk:** **auth/privilege** — wrong default role set = escalation; `getUserByAuthId` is on the hot path (`.single()`↔`.maybeSingle()` differ); preserve rate-limit-after-auth order and 404-dependent flows (`useAdminAuth.ts:46`). Do NOT touch RLS.

---

## Phase 6 — Frontend shared hooks/components *(depends on P1; uses P2 logger)*

**Goal:** Remove the ~30 fetch/error/toast copies and table/form duplication; reconcile the chat page with the (now-deleted-or-revived) hooks.

**Exact files:**
- new `src/hooks/useApiResource.ts` + `useApiMutation.ts` (ui-3); adopt in `admin/users`, `admin/uploaded-documents`, `scraped-webpages`, `invitation-quotas`, `settings/{profile,email-preferences,delete-account}`.
- new `src/hooks/useTableSort.ts` (ui-4/ui-5); adopt in `admin/users` + `admin/uploaded-documents` + `scraped-webpages`.
- Migrate `admin/users/page.tsx` onto existing `SortableTableHeader`/`StatusBadge`/`Modal`/`DeleteConfirmationModal` (ui-4); wrap edit modal in `Modal`+`ui/Input` (ui-6).
- Standardize forms on `ui/Input`/`Checkbox`/`Textarea` or add `<FormField>` (ui-7); add `<PageLoading>` (ui-8).
- Resolve ui-1: either delete `useChat`/`useSessions` (if P1 didn't) **or** wire `chat/page.tsx` to them (reconcile `Message` shape first). Then reduce ChatSidebar prop drilling (ui-10).

**Closes:** ui-1, ui-3, ui-4, ui-5, ui-6, ui-7, ui-8, ui-9, ui-10.
**Acceptance:** type-check + lint; component tests for the new hooks; **manual QA of chat + each migrated admin/settings page** (rendering, loading, error states) — these are user-facing. Migrate one page at a time.
**Rollback:** per-page revert; hooks additive.
**Risk:** chat is the most-used screen — do the ui-1 reconciliation behind manual QA. ChatModals glassmorphism may need an `ui/Input` `variant` prop.

---

## Phase 7 — Test hardening *(startable anytime; aligns with P5/P6 fixtures)*

**Goal:** Fast suite, shared fixtures, un-skipped edge paths, coverage on highest-risk areas.

**Exact files:**
- `tests/api/upload-blob.integration.test.ts` — fake timers (test-2): 88s → <1s.
- new `tests/helpers/mocks.ts` (test-3, `vi.hoisted()`) — `mockUser/mockLogger/mockRateLimit/mockIdentifier/mockSanitizer/mockSupabaseTable` + request builders; refactor the 4 integration tests onto it.
- Re-enable the 8 skipped tests behind the new builder (test-4).
- New tests: `hybrid-search`, `admin-utils`/`auth-helpers`-successor, `privacy/delete` + `privacy/export` (test-5); Redis-path rate-limiter (test-6); Playwright smoke specs auth/chat/upload/GDPR-delete (test-7, nightly CI).

**Closes:** test-2, test-3, test-4, test-5, test-6, test-7.
**Acceptance:** full suite green and **under ~10s** locally (fake timers); coverage report shows new GDPR/search coverage; Playwright specs pass against a seeded env.
**Rollback:** test-only; revert per file.
**Risk:** fake timers must `await runAllTimersAsync` or tests hang; un-skipped tests may reveal real route gaps (good — fix forward).

---

## Phase 8 — Dependencies & build config *(STOP-AND-PLAN — npm/config changes)*

**Goal:** Remove dead deps, reconcile dual configs. Each is a CLAUDE.md stop-and-plan item.

**Items:** delete `.eslintrc.json` after porting `exhaustive-deps` to `eslint.config.mjs` (dep-1); remove `tiktoken` (dep-2), `@types/mime-types` (dep-3), `@types/{cheerio,dompurify,sharp}` (dep-4); strip `pdf2pic`/`fluent-ffmpeg` from `next.config.ts:9,12` (dep-6); align `@next/bundle-analyzer` to `^15` (dep-8); bump tsconfig `target` to ES2022 (dep-11); wire `env.ts` Zod validation into `instrumentation.ts` startup (dead-4 follow-up). **Larger/separate plans:** drop full `puppeteer` for `puppeteer-core`+local Chrome path (dep-5); finish Tailwind v4 config migration (dep-9); `supabase gen types` → `database.types.ts` (types-4, types-2, types-3).

**Closes:** dep-1, dep-2, dep-3, dep-4, dep-6, dep-8, dep-11; (dep-5, dep-9, types-4 as sub-plans).
**Acceptance:** `npm run type-check` + `npm run lint` + `runx build` clean after each removal; `@types/cheerio` removal may surface real cheerio-1.x type fixes (correctness win).
**Rollback:** `package.json`/lockfile revert per item.
**Risk:** removing a dep used only in `scripts/` — grep `scripts/` too; puppeteer removal breaks local-dev scraping without a Chrome path.

---

## Phase 9 — Auth / RLS posture *(STOP-AND-PLAN — security & product intent)*

**Goal:** Resolve the two authz gaps that need a decision, not a refactor.

**Items:** (auth-2) decide whether the document corpus is shared-read; if not, add the ownership/role filter to `documents/download/[documentId]/route.ts`. (auth-1) document that authz is app-layer only; produce an inventory of `supabaseAdmin` queries vs their ownership filters; decide if/when RLS is enabled (must be planned against all 34 service-role sites). Also: gate `/api/auth/session-check` (auth-7); invalidate the deletion-grace cache on cancel/schedule (auth-5); fix paginated `listUsers` lookup (auth-8/svc-8); evaluate cache eviction-by-memory with measurement (ai-4).

**Closes:** auth-1, auth-2, auth-5, auth-7, auth-8, ai-4 (decision).
**Acceptance:** explicit written decision per item; any RLS/schema change snapshotted and `schema.md` updated (hard rule #9). No code merged here without sign-off.
**Risk:** **highest** — RLS/GDPR/auth. Pure planning + narrowly-scoped, tested edits only.

---

## Phase 10 — Large architecture decomposition *(STOP-AND-PLAN — biggest surface)*

**Goal:** Tackle the three big structural items once the safe wins are banked.

**Items:** (api-6) split `scrape-website/route.ts` (1,416 LOC) into `src/lib/scraper/*`, delete dead block + unused sitemap cache, fix the cross-request `browserPool` singleton. (api-5/svc-9/svc-10) extract `persistAndIngestDocument` + `StreamingService`/`ConversationRepository`; merge `upload/blob`↔`process-blob`. (ai-8) extract clarification keyword map to a data module; short-circuit disabled analyzers (chat critical path — careful). (svc-7) reconcile the two invitation systems (needs product decision). (types-2/3/5) consolidate Document/User/Conversation types + tighten core `metadata`.

**Closes:** api-3, api-5, api-6, api-7, ai-8, svc-7, svc-9, svc-10, types-2, types-3, types-5.
**Acceptance:** per item — type-check + lint + integration tests + manual QA of the affected flow (scrape, upload, chat streaming, invitations); SSE wire format byte-preserved; scrape JSON shapes unchanged.
**Risk:** large; each item is its own mini-plan. Streaming and invitation flows are user-/access-critical.

---

### Suggested execution order
**P1 → P2 → P3** (fast, safe, high-value; bank the wins) → **P4** (mandate, sub-batched) → **P5** (dedup, auth-careful) → **P6** (frontend) → **P7** (tests) → then the stop-and-plan trio **P8 / P9 / P10** as separately-approved efforts.

Phase 1 is the recommended starting batch: lowest risk, immediate clarity (truthful docs), and clears dead code that would otherwise confuse later phases.
