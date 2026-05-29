#!/usr/bin/env bash
# scripts/dev-db-refresh.sh
# Restore the latest prod data of (website, bugs, bachelorprojekt) into
# the dev k3d cluster's shared-db-dev. Two run modes, selected by whether
# SOURCE_PGHOST is set:
#
#   1. In-cluster CronJob mode (SOURCE_PGHOST set, e.g. "shared-db"):
#      Stream pg_dump from the live prod shared-db Service straight into the
#      dev k3d Postgres at PGHOST:PGPORT (127.0.0.1:15432 via hostNetwork).
#      No backup files, no Longhorn PVC — the dev-db-refresh pod is pinned to
#      $DEV_NODE (k3s-1) for the hostNetwork path, and k3s-1 has no Longhorn
#      CSI driver, so it CANNOT mount the RWO backup-pvc (T000286). Pulling
#      live over the cluster network sidesteps that entirely.
#
#   2. Local mode (SOURCE_PGHOST unset; `task dev:db:refresh`):
#      BACKUP_DIR points to a tempdir `kubectl cp`d from an ephemeral pod that
#      mounts the prod backup-pvc on a Longhorn-capable node. Decrypt + restore
#      the .dump.enc snapshot files.
set -euo pipefail

: "$${BACKUP_DIR:=/backups}"
: "$${DEV_SHARED_DB_PASSWORD:?DEV_SHARED_DB_PASSWORD required}"
: "$${DEV_WEBSITE_DB_PASSWORD:?DEV_WEBSITE_DB_PASSWORD required}"
: "$${PGHOST:=127.0.0.1}"
: "$${PGPORT:=15432}"
: "$${SOURCE_PGHOST:=}"
: "$${SOURCE_PGPORT:=5432}"

DBS=("website" "bugs" "bachelorprojekt")
export PGPASSWORD="$DEV_SHARED_DB_PASSWORD"

recreate_db() {
  local DB="$1"
  psql -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<-SQL
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();
    DROP DATABASE IF EXISTS "$DB";
    CREATE DATABASE "$DB" OWNER website;
SQL
}

if [[ -n "$SOURCE_PGHOST" ]]; then
  # ── Mode 1: live network dump from prod shared-db (CronJob) ──────────
  : "$${SOURCE_DB_PASSWORD:?SOURCE_DB_PASSWORD required in live-dump mode}"
  echo "[dev-refresh] live mode: streaming pg_dump from $SOURCE_PGHOST:$SOURCE_PGPORT"
  for DB in "$${DBS[@]}"; do
    # Skip databases that don't exist on the prod source (e.g. bugs,
    # bachelorprojekt may be absent — only present DBs are refreshed).
    if ! PGPASSWORD="$SOURCE_DB_PASSWORD" psql -h "$SOURCE_PGHOST" -p "$SOURCE_PGPORT" \
          -U "$DB" -d "$DB" -tAc 'SELECT 1' >/dev/null 2>&1; then
      echo "[dev-refresh] skip $DB — not present/reachable on source"
      continue
    fi
    echo "[dev-refresh] refreshing $DB (live)"
    recreate_db "$DB"
    PGPASSWORD="$SOURCE_DB_PASSWORD" pg_dump -Fc \
      -h "$SOURCE_PGHOST" -p "$SOURCE_PGPORT" -U "$DB" -d "$DB" \
      | pg_restore -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" \
          --no-owner --clean --if-exists
  done
else
  # ── Mode 2: decrypt + restore snapshot files (local task) ───────────
  : "$${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE required in file-restore mode}"
  STAMP=$(ls -1 "$BACKUP_DIR" | sort -r | head -1)
  if [[ -z "$STAMP" ]]; then
    echo "No backups found in $BACKUP_DIR — bailing." >&2
    exit 1
  fi
  echo "[dev-refresh] using snapshot $STAMP"
  for DB in "$${DBS[@]}"; do
    SRC="$BACKUP_DIR/$STAMP/$DB.dump.enc"
    if [[ ! -f "$SRC" ]]; then
      echo "[dev-refresh] skip $DB — no $SRC"
      continue
    fi
    echo "[dev-refresh] restoring $DB"
    recreate_db "$DB"
    # Must match the encrypt flags used by the prod db-backup CronJob exactly
    # (aes-256-cbc, -pbkdf2, -salt, default iter=10000). Any mismatch silently
    # derives the wrong key and pg_restore gets garbage.
    openssl enc -d -aes-256-cbc -pbkdf2 -salt \
      -pass env:BACKUP_PASSPHRASE -in "$SRC" \
      | pg_restore -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" --no-owner --clean --if-exists
  done
fi

# Re-align role password (in case the prod dump altered the role definition).
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<-SQL
  ALTER ROLE website WITH PASSWORD '$${DEV_WEBSITE_DB_PASSWORD}';
SQL

echo "[dev-refresh] done."
