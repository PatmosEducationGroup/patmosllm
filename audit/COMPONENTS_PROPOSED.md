# Proposed Shared Primitives — MultiplyTools / patmosllm

Concrete extractions to shrink the codebase. Each entry: name · signature · responsibility · call sites replaced · estimated LOC saved · usage sketch. **No implementation yet** — proposals for review. Prefer a few well-named primitives over clever abstractions; every one preserves current behavior.

**Estimated total reduction: ~1,900–2,500 LOC** across API, services, hooks, components, and tests (excludes the ~700 LOC of pure dead-code deletion in Phase 1 and the 297 MB binary-corpus removal).

---

## 1. `withAuth` — route auth/role/rate-limit wrapper
*(api-2, auth-3, auth-4, api-9 · Phase 5)*

```ts
// src/lib/route-guard.ts
type Role = 'USER' | 'CONTRIBUTOR' | 'ADMIN' | 'SUPER_ADMIN'
type Handler<Ctx> = (req: NextRequest, user: User, ctx: Ctx) => Promise<Response>

export function withAuth<Ctx = unknown>(
  handler: Handler<Ctx>,
  opts?: {
    roles?: Role[]                                   // omit = any authenticated user
    rateLimit?: (id: string, role: Role) => Promise<{ success: boolean; retryAfter?: number }>
  }
): (req: NextRequest, ctx: Ctx) => Promise<Response>
```

**Responsibility:** `getCurrentUser()` → 401 if null → role check → 403 → optional rate-limit (after auth) → 429 → call `handler(req, user, ctx)`. Derives the `operation` log field from `method + pathname` (closes api-9). One auditable place for role logic.

**Replaces:** the auth/role/rate-limit triple in ~49 handlers (`upload/blob/route.ts:32-57`, `upload/process-blob/route.ts:30-68`, `ingest/route.ts:19`, `admin/documents/route.ts:18`, `admin/users/[userId]/route.ts:21-57`, …) + 57 inline role-array literals + 38 copies of the 401 block.
**LOC saved:** ~310–360 net (after the ~40 LOC wrapper).

```ts
export const POST = withAuth(
  async (req, user) => { /* … only the real work … */ },
  { roles: ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'], rateLimit: uploadRateLimit }
)
```
**Caveat:** apply route-by-route — status codes differ today (401/403/404; `useAdminAuth.ts:46` depends on 404). Preserve each route's exact response shape.

---

## 2. `parseBody` + shared Zod schemas
*(api-1, types-1 · Phase 4)*

```ts
// src/lib/schemas/index.ts
export const emailSchema = z.string().email().transform(s => s.toLowerCase())
export const roleSchema  = z.enum(['SUPER_ADMIN', 'ADMIN', 'CONTRIBUTOR', 'USER'])
export const uuidSchema  = z.string().uuid()

// src/lib/parse-body.ts
export async function parseBody<T extends z.ZodTypeAny>(
  req: NextRequest, schema: T
): Promise<{ data: z.infer<T> } | { error: Response }>   // error = 400 in the standard envelope
```

**Responsibility:** parse + validate request JSON at the boundary, returning typed data or a ready 400. Eliminates the implicit-`any` from `request.json()` and the hand-rolled `typeof`/null checks.
**Replaces:** ad-hoc validation in ~34 routes (`chat/route.ts:74`, `admin/invitations/route.ts:26`, `admin/users/[userId]/route.ts:30`, `user/update-profile/route.ts:24`, …); reuses `emailSchema`/`roleSchema`/`uuidSchema` instead of repeated literals.
**LOC saved:** net-neutral to slightly positive on lines, but replaces scattered checks with one declarative schema per route and removes the `any` body. Roll out with `.optional()`/`.passthrough()` first.

```ts
const Body = z.object({ email: emailSchema, role: roleSchema.default('USER'), sendEmail: z.boolean().default(true) })
const parsed = await parseBody(req, Body)
if ('error' in parsed) return parsed.error
const { email, role, sendEmail } = parsed.data   // fully typed
```

---

## 3. `DocumentRepository`
*(svc-5, api-4/svc-4, api-5 · Phase 5/10)*

```ts
// src/services/documentRepository.ts
export function insertDocument(record: DocumentRecord):
  Promise<{ document: Document | null; error: { code: string; message: string } | null }>
export function mapDocumentInsertError(code?: string): string   // 22P05 / 23505 / 23502 → user message
export function findExistingDocumentByPath(path: string): Promise<Document | null>
```

