#!/usr/bin/env bash
# scripts/staging-db-anonymize.sh
# Anonymize PII in a staging DB that was restored from a prod snapshot.
# Must be run AFTER dev-db-refresh.sh (or equivalent pg_restore).
# Exits 1 on any SQL error — caller (staging:up) must trap and delete NS.
#
# Required env:
#   PGHOST        — postgres host (default: 127.0.0.1)
#   PGPORT        — postgres port (default: exposed NodePort)
#   STAGING_DB_PASSWORD — password for the postgres superuser role
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:?PGPORT required}"
: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD required}"

export PGPASSWORD="$STAGING_DB_PASSWORD"

echo "[anonymize] anonymizing website DB..."
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d website -v ON_ERROR_STOP=1 <<-'SQL'
  -- Replace real email addresses with deterministic staging placeholders
  UPDATE users
    SET email = 'user-' || id || '@staging.local',
        name  = 'Staging User ' || id
    WHERE email NOT LIKE '%@staging.local';

  -- Wipe session tokens — no active sessions in staging
  DELETE FROM sessions;

  -- Wipe email verification tokens
  DELETE FROM email_verifications;

  -- Wipe password reset tokens
  DELETE FROM password_reset_tokens;

  -- Replace password hashes with a fake bcrypt placeholder
  -- (the real hash would still be valid for cracking; replace it)
  UPDATE users
    SET password_hash = '$2b$12$FAKEHASHFORSTAGIN.GENVIRONMENTsXXXXXXXXXXXXXXXXXXXXXXX';
SQL

echo "[anonymize] anonymizing bachelorprojekt DB..."
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d bachelorprojekt -v ON_ERROR_STOP=1 <<-'SQL'
  -- Scrub email addresses from ticket description text
  UPDATE tickets
    SET description = regexp_replace(
          description,
          '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
          '[email]',
          'g'
        )
    WHERE description ~ '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}';
SQL

echo "[anonymize] done."
