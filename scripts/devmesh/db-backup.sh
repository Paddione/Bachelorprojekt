#!/usr/bin/env bash
# scripts/devmesh/db-backup.sh — taeglicher pg_dumpall der devmesh-shared-db [T900118].
# Laeuft im CronJob shared-db-backup (dev-local/core/shared-db-backup.yaml, per
# configMapGenerator eingebunden) auf dem storage=true-Knoten.
#
# Aufruf: db-backup.sh [--prune-only]
# Env:    BACKUP_DIR (/backup), RETAIN (14), PGHOST/PGUSER/PGPASSWORD fuer pg_dumpall
# Exit:   0 ok; != 0 Dump fehlgeschlagen — dann wird nichts geloescht
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backup}"
RETAIN="${RETAIN:-14}"
PART=""
trap 'if [[ -n "$PART" ]]; then rm -f -- "$PART"; fi' EXIT

if [[ "${1:-}" != "--prune-only" ]]; then
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
