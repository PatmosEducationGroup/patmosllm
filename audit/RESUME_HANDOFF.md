# RESUME / HANDOFF — pick up here

**Last updated:** 2026-06-19 (end of session)
Single entry point to resume. Both major jobs from this session are **DONE & deployed**:
(1) **DB backups + gh-auth persistence** ✅, (2) **invitation unification** ✅ deployed to prod.
Only small USER follow-ups remain — see the box below.

---

## ⏯️ PICK UP HERE — remaining follow-ups (all USER-side / optional)

**Invitation unification (just deployed `a3d5a98` to `main`):**
1. **Verify live** on multiplytools.app once Vercel finishes: send a user invitation → open the
   link → complete signup (full round-trip; was not smoke-tested pre-deploy since `runx dev` hits
   the same prod DB/Resend anyway).
2. **Step C — purge old placeholder rows** the broken path left in `users`:
   ```sql
   SELECT id, email, created_at FROM users
   WHERE auth_user_id IS NULL AND invitation_token IS NOT NULL;
   -- eyeball, then DELETE those rows (stranded log rows cascade via the new FK)
   ```
   Current admin invites don't create these, so returned rows are safe stale placeholders.
3. **CI note:** `main` CI runs the full suite incl. the ~18 pre-existing failing tests (roadmap soft
   spot). If Actions goes red, confirm it's those, not this change (my touched tests pass).
4. **`schema.md` doc update** (CLAUDE can do): document `user_sent_invitations_log.invitation_token_id`
   + mark legacy `users.invitation_token` / `invitation_expires_at` / `invitation_sent_at` deprecated.
   — pending; offered, not yet done.

**DB backups — DONE & VERIFIED (no action left):** gh-auth-from-vault works; branch merged to `main`;
weekly schema workflow's first run committed `db/schema.sql` (4309 lines) and auto-runs Sundays 06:00 UTC.

### Why we restarted (gh-auth persistence) — DO NOT put the token in the Dockerfile
A token in the Dockerfile leaks into image layers + git = breaks the secret-isolation model, and it's the wrong layer (gh auth is a *runtime* cred). The container is **already** built to load gh creds from the mounted secrets vault on every start (`entrypoint` copies `$SRC/gh` → `/etc/runner-secrets/gh`; `run-as-runner` sets `GH_CONFIG_DIR` there). Because the vault is a Mac-side mount, this is **rebuild-proof with no image/Dockerfile change**.

**The one-time setup (user did / was doing on the Mac before restart):**
1. Created a **fine-grained PAT** scoped to the `patmosllm` repo: Contents R/W + Workflows R/W.
2. Wrote it into the vault:
   ```bash
   mkdir -p "/Users/ecc311/secrets/multiplytools/gh"
   GH_CONFIG_DIR="/Users/ecc311/secrets/multiplytools/gh" gh auth login --hostname github.com --git-protocol https
   # chose "Paste an authentication token"
   ```
3. Restarted the container (VS Code "Rebuild/Reopen" or `docker compose -f .devcontainer/docker-compose.yml restart`) so the entrypoint copies the creds in.

---

## DB BACKUPS — status

**Job 1 — local full backup: DONE + scheduled + verified.**
- Branch `chore/db-backups`, commit `7474725` (5 files), **committed, NOT pushed.**
- Files: `scripts/backup-db-local.sh` (full schema+data: `pg_dump | gzip` + sha256 + retention 8), `scripts/backup-db-schema.sh` (schema-only DDL for CI), `.github/workflows/db-backup-schema.yml` (weekly schema → `db/schema.sql`), `scripts/launchd/app.multiplytools.dbbackup.weekly.plist`, `scripts/BACKUP.md`.
- launchd job installed at `~/Library/LaunchAgents/`, runs **Fri 06:00** (or next wake), output → `/Users/ecc311/projects/Database Backups/Multiplytools/`. Test run verified a 21 MB dump landed there.
- **Connection:** script reads discrete libpq vars (`PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`) from the secrets `.env` (NOT a URL — a URL mangled the password). Supabase **session pooler** (`aws-1-us-east-2.pooler.supabase.com:5432`, user `postgres.wxcvjiytvttjysbtghlr`). **DB password was reset to alphanumeric-only.** pg_dump = brew `postgresql@17` (pinned via PATH in the script); the user's *other* pg_dump cron uses pg14 and was left untouched.
- Key fact: the Next.js app uses Supabase API keys, **not** the DB password — so the reset didn't affect the app.

