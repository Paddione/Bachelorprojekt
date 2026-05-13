#!/usr/bin/env bash
# scripts/dev-db-refresh.sh
# Restore the latest prod backup of (website, bugs, bachelorprojekt) into
# the dev k3d cluster's shared-db-dev. Two run modes:
#   - As the dev-db-refresh CronJob pod on $DEV_NODE: PGHOST=127.0.0.1
#     PGPORT=15432 BACKUP_DIR=/backups (mounted from prod backup-pvc).
#   - Locally via `task dev:db:refresh`: BACKUP_DIR points to a tempdir
#     `kubectl cp`d from the prod backup pod.
set -euo pipefail

: "${BACKUP_DIR:=/backups}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE required}"
: "${DEV_SHARED_DB_PASSWORD:?DEV_SHARED_DB_PASSWORD required}"
: "${DEV_WEBSITE_DB_PASSWORD:?DEV_WEBSITE_DB_PASSWORD required}"
: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=15432}"

DBS=("website" "bugs" "bachelorprojekt")
STAMP=$(ls -1 "$BACKUP_DIR" | sort -r | head -1)
if [[ -z "$STAMP" ]]; then
  echo "No backups found in $BACKUP_DIR — bailing." >&2
  exit 1
fi
echo "[dev-refresh] using snapshot $STAMP"

export PGPASSWORD="$DEV_SHARED_DB_PASSWORD"

for DB in "${DBS[@]}"; do
  SRC="$BACKUP_DIR/$STAMP/${DB}.dump.enc"
  if [[ ! -f "$SRC" ]]; then
    echo "[dev-refresh] skip $DB — no $SRC"
    continue
  fi
  echo "[dev-refresh] restoring $DB"
  psql -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<-SQL
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();
    DROP DATABASE IF EXISTS "$DB";
    CREATE DATABASE "$DB" OWNER website;
SQL
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -pass env:BACKUP_PASSPHRASE -in "$SRC" \
    | pg_restore -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" --no-owner --role=website --clean --if-exists
done

# Re-align role password (in case the prod dump altered the role definition).
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<-SQL
  ALTER ROLE website WITH PASSWORD '${DEV_WEBSITE_DB_PASSWORD}';
SQL

echo "[dev-refresh] done."
