# Database Backups

Two independent backups, split to preserve GDPR posture:

| Backup | What | Where | Schedule | Contains PII? |
|--------|------|-------|----------|---------------|
| **Schema (GitHub)** | DDL only — tables, RLS, functions, triggers | `db/schema.sql` (committed) | GitHub Actions, Sun 06:00 UTC | **No** |
| **Full (local)** | Schema **+ all data** | `backups/*.sql.gz` (gitignored) | Mac launchd, Sun 03:00 local | **Yes** — never commit |

Both need `SUPABASE_DB_URL` = a **direct or session-pooler** Postgres connection
string (port 5432). Not the transaction pooler (6543). For GitHub Actions use the
**session pooler** string (IPv4-friendly; runners are IPv4-only).

## One-time setup

**GitHub schema backup**
1. Repo → Settings → Secrets and variables → Actions → New secret: `SUPABASE_DB_URL` (session-pooler string).
2. In `.github/workflows/db-backup-schema.yml`, set `POSTGRES_MAJOR` to your Supabase Postgres major version.
3. Trigger once via Actions tab → "Weekly DB Schema Backup" → Run workflow.

**Local full backup (Mac)**
1. `brew install libpq && brew link --force libpq`  (provides `pg_dump`)
2. Add `SUPABASE_DB_URL=...` to `/Users/ecc311/secrets/multiplytools/.env`.
3. Run once now:  `./scripts/backup-db-local.sh`
4. Schedule it: edit `scripts/launchd/app.multiplytools.dbbackup.weekly.plist`
   (set the absolute path to the script), copy to `~/Library/LaunchAgents/`,
   then `launchctl load ~/Library/LaunchAgents/app.multiplytools.dbbackup.weekly.plist`.

## Restore

```bash
# verify integrity first
cd backups && sha256sum -c full-db-backup-YYYYMMDDTHHMMSSZ.sql.gz.sha256

# restore full backup into a target database
gunzip -c full-db-backup-YYYYMMDDTHHMMSSZ.sql.gz | psql "$SUPABASE_DB_URL"
```

Restore into a **scratch/staging** project first to validate before ever
touching production. Retention: the local script keeps the newest 8 dumps
(`BACKUP_RETENTION` env to change).