**Responsibility:** centralize the `documents` insert + Postgres-error-code mapping + existence check that's copy-pasted across the upload/save routes (22 query sites on this table).
**Replaces:** insert blocks at `upload/process/route.ts:229-263`, `upload/process-blob/route.ts:305`, `upload/blob/route.ts:373`, `scrape-website/save`; the error mapping at `process/route.ts:239`; the existence check at `process-blob/route.ts:103`.
**LOC saved:** ~60–80. **Caveat:** preserve exact error messages + `download_enabled` default (true).

---

## 4. `UserRepository`
*(svc-6, svc-8, auth-4, auth-8 · Phase 5)*

```ts
// src/services/userRepository.ts
export function getUserByAuthId(authUserId: string): Promise<User | null>
export function findUserByEmail(email: string): Promise<Pick<User,'id'|'email'> | null>  // maybeSingle
export function updateUserProfile(id: string, fields: Partial<User>): Promise<User | null>
export function findAuthUserByEmail(email: string): Promise<{ id: string; last_sign_in_at: string | null } | null>
export function deleteOrphanedAuthUser(email: string): Promise<void>   // guarded by !last_sign_in_at
```

**Responsibility:** single home for the 38 scattered `users` queries, the two divergent duplicate-email guards, and the 3 O(all-users) orphan-cleanup blocks.
**Replaces:** `auth.ts:34-39`, `middleware.ts:115`, `admin/invitations/route.ts:45-49` & `:128-144` & `:466-472`, `invitation-service.ts:55-59`, `auth/accept-invitation/route.ts:85-88`, `user/update-profile/route.ts:50,69`.
**LOC saved:** ~70–80. **Caveat:** `getUserByAuthId` is on the auth hot path — `.single()`↔`.maybeSingle()` semantics differ; standardize on `maybeSingle`. `findAuthUserByEmail` should paginate (fixes auth-8 correctness bug).

---

## 5. `StreamingService` + `createServerAuthClient`
*(svc-9, svc-3, auth-4 · Phase 5/10)*

```ts
// src/services/streamingService.ts
export function sseEvent(type: 'sources'|'chunk'|'complete'|'document'|'error', payload: unknown): Uint8Array
export function jsonStream(events: AsyncIterable<...>): ReadableStream

// src/lib/supabase-server-auth.ts
export function createServerAuthClient(): Promise<SupabaseClient>  // the cookie-bridge, once
```

**Responsibility:** `sseEvent` removes the ~9 repeated `controller.enqueue(encoder.encode(\`data: ${JSON.stringify(...)}\n\n\`))` lines and the 3 near-identical short-circuit `ReadableStream` blocks (`chat/route.ts:133-159, 260-285`). `createServerAuthClient` removes the cookie-bridge boilerplate duplicated 3× (`auth.ts:11-24`, `auth-helpers.ts:17,43` — latter deleted in P1).
**LOC saved:** ~45 combined. **Caveat:** SSE wire format must be byte-preserved for the client.

---

## 6. `useApiResource` + `useApiMutation` (React hooks)
*(ui-3 · Phase 6)*

```ts
// src/hooks/useApiResource.ts
export function useApiResource<T>(url: string, opts?: { auto?: boolean; deps?: unknown[] }):
  { data: T | null; loading: boolean; error: string | null; reload: () => Promise<void>; setData: (t: T) => void }

// src/hooks/useApiMutation.ts
export function useApiMutation<TReq, TRes>(url: string, method?: 'POST'|'PATCH'|'DELETE'):
  { mutate: (body: TReq) => Promise<TRes | null>; saving: boolean; error: string | null }
```

**Responsibility:** centralize the `fetch → !ok throw → data.success check → logError → setError → finally setLoading(false)` cycle copy-pasted ~30×.
**Replaces:** `loadX`/save handlers in `admin/users/page.tsx:141`, `admin/uploaded-documents`, `scraped-webpages`, `invitation-quotas`, `settings/profile:53-88`, `email-preferences:40-67`, `delete-account:41-71`. Each `loadX` 25→3 lines.
**LOC saved:** ~250–350. **Caveat:** bespoke callers (users merges two endpoints; uploaded-documents passes pagination) keep custom logic or use the `reload`/`deps` escape hatches.

```ts
const { data: users, loading, error, reload } = useApiResource<User[]>('/api/admin/users')
const { mutate: saveProfile, saving } = useApiMutation<ProfileInput, Profile>('/api/user/update-profile')
```

---

## 7. `useTableSort` (React hook)
*(ui-4, ui-5 · Phase 6)*

```ts
// src/hooks/useTableSort.ts
export function useTableSort<T>(rows: T[], opts: { initialField?: keyof T; accessors?: Partial<Record<keyof T,(r:T)=>unknown>> }):
  { sorted: T[]; sortField: keyof T | null; sortDirection: 'asc'|'desc'; handleSort: (field: keyof T) => void }
```