**Job 2 — GitHub weekly schema automation: ✅ DONE + VERIFIED 2026-06-19.**
First green run committed `db/schema.sql` (4309 lines) to `main` (`922eae5`). Auto-runs
Sundays 06:00 UTC. Two bugs fixed along the way: (a) `git diff` ignores untracked files
→ first run committed nothing (fixed: `git add` before `diff --cached`); (b) runner's
default `pg_dump` is v16, aborts vs the PG17 server → pinned v17 bindir via `$GITHUB_PATH`.
Also bumped `actions/checkout@v4`→`@v5` (Node 20 deprecation). Plus the user had a typo in
the `SUPABASE_DB_URL` secret host (`us-east2` → `us-east-2`), now corrected.

Original remaining steps (all now complete):
1. **PR `chore/db-backups` → `main` and merge** (a workflow only schedules/dispatches from the default branch). Merging triggers a harmless no-op Vercel redeploy (backup files only).
2. **Add repo secret** `SUPABASE_DB_URL` (Settings → Secrets → Actions). Value = session-pooler URL w/ the alphanumeric password (now safe unencoded):
   `postgresql://postgres.wxcvjiytvttjysbtghlr:PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres`
   (I cannot add this — needs the password value. User-only.)
3. **Actions → "Weekly DB Schema Backup" → Run workflow** on `main`. (workflow_dispatch can't be triggered from the container — user clicks it.) Workflow uses `POSTGRES_MAJOR: "17"` (matches server 17.6).
4. **Verify** `db/schema.sql` appears on `main` and the run is green.

---

## Git state (end of 2026-06-19 session)
- Base: `main` @ `a3d5a98` (pushed; Vercel auto-deploys). History: `a3d5a98` invitation unify →
  `922eae5` weekly schema snapshot → `eafe4c6` pg_dump v17 pin → `6ec9271` schema-commit fix →
  `34d96a7` checkout@v5 → `4987f95` backup tooling merge (PR #2).
- `chore/db-backups`: MERGED to `main` (PR #2). `fix/invitation-unify` @ `a3d5a98`: MERGED to `main` (ff).
- `chore/centralize-chat-model`: 1 commit `ebb4a58` (model-constant refactor), **not pushed** — unrelated, leave for later.
- Untracked/not-ours (leave alone): `M .gitignore`, `M CLAUDE.md`, `.devcontainer/`, `.dockerignore`, root `*.html`, `scripts/enrich-document-sources.js`, `audit/` (these handoff docs — commit if you want them tracked).

---

## ✅ COMPLETED FEATURE: Invitation unification (deployed `a3d5a98` 2026-06-19)

> Status: Step A applied + Step B deployed to `main`. The plan below is kept for reference and
> for the remaining USER follow-ups (live verify + Step C purge) — see the PICK UP HERE box at top.

### Why
User self-invites are broken for everyone: they store the token in `users.invitation_token`, but every redemption path reads `invitation_tokens`. A signup trigger grants 3 invites; feature is live in settings nav → live + broken. Admin invites work. Evidence in `INVITATION_FIX_PLAN.md` + `AUDIT_FINDINGS.md` (svc-7).

### Decisions locked (2026-06-17)
- Fix end-to-end ✔ · migrate user path → `invitation_tokens` ✔ · retire dead routes + dedupe token gen ✔
- Q1 placeholder rows → **PURGE** · Q2 legacy columns → **mark deprecated, drop later**
- Implement step B on a **fresh branch `fix/invitation-unify`**.

### Step A — schema (USER runs in Supabase; snapshot first — now covered by the backup!)
```sql
ALTER TABLE user_sent_invitations_log
  ADD COLUMN IF NOT EXISTS invitation_token_id UUID
  REFERENCES invitation_tokens(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_invitations_token_id
  ON user_sent_invitations_log(invitation_token_id);
```

### Step B — ✅ CODE DONE 2026-06-19 (`fix/invitation-unify`, commit `a3d5a98`, NOT pushed)
Implemented all edits below; `npm run type-check` + `npm run lint` green; admin-invite test
passes (11/11) after dropping the removed-POST coverage. **NOT yet runtime-tested — blocked
on Step A** (the `invitation_token_id` column does NOT exist in the live DB per today's
schema dump, so the log insert/join will fail until the USER runs Step A). Notes discovered
via `db/schema.sql`: admin invites work because the UI POSTs to `/api/admin/invitations`
(plural, writes `invitation_tokens`); the singular `/api/admin/invite` POST + `resend` +
`/api/invite/[token]` were genuinely dead (no callers) and were removed. `invitation_tokens.email`
is UNIQUE → createInvitation deletes a stale invite before reusing the email (cascades to log
rows via Step A's FK).

**Original exact edits (all completed):**
1. `src/lib/invitation-service.ts` `createInvitation` (~line 44): dup-check `users` + `invitation_tokens`; insert into `invitation_tokens` (not `users`); no placeholder user row; insert log with `invitation_token_id`, `invited_user_id=NULL`; import `generateInvitationToken` from `@/lib/email`; delete local copy (`:121-125`).
2. `src/lib/invitation-service.ts` `getUserInvitations` (~line 160): join `invitation_tokens` via `invitation_token_id` for `token`/`expires_at`/`accepted_at` (replace the `invited_user_id(invitation_token)` join).
3. `src/app/api/auth/accept-invitation/route.ts` (after `:205`): also `UPDATE user_sent_invitations_log SET status='accepted', invited_user_id=createdUser.id, accepted_at=now() WHERE invitation_token_id = invitation.id`. **No quota change on accept.**
4. Retire dead routes: remove **POST** from `src/app/api/admin/invite/route.ts` (KEEP its GET + DELETE); delete `src/app/api/admin/invite/resend/route.ts`; delete `src/app/api/invite/[token]/route.ts` (KEEP the page `src/app/invite/[token]/page.tsx`).
5. Acceptance: `npm run type-check` + `npm run lint` green; admin flow unchanged; manual user-invite round-trip on `runx dev`.

### Step C — data purge (USER runs after B deploys + snapshot)
```sql
SELECT id, email, created_at FROM users
WHERE auth_user_id IS NULL AND invitation_token IS NOT NULL;
-- then delete those placeholder users rows + their stranded log rows
```

### Still required from USER
- Verify prod has `trigger_create_quota_on_signup`, the quota tables, and RPCs `increment_invites_used` / `expire_invitations_and_refund` / `grant_invites_to_user` / `grant_invites_to_all`. Defining `.sql` recoverable from git `b817a87:scripts/create-user-invitation-system.sql`.
- Run step A (before B deploy) and step C (after).
- Update `schema.md` for `invitation_tokens`, `user_sent_invitations_log` (+ new col), `user_invitation_quotas`; mark legacy `users.invitation_token`/`invitation_expires_at`/`invitation_sent_at` deprecated.

---

## Other open items (not blocking)
- **4o model spike:** on `gpt-4o-mini`; `CHAT_MODEL` constant centralized so upgrade is one line — run as a measured spike, not in the refactor.
- **RLS (auth-1):** Stage 3 project; preserve shared-read document downloads. See `EXECUTION_PLAN.md`.
- **Overall sequencing:** `EXECUTION_PLAN.md` is the rework-minimizing order.

---

## How to resume in one line
> "Container's back — run `runx push` for the backup branch and continue Job 2."
or
> "Backups are done; start the invitation fix (step B) on `fix/invitation-unify`."
