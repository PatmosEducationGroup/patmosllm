# Execution Plan — Rework-Minimizing Sequence

**Supersedes the *ordering* in `CLEANUP_PLAN.md`** (its per-phase acceptance criteria, rollback notes, and finding detail still apply). `CLEANUP_PLAN.md` is sorted by impact÷effort, which forces double-touches — e.g. it validates routes (P4) and then re-edits every route to wrap in `withAuth` (P5). This document reorders the *same findings* so **each file is edited once**.

---

## The five rework-avoidance rules

1. **Delete before you migrate.** Never refactor code that's scheduled for deletion. Dead-code removal goes first.
2. **Decide before you touch.** Every stop-and-plan question (authz intent, RLS, invitation fork, cache eviction) is answered *up front*, so when a file is finally edited, the security/architecture change lands in the *same* pass — not a later one.
3. **Types → repositories → guards → call sites.** Build each layer only after the layer it depends on is final, so you never rebuild a primitive against types you're about to regenerate.
4. **Build all primitives (additive) before any call-site sweep.** New files break nothing. Once `withAuth`, `parseBody`, the repositories, the hooks, and the test fixtures all exist, a route/page/test gets *every* change it needs in one edit.
5. **Bundle decomposition with adoption.** Files slated for a structural rewrite (`scrape-website`, `blob`/`process-blob`) are *excluded* from the generic sweep and get their boilerplate + split in a single combined pass.

**Result:** a generic API route is edited exactly once (gets `withAuth` + Zod + envelope + repository + canonical types + logger-operation, with Sentry already wired and any authz decision already known). Same for each page and each test file.

---

## Stage 0 — Ground truth & decisions *(no rework risk; mostly non-code)*

Do these first because they either remove code others would waste effort migrating, or settle questions that otherwise force a second edit later.

| Step | Findings | Why first |
|------|----------|-----------|
| **0.1 Delete dead code** | svc-1, svc-2, ai-7, ui-2, dead-1/2/4/5/9 | Don't migrate `auth-helpers.ts`, `CleanChatInterface.tsx`, dead `supabase.ts` helpers, redundant env validator, or orphan files that are about to vanish. |
| **0.2 Fix stale CLAUDE.md metrics** | test-1, log-4, dead-10 | Truthful roadmap; trivial. |
| **0.3 Dependency & config cleanup** | dep-1,2,3,4,6,8,11 | Isolated (package.json / configs), touches no app code. Removing stale `@types/cheerio` etc. makes the `type-check` signal *accurate* for every sweep downstream. |
| **0.4 Stop-and-plan decisions** | auth-1, auth-2, svc-7, ai-4, dead-4 | **RESOLVED 2026-06-17 — see below.** |
| **0.5 Investigate invitation systems** | svc-7 | ✅ **DONE 2026-06-17 — see svc-7 in AUDIT_FINDINGS.** Admin path (`invitation_tokens`) is fully wired; user self-invite path (`users` table) is **broken** — its tokens can't be redeemed because accept/validate read only `invitation_tokens`. Decision now needed: fix `invitation-service` to write to `invitation_tokens` (recommended) vs other reconciliation. Stop-and-plan. |

### Resolved decisions (2026-06-17)

- **(auth-2) Document download = shared-read — NOT a bug.** Any authenticated user must be able to download a cited library document immediately. Action: keep current behavior, add a code comment + doc note. **No ownership filter.** This is a **hard constraint on (auth-1)**: the eventual `documents` RLS policy must allow read/download for all authenticated users.
- **(auth-1) Enable RLS — committed project.** No longer "defer." Promoted to a real Stage 3 deliverable with its own sub-plan (policies on `auth_user_id` per table, audit of all 34 `supabaseAdmin` call sites, schema snapshot, shared-read `documents` policy per auth-2). Stays last because it requires consistent app-layer authz (post-2.1) as its precondition and is the highest-risk change.
- **(svc-7) Invitations — investigate first** (see step 0.5). Until the discovery lands, do only the safe token-generator dedupe; do not merge storage paths.
- **(ai-4) Cache eviction — open.** Defaulting to the safe **lazy-compute / advisory** fix (ai-3) in Stage 1.4; memory-based eviction deferred pending a decision. (User raised a separate question about upgrading the chat model to GPT-4o — tracked outside this plan; see notes.)
- **(dead-4) Env validator** — keep the Zod `env.ts`, delete `env-validator.ts` (Stage 0.1); wiring `env.ts` into startup happens in Stage 0.3/1.

