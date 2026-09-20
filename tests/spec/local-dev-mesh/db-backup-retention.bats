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
  printf '#!/usr/bin/env bash\nexit 0\n' > "$FIX/bin/pg_isready"; chmod +x "$FIX/bin/pg_isready"
  printf '#!/usr/bin/env bash\necho "-- dump"\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"
  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT"
  [ "$status" -eq 0 ]
  newest="$(find "$D" -maxdepth 1 -name 'shared-db-*.sql.gz' -printf '%f\n' | sort | tail -1)"
  gzip -dc "$D/$newest" | grep -qF -- '-- dump'
  [ "$(count)" -eq 14 ]
}

@test "scheitert pg_dumpall, bleibt kein Teil-Dump liegen und nichts wird geloescht" {
  seed 15
  printf '#!/usr/bin/env bash\nexit 0\n' > "$FIX/bin/pg_isready"; chmod +x "$FIX/bin/pg_isready"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"
  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [ "$(count)" -eq 15 ]
  part="$(find "$D" -name '*.part' || true)"
  [ -z "$part" ]
}

@test "T900240: wartet auf pg_isready statt beim Container-Netzwerk-Startup-Race sofort zu scheitern" {
  # Reproduziert den Fund aus T900240: der frisch gestartete Backup-Pod verbindet sich
  # sofort mit shared-db, bevor kube-proxy/CNI die Service-Routing-Regeln fuer die neue
  # Pod-Netns fertig synchronisiert hat -> "Connection refused" trotz gesunder DB.
  # Stub: pg_isready schlaegt zweimal fehl (rc=2, "nicht erreichbar"), erst der dritte
  # Aufruf meldet Bereitschaft (rc=0) -- wie beim echten Startup-Race Sekundenbruchteile
  # spaeter.
  seed 14
  ATTEMPTS_FILE="$FIX/pg_isready_attempts"
  : > "$ATTEMPTS_FILE"
  cat > "$FIX/bin/pg_isready" <<SCRIPT
#!/usr/bin/env bash
n=\$(wc -l < "$ATTEMPTS_FILE")
echo "attempt" >> "$ATTEMPTS_FILE"
if [ "\$n" -lt 2 ]; then
  exit 2
fi
exit 0
SCRIPT
  chmod +x "$FIX/bin/pg_isready"
  printf '#!/usr/bin/env bash\necho "-- dump"\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"

  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 DB_WAIT_SLEEP=0 bash "$SCRIPT"
  [ "$status" -eq 0 ]
  # pg_isready wurde mindestens 3x aufgerufen (2 Fehlschlaege + 1 Erfolg) -- der Dump
  # ist NICHT beim ersten Fehlschlag aufgegeben worden.
  attempts="$(wc -l < "$ATTEMPTS_FILE")"
  [ "$attempts" -ge 3 ]
  newest="$(find "$D" -maxdepth 1 -name 'shared-db-*.sql.gz' -printf '%f\n' | sort | tail -1)"
  gzip -dc "$D/$newest" | grep -qF -- '-- dump'
}

@test "T900240: gibt sauber auf, wenn pg_isready dauerhaft nicht bereit meldet" {
  seed 14
  printf '#!/usr/bin/env bash\nexit 2\n' > "$FIX/bin/pg_isready"; chmod +x "$FIX/bin/pg_isready"
  printf '#!/usr/bin/env bash\necho "-- dump"\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"

  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 DB_WAIT_SLEEP=0 DB_WAIT_ATTEMPTS=3 bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [ "$(count)" -eq 14 ]
  part="$(find "$D" -name '*.part' || true)"
  [ -z "$part" ]
}
