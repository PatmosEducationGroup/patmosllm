# Invitation Fix — Execution & Migration Plan (STOP-AND-PLAN)

**Decisions taken (2026-06-17):** (1) Fix the user self-invite feature to work end-to-end; (2) migrate the user path onto the canonical `invitation_tokens` store; (3) also retire the dead routes and dedupe the token generator.

**Why this is stop-and-plan:** it requires a schema change + a data migration, and there is no migration tool. I (`dev`) have **no DB access** — the SQL below must be run by you in the Supabase SQL Editor (or via `runx` if whitelisted). I will make all the **code** changes on a branch.

---

## Verified current state

| | Admin invites (✅ works) | User self-invites (🔴 broken) |
|---|---|---|
| Create | `admin/invitations/route.ts:163` → **`invitation_tokens`** | `invitation-service.ts:70` → **`users.invitation_token`** + placeholder `users` row + `user_sent_invitations_log` |
| Email | `auth.admin.inviteUserByEmail`, redirect `/invite/{token}/accept` (`route.ts:207`) | `sendInvitationEmail` → link `/invite/{token}` (`email.ts:19`) |
| Validate | `/api/invite/{token}/validate` reads **`invitation_tokens`** (`validate/route.ts:25`) | same endpoint — token not in `invitation_tokens` → **fails** |
| Accept | `accept-invitation` reads **`invitation_tokens`**, marks `accepted_at` (`accept-invitation/route.ts:42,205`) | never reached; even if it were, reads the wrong table |

**Root cause:** user invites store the token in `users.invitation_token`, but **every redemption path reads `invitation_tokens`.** The only route that reads `users.invitation_token` (`GET /api/invite/[token]`) is dead (nothing links to it).

