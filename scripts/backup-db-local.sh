#!/usr/bin/env bash
#
# backup-db-local.sh — FULL backup: complete schema + ALL data (contains PII).
#
# This is the real disaster-recovery backup. Output is gzip-compressed plain
# SQL plus a SHA-256 checksum, written to ./backups/ (gitignored — never
# committed). Designed to be run on the user's Mac, on demand or weekly via
# launchd. Restore with:  gunzip -c FILE.sql.gz | psql "$SUPABASE_DB_URL"
#
# Requires:  pg_dump, gzip, sha256sum/shasum (built-in)
# Requires:  SUPABASE_DB_URL  (direct or SESSION-pooler Postgres connection string)
#            — if not already in the environment, it is sourced from ENV_FILE.
#
# Usage:     ./scripts/backup-db-local.sh
#
set -euo pipefail

# --- locate repo root (so it works from launchd, which has no working dir) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- launchd has a minimal PATH; find a pg_dump that matches the server.
# Prefer postgresql@17 (exact match for Supabase's Postgres 17 — a 17-made dump
# restores cleanly into a 17 server), then fall back to libpq, then defaults.
# This only sets PATH inside THIS script's process — your global PATH and any
# other cron (which uses /opt/homebrew/bin/pg_dump) are untouched. ---
export PATH="/opt/homebrew/opt/postgresql@17/bin:/usr/local/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# --- load connection settings from the secrets file if not already set.
# Accepts EITHER a single SUPABASE_DB_URL, OR discrete libpq vars
# (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). The discrete form is preferred
# for passwords with special characters — PGPASSWORD is read literally, so no
# URL percent-encoding is needed. ---
ENV_FILE="${ENV_FILE:-/Users/ecc311/secrets/multiplytools/.env}"
if [[ -z "${SUPABASE_DB_URL:-}" && -z "${PGHOST:-}" && -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

if [[ -z "${SUPABASE_DB_URL:-}" && ( -z "${PGHOST:-}" || -z "${PGPASSWORD:-}" ) ]]; then
  echo "ERROR: no connection settings found in $ENV_FILE." >&2
  echo "       Provide SUPABASE_DB_URL, or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. macOS: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-8}"          # keep this many most-recent full dumps
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/full-db-backup-${STAMP}.sql.gz"

echo "Starting FULL database backup (schema + data) -> $OUT"
# --no-owner / --no-privileges keep the dump portable for restore into a fresh DB.
# Plain SQL piped through gzip = greppable, restorable with psql, uses only
# built-in tools. pipefail ensures a pg_dump failure aborts (no truncated file).
# Use the URL if given; otherwise pg_dump reads the PG* env vars automatically.
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges | gzip > "$OUT"
else
  pg_dump --no-owner --no-privileges | gzip > "$OUT"
fi

# --- checksum (sha256sum on Linux, shasum -a 256 on macOS) ---
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
else
  ( cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "Backup complete: $OUT (${SIZE})"
echo "Checksum:        ${OUT}.sha256"

# --- retention: delete oldest dumps beyond RETENTION (and their checksums) ---
echo "Applying retention: keeping newest $RETENTION full dumps."
ls -1t "$BACKUP_DIR"/full-db-backup-*.sql.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | while read -r old; do
  echo "  pruning $(basename "$old")"
  rm -f "$old" "$old.sha256"
done

echo "Done."
