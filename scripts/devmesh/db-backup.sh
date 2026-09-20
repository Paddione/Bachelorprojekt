#!/usr/bin/env bash
# scripts/devmesh/db-backup.sh — taeglicher pg_dumpall der devmesh-shared-db [T900118].
# Laeuft im CronJob shared-db-backup (dev-local/core/shared-db-backup.yaml, per
# configMapGenerator eingebunden) auf dem storage=true-Knoten.
#
# Aufruf: db-backup.sh [--prune-only]
# Env:    BACKUP_DIR (/backup), RETAIN (14), PGHOST/PGUSER/PGPASSWORD fuer pg_dumpall
#         DB_WAIT_ATTEMPTS (10), DB_WAIT_SLEEP (2) -- pg_isready-Retry vor dem Dump [T900240]
# Exit:   0 ok; != 0 Dump fehlgeschlagen (inkl. DB nach Wartebudget nicht erreichbar) —
#         dann wird nichts geloescht
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backup}"
RETAIN="${RETAIN:-14}"
PGHOST="${PGHOST:-shared-db}"
PGUSER="${PGUSER:-postgres}"
DB_WAIT_ATTEMPTS="${DB_WAIT_ATTEMPTS:-10}"
DB_WAIT_SLEEP="${DB_WAIT_SLEEP:-2}"
PART=""
trap 'if [[ -n "$PART" ]]; then rm -f -- "$PART"; fi' EXIT

if [[ "${1:-}" != "--prune-only" ]]; then
  # Startup-Netzwerk-Race (T900240): ein frisch gestarteter Job-Pod kann sich in den
  # ersten Sekunden noch nicht mit dem ClusterIP-Service verbinden, weil kube-proxy/CNI
  # die Service-Routing-Regeln fuer die neue Pod-Netns noch nicht synchronisiert haben.
  # Auf DB-Bereitschaft warten statt beim ersten Fehlschlag sofort aufzugeben.
  ready=0
  for (( attempt = 1; attempt <= DB_WAIT_ATTEMPTS; attempt++ )); do
    if pg_isready -h "$PGHOST" -U "$PGUSER" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep "$DB_WAIT_SLEEP"
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "db-backup: $PGHOST nicht erreichbar nach $DB_WAIT_ATTEMPTS Versuchen (a ${DB_WAIT_SLEEP}s) — Abbruch" >&2
    exit 1
  fi

  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  PART="$BACKUP_DIR/.shared-db-$stamp.sql.gz.part"
  pg_dumpall --clean --if-exists | gzip > "$PART"
  mv -- "$PART" "$BACKUP_DIR/shared-db-$stamp.sql.gz"
  PART=""
  echo "dump: shared-db-$stamp.sql.gz"
fi

# Dateinamen tragen den UTC-Zeitstempel: lexikalische Sortierung ist chronologisch.
mapfile -t dumps < <(find "$BACKUP_DIR" -maxdepth 1 -name 'shared-db-*.sql.gz' -printf '%f\n' | sort)
excess=$(( ${#dumps[@]} - RETAIN ))
for (( i = 0; i < excess; i++ )); do
  rm -f -- "$BACKUP_DIR/${dumps[$i]}"
  echo "pruned: ${dumps[$i]}"
done
echo "retained: $(find "$BACKUP_DIR" -maxdepth 1 -name 'shared-db-*.sql.gz' | wc -l)"