**Gate:** type-check + lint + full test run green after 0.1/0.3 (deletions + dep removal only).

---

## Stage 1 — Foundations *(additive only; nothing adopts them yet, so nothing breaks)*

Strict internal order — each layer depends on the one above.

**1.1 Type bedrock** *(types-4 → types-2 → types-3)*
Generate `src/types/database.types.ts` (`supabase gen types`); define canonical `DocumentRow`/`DocumentDTO`, single `User` (restore `role: UserRole`), single `Conversation`, single `Chunk`. **Everything below consumes these** — build them first so repositories/routes/pages never get retyped.

**1.2 Logger → Sentry** *(log-1, log-2, log-5)*
Wire `Sentry.captureException` into `logError()` + add server `beforeSend` scrubber. Isolated to logger internals. **Must precede the route sweep** so the sweep never adds per-route Sentry calls (one logger edit covers ~210 sites).

**1.3 Backend primitives** *(new files — additive)*
`parseBody` + `src/lib/schemas/*` (`emailSchema`/`roleSchema`/`uuidSchema`), `withAuth`, `ok`/`err` envelope helpers, `createServerAuthClient`, `StreamingService.sseEvent`, `DocumentRepository` (svc-5), `UserRepository` (svc-6/8). Built on 1.1 types. Nothing imports them yet.