**Severity:** `trigger_create_quota_on_signup` grants every user 3 invites by default; the feature is linked in the settings nav (`settings/layout.tsx:91`). So it is **live and broken for every user**, not dormant. *(Confirm the trigger exists in prod — I can't query the DB.)*

**Recovered schema facts (from git `b817a87:scripts/create-user-invitation-system.sql`):**
- `user_sent_invitations_log.invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL` — **nullable**, set on acceptance.
- `user_invitation_quotas.invites_remaining` is a GENERATED column; quota model = increment on SEND, refund on EXPIRE, no change on ACCEPT (per `scripts/APPLY-INVITATION-QUOTA-FIX.md`).
- `expire_invitations_and_refund()` touches only the log + quota tables — **independent of the token store** (no change needed).
- `accept_invitation_and_link(p_invitation_id, p_invitee_user_id)` RPC exists but is **orphaned** (not called by `src`) — the TS accept route replaced it.

---

## Target design

User self-invites write to **`invitation_tokens`** exactly like admin invites, and stop creating placeholder `users` rows. The `user_sent_invitations_log` + quota system stays (it's the per-user quota ledger), but links to the invitation via a new `invitation_token_id` FK instead of a placeholder user. The existing email link `/invite/{token}` already works once the token lives in `invitation_tokens` (the page validates `invitation_tokens` → redirects to `/accept`), so **no email change is needed.**

---

## Change set

### A. Schema migration — *you run in Supabase (snapshot first, per hard rule #9)*

```sql
-- 1) Snapshot first (pg_dump or a Supabase backup point).

-- 2) Link the quota log to the canonical invitation store.
ALTER TABLE user_sent_invitations_log
  ADD COLUMN IF NOT EXISTS invitation_token_id UUID
  REFERENCES invitation_tokens(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_invitations_token_id
  ON user_sent_invitations_log(invitation_token_id);
```
- Additive and safe; existing rows get `invitation_token_id = NULL`.
- **Defer** dropping `users.invitation_token` / `invitation_expires_at` / `invitation_sent_at` — mark deprecated now, drop in a later cleanup once verified unused. (See open decision Q2.)

### B. Code changes — *I do on a branch (behavior-preserving for the admin path)*

1. **`src/lib/invitation-service.ts` — `createInvitation`**
   - Duplicate-check **both** `users` (by email) and `invitation_tokens` (pending), mirroring `admin/invitations/route.ts:45-70`.
   - Insert into **`invitation_tokens`** (`email,name,role,token,invited_by,expires_at`) — return its `id`. **Remove the placeholder `users` insert.**
   - Insert `user_sent_invitations_log` with `invitation_token_id = <new id>`, `invited_user_id = NULL`.
   - Import `generateInvitationToken` from `@/lib/email`; **delete the local copy** (`:121-125`) → dedupe.
   - Keep the `sendInvitationEmail` call (email link `/invite/{token}` now resolves correctly).

2. **`src/lib/invitation-service.ts` — `getUserInvitations`**
   - Replace the `invited_user:invited_user_id(invitation_token)` join with a join on **`invitation_tokens`** via `invitation_token_id` to surface `token`, `expires_at`, `accepted_at`.

3. **`src/app/api/auth/accept-invitation/route.ts`**
   - After marking `invitation_tokens.accepted_at` (`:205`), also update the matching `user_sent_invitations_log` row (`WHERE invitation_token_id = invitation.id`): set `status='accepted'`, `invited_user_id = createdUser.id`, `accepted_at = now()`. **Do not change quota** (already counted on send). This keeps the sender's "sent invitations" list + the expire-refund logic correct (otherwise an accepted user-invite stays `pending` and gets wrongly refunded on expiry).

4. **Retire dead routes (decision #3):**
   - Delete the **POST** handler in `src/app/api/admin/invite/route.ts` (keep its live `GET` = active-user list and `DELETE` = user delete).
   - Delete `src/app/api/admin/invite/resend/route.ts` (POST, no UI caller).
   - Delete the dead `src/app/api/invite/[token]/route.ts` (legacy `GET`, reads `users.invitation_token`; nothing routes to it). **Keep** the page `src/app/invite/[token]/page.tsx` (live email landing → calls `/validate`).

5. **Token generator dedupe:** single definition in `@/lib/email`; `invitation-service.ts` imports it (done in B1).

### C. Data migration — *you run in Supabase (after A+B deployed)* — see open decision Q1
Existing placeholder users + stranded log rows from the broken feature:
```sql
-- Inspect first:
SELECT u.id, u.email, u.created_at
FROM users u
WHERE u.auth_user_id IS NULL AND u.invitation_token IS NOT NULL;
-- (these are placeholder rows from user self-invites that were never redeemable)
```
Recommended (Q1 = purge): delete those placeholder `users` rows (their log rows' `invited_user_id` becomes NULL via `ON DELETE SET NULL`; optionally also delete their `user_sent_invitations_log` rows since those invites can't be salvaged — they have no `invitation_token_id`). Verify none accidentally became real accounts (all have `auth_user_id IS NULL`, so none did).

---

## Sequencing (no-break order)
1. **A (schema add)** — additive, safe, deploy first. Old code ignores the new column.
2. **B (code)** — deploy on a branch; once live, new user-invites use `invitation_tokens`.
3. **C (data cleanup)** — after B is live, purge the now-unreachable placeholder rows.
4. **schema.md** — document `invitation_tokens`, `user_sent_invitations_log` (+ new column), `user_invitation_quotas` (currently undocumented — types-4/doc-gap).

## Acceptance criteria
- `npm run type-check` + `npm run lint` green.
- Manual (against a test env, `runx dev`): user with quota → send invite → received email link `/invite/{token}` → validates → `/accept` → account created → `accept-invitation` marks both `invitation_tokens.accepted_at` and the log row `accepted`; sender's quota decremented on send, **unchanged** on accept; an unaccepted invite refunds quota on expiry.
- Admin invite flow **unchanged** (regression check).
- Dead routes return 404/405; no remaining caller of `users.invitation_token`.

## Rollback
- **Code:** revert the branch commit (admin path untouched, so safe).
- **Schema:** the added column is additive — leaving it is harmless; or `ALTER TABLE ... DROP COLUMN invitation_token_id`. Snapshot from step A1 is the hard rollback.
- **Data:** purge (C) is destructive — only run after B is verified and a snapshot exists.

---

## Resolved decisions (2026-06-17)
- **Q1 — placeholder-row disposition: PURGE.** Delete `auth_user_id IS NULL AND invitation_token IS NOT NULL` users + their stranded `user_sent_invitations_log` rows (step C). None are real accounts. Senders' quota refunds naturally on expiry.
- **Q2 — legacy columns: MARK DEPRECATED, DROP LATER.** Leave `users.invitation_token` / `invitation_expires_at` / `invitation_sent_at` in place (unused after fix); schema migration A does **not** drop them. Add a `-- DEPRECATED (unused after invitation unification, 2026-06-17)` note in `schema.md`; drop in a later cleanup once verified.

## Still required from you before/around execution
- **Prod check (you, since I can't query the DB):** confirm `trigger_create_quota_on_signup`, the quota tables, and the RPCs (`increment_invites_used`, `expire_invitations_and_refund`, `grant_invites_*`) actually exist in production. The `.sql` files were deleted from the repo (recoverable only from git history at `b817a87`); current prod state must be verified before running the migration.
- **Run SQL:** step A (schema add) before code deploy; step C (purge) after code deploy + snapshot.
