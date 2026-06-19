#!/usr/bin/env bash
#
# backup-db-schema.sh — dump DATABASE SCHEMA ONLY (no data / no PII).
#
# Produces a deterministic DDL snapshot: tables, columns, indexes, RLS
# policies, functions, triggers, sequences, constraints — but ZERO rows.
# Safe to commit to git. Used by the weekly GitHub Actions workflow so that
# `git diff` becomes a structural-drift log of the database.
#
# Requires:  pg_dump (PostgreSQL client >= your Supabase server major version)
# Requires:  SUPABASE_DB_URL  (direct or SESSION-pooler Postgres connection string)
#
# Usage:     ./scripts/backup-db-schema.sh [output_file]
#            default output_file = db/schema.sql
#
set -euo pipefail

OUT="${1:-db/schema.sql}"
SCHEMAS="${BACKUP_SCHEMAS:-public}"   # space/comma separated; default app schema only

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL is not set." >&2
  echo "       Supabase -> Project Settings -> Database -> Connection string." >&2
  echo "       Use the DIRECT or SESSION-pooler string (port 5432), NOT the" >&2
  echo "       transaction pooler (6543) — pg_dump needs full feature support." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found on PATH." >&2
  echo "       macOS:  brew install libpq && brew link --force libpq" >&2
  echo "       Ubuntu: apt-get install postgresql-client-17" >&2
  exit 1
fi

# Build --schema flags from the SCHEMAS list.
schema_flags=()
for s in ${SCHEMAS//,/ }; do
  schema_flags+=(--schema="$s")
done

mkdir -p "$(dirname "$OUT")"

echo "Dumping schema (DDL only) for schema(s): ${SCHEMAS}"
# --schema-only  : no rows (no PII)
# --no-owner     : portable; no Supabase-specific role ownership noise
# --no-privileges: omit GRANT/REVOKE noise that churns the diff
# NOTE: intentionally no timestamp inside the file — the file changes ONLY when
# the schema changes, so each git commit is a real structural change.
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  "${schema_flags[@]}" \
  > "$OUT"

lines=$(wc -l < "$OUT" | tr -d ' ')
echo "Wrote $OUT (${lines} lines)."
