#!/usr/bin/env bats
# tests/spec/local-dev-mesh/db-backup-retention.bats — T900118
# SSOT: specs/local-dev-mesh.md, Requirement "The devmesh database is backed up daily"
# Pruefmodus: Ausfuehrung von scripts/devmesh/db-backup.sh gegen ein Temp-Verzeichnis,
# pg_dumpall als Stub.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/devmesh/db-backup.sh"
  FIX="$(mktemp -d)"; D="$FIX/backup"; mkdir -p "$D" "$FIX/bin"
}

teardown() { rm -rf "$FIX"; }

seed() { local i; for i in $(seq -w 1 "$1"); do : > "$D/shared-db-202001${i}T033000Z.sql.gz"; done; }
count() { find "$D" -maxdepth 1 -name 'shared-db-*.sql.gz' | wc -l; }

@test "15 Dumps: Pruning behaelt 14, der aelteste faellt weg" {
  seed 15
  run env BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT" --prune-only
  [ "$status" -eq 0 ]
  [ -e "$D/shared-db-20200115T033000Z.sql.gz" ]
  [ "$(count)" -eq 14 ]
  [ ! -e "$D/shared-db-20200101T033000Z.sql.gz" ]
}

@test "voller Lauf schreibt einen neuen Dump und haelt 14" {
  seed 14
  printf '#!/usr/bin/env bash\necho "-- dump"\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"
  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT"
  [ "$status" -eq 0 ]
  newest="$(find "$D" -maxdepth 1 -name 'shared-db-*.sql.gz' -printf '%f\n' | sort | tail -1)"
  gzip -dc "$D/$newest" | grep -qF -- '-- dump'
  [ "$(count)" -eq 14 ]
}

@test "scheitert pg_dumpall, bleibt kein Teil-Dump liegen und nichts wird geloescht" {
  seed 15
  printf '#!/usr/bin/env bash\nexit 1\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"
  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [ "$(count)" -eq 15 ]
  part="$(find "$D" -name '*.part' || true)"
  [ -z "$part" ]
}