**Responsibility:** the sort state machine + comparator (string/number/boolean, `localeCompare`) currently re-implemented per table.
**Replaces:** `admin/users/page.tsx:430-489` (incl. local `SortIcon`), `uploaded-documents/page.tsx:128-184`, `scraped-webpages/page.tsx`. Pairs with adopting the existing `SortableTableHeader`.
**LOC saved:** ~50/page (~150 total).

---

## 8. `<FormField>` + `<PageLoading>`
*(ui-7, ui-8 · Phase 6)*

```tsx
// src/components/ui/FormField.tsx  (or just standardize on existing ui/Input + ui/Checkbox + ui/Textarea)
export function FormField(props: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode }): JSX.Element
// src/components/ui/PageLoading.tsx
export function PageLoading({ label }: { label?: string }): JSX.Element
```

**Responsibility:** kill the repeated `<label className="block text-sm font-medium…"> + <input className="w-full px-4 py-2 border…">` markup and the hand-rolled `flex items-center justify-center min-h-[400px]` loaders.
**Replaces:** form markup in `settings/profile:347-446` (5×), `email-preferences:148-230` (4 checkboxes), `delete-account:433`, `chat/ChatModals.tsx:37-205` (6×); loaders at `profile:206`, `email-preferences:111`, `delete-account:189`.
**LOC saved:** ~120–180 (forms) + ~30 (loaders). **Caveat:** `admin/users:561` already uses `ui/Input` — preferred path is *adopt the existing primitives*; `<FormField>` only if a label/hint/error wrapper adds value. ChatModals glassmorphism needs an `ui/Input` `variant`.

> **Adoption, not new components:** the existing `components/admin/*` (Pagination, SearchInput, SortableTableHeader, StatusBadge, DeleteConfirmationModal) and `components/ui/*` already cover most needs but are used by only 2 of 6 admin pages. Much of the UI shrink is wiring existing primitives into `admin/users` and the settings/chat forms — not building new ones.

---

## 9. Test fixtures — `tests/helpers/mocks.ts`
*(test-3, test-4 · Phase 7)*

```ts
// use vi.hoisted() so factories are import-safe under vi.mock hoisting
export const mockUser = (o?: Partial<User>) => ({ id:'u1', role:'ADMIN', ...o })
export const mockLogger = () => ({ info:vi.fn(), error:vi.fn(), logError:vi.fn(), loggers:{ performance:..., database:..., security:... } })
export const mockRateLimit = () => ({ /* success path */ })
export const mockIdentifier = () => 'test-identifier-123'
export const mockSanitizer = () => ({ sanitizeInput:(s:string)=>s, sanitizeEmail:(s:string)=>s })
export const mockSupabaseTable = (dataByTable: Record<string, unknown>) => /* synth select/eq/single/order thenables */
export const makeJsonRequest = (body: unknown) => new Request(...)
export const makeFormDataRequest = (fields: Record<string,unknown>) => new Request(...)
```

**Responsibility:** one source of truth for the user/logger/rate-limit/supabase mock shapes hand-rolled in each of the 4 integration tests; makes the 8 skipped error-path tests (test-4) 3–5 lines each.
**Replaces:** ~100–130 LOC of mock setup × 4 files (`admin-invite`/`upload-blob`/`documents`/`chat`.integration.test.ts).
**LOC saved:** ~225 (~11% of the 2,071-line integration corpus).

---

### Summary table

| Primitive | Phase | Replaces (sites) | Est. LOC saved |
|-----------|-------|------------------|----------------|
| `withAuth` | 5 | ~49 handlers + 57 role literals | ~310–360 |
| `parseBody` + schemas | 4 | ~34 routes (removes `any` bodies) | net-neutral, kills `any` |
| `DocumentRepository` | 5/10 | 4 insert blocks + error map | ~60–80 |
| `UserRepository` | 5 | 38 query sites, 2 email guards, 3 orphan blocks | ~70–80 |
| `StreamingService` + `createServerAuthClient` | 5/10 | ~9 SSE lines, 3 stream blocks, 3 cookie bridges | ~45 |
| `useApiResource`/`useApiMutation` | 6 | ~30 fetch/error cycles | ~250–350 |
| `useTableSort` | 6 | 3 table pages | ~150 |
| `<FormField>`/`<PageLoading>` (+ adopt ui/*) | 6 | ~15 forms, 3 loaders | ~150–210 |
| `tests/helpers/mocks.ts` | 7 | 4 integration tests | ~225 |
| **Total** | | | **~1,300–1,500 LOC** (+ dead-code deletion ~700 in P1) |