**1.4 Independent lib fixes** *(isolated — these files aren't touched by any sweep, so done-once here)*
`advanced-cache.ts` lazy memory (ai-3) — **bundle ai-4 eviction here iff 0.4 approved it**, else leave the hook obvious; `openai.ts` cost-threading (ai-10); `ingest.ts` double-batching (ai-6); `hybrid-search.ts` redundant cache-key param (ai-1). Document ai-2 as search-only.

**1.5 Frontend primitives** *(new files — additive)*
`useApiResource`, `useApiMutation` (ui-3), `useTableSort` (ui-4/5), `FormField`/`PageLoading` (ui-7/8). Built on 1.1 types. Resolve the dead chat-hooks question per 0.4 (delete `useChat`/`useSessions`, or keep to wire in 2.2).

**1.6 Test fixtures** *(new file — additive)*
`tests/helpers/mocks.ts` with `vi.hoisted()` factories (test-3). Nothing adopts it yet.

**Gate after each step:** type-check + lint + tests green. Because everything is additive (new files / internal logger change), the suite stays green throughout Stage 1.

---

## Stage 2 — Single-pass sweeps *(touch each file exactly once)*

Now every primitive exists, so each call site gets all its changes in one edit.

**2.1 Backend route sweep** — grouped: `auth/` → `user/` → `admin/` → `upload/` (excl. blob pair) → `privacy/` → `chat/`.
Per route, in **one** edit: `withAuth({roles, rateLimit})` + `parseBody(schema)` + `ok`/`err` envelope + adopt `DocumentRepository`/`UserRepository` + move `cleanTextContent` to `input-sanitizer` + operation-from-wrapper. For `documents/download/[documentId]`, apply the **auth-2 decision from 0.4** in this same pass. For `chat/route.ts`, also fold in `StreamingService.sseEvent` + `handleNonAnswer` (svc-9/10).
**Closes:** api-1, api-2, api-3, api-4, api-9, auth-2(code), auth-3, auth-4(partial), svc-4, svc-5, svc-6, svc-8, svc-9, svc-10, types-1. Commit per group; run that group's tests between commits.
**Excludes:** `scrape-website*` and `upload/blob`+`process-blob` → Stage 2.4.

**2.2 Frontend page sweep** — one page at a time (`admin/users` first — biggest win, then `uploaded-documents`, `scraped-webpages`, `invitation-quotas`, then `settings/*`, then `chat`).
Per page, in **one** edit: adopt `useApiResource`/`useApiMutation` + `useTableSort` + existing `admin/*` + `ui/*` components + `FormField`/`PageLoading`. For `chat/page.tsx`, wire `useChat`/`useSessions` (reconcile `Message` shape) + reduce ChatSidebar prop drilling.
**Closes:** ui-1, ui-3, ui-4, ui-5, ui-6, ui-7, ui-8, ui-9, ui-10. Commit per page; **manual QA each** (user-facing).

**2.3 Test sweep** — one file at a time.
Per integration test, in **one** edit: refactor onto `tests/helpers/mocks.ts` + fake timers (test-2) + un-skip the edge-path tests (test-4). Then add new coverage: `hybrid-search`, `privacy/delete`+`privacy/export`, Redis-path rate-limiter (test-5/6).
**Closes:** test-2, test-3, test-4, test-5, test-6. **Gate:** full suite green and <~10s.

**2.4 Combined decomposition** *(the heavy files — structural rewrite + boilerplate in one pass)*
Split `scrape-website/route.ts` into `src/lib/scraper/*` **and** apply `withAuth`+Zod+envelope together (api-6 + its boilerplate); delete dead block + unused sitemap cache; fix the cross-request `browserPool`. Merge `upload/blob`+`process-blob` via `persistAndIngestDocument` **and** adopt `DocumentRepository`/`withAuth` in the same pass (api-5). Extract the clarification keyword map to a data module (ai-8). Each file touched once.
**Closes:** api-5, api-6, ai-8.

---

## Stage 3 — Gated / last *(depend on a stable surface or a standalone decision)*

**3.1 Playwright E2E** (test-7) — after 2.1/2.2 so specs target the final routes/UI and aren't rewritten.
**3.2 RLS enablement** (auth-1) — **committed project** (per 0.4), heaviest stop-and-plan; **last** because app-layer authz must be consistent first (post-2.1) and it must be planned against all 34 `supabaseAdmin` sites with a schema snapshot. Its own sub-plan: (1) inventory every `supabaseAdmin` query + its ownership/role filter; (2) author `auth_user_id` policies per user-data table, **with a `documents` policy that allows shared read/download for all authenticated users** (auth-2 constraint); (3) keep `search_path` on any new functions (hard rule #6); (4) snapshot + update `schema.md`. RLS is DB-side policy, so it adds *no* route rework — but the service-role client *bypasses* RLS, so part of this project is deciding which reads should move off `supabaseAdmin` onto the anon/SSR client to actually exercise the policies (otherwise RLS is inert). That sub-decision is itself stop-and-plan.
**3.3 Standalone deferred items** — invitation-system merge (svc-7) if approved; finish Tailwind v4 config (dep-9); drop full `puppeteer` (dep-5). Each is its own mini-plan, none re-touches the swept files.

---

## Touch-count proof for the hot files

| File | Edited in | Times |
|------|-----------|-------|
| generic API route | 2.1 only (Sentry via 1.2, types via 1.1, repos via 1.3) | **1** |
| `documents/download/[documentId]` | 2.1 (authz decision from 0.4 applied same pass) | **1** |
| `chat/route.ts` | 2.1 (incl. StreamingService + handleNonAnswer) | **1** |
| `scrape-website/route.ts` | 2.4 (split + boilerplate together) | **1** |
| `upload/blob` + `process-blob` | 2.4 (merge + adoption together) | **1** |
| `admin/users/page.tsx` | 2.2 only (hooks/components from 1.5) | **1** |
| each integration test | 2.3 only (fixtures from 1.6) | **1** |
| `advanced-cache.ts` | 1.4 (ai-3 + ai-4 bundled if approved) | **1** |
| `logger.ts` | 1.2 (covers ~210 call sites) | **1** |

---

## One-line sequence

**0** delete dead code + fix docs + dep cleanup + answer the 5 decisions → **1** types → logger→Sentry → backend primitives → isolated lib fixes → frontend primitives → test fixtures → **2** route sweep → page sweep → test sweep → heavy-file decomposition → **3** E2E → RLS → standalone deferred.

Start at **0.1** (delete dead code) and **0.4** (get the five decisions answered) in parallel — neither blocks the other, and 0.4's answers are needed before Stage 2 begins.
