#!/usr/bin/env bats
# T003277 — Dispatch-Mitschnitt: Schema und Aufraeum-Task.
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Die Schema-Tests fuehren die
# Migration gegen eine echte Datenbank aus und pruefen deren Zustand; der
# Task-Test prueft die Ausgabe von `task`, nicht den Inhalt der Taskfile.
#
# Die DB-Tests brauchen einen erreichbaren Cluster und SKIPPEN sonst
# (Muster aus tests/spec/sealed-secret-cluster-drift.bats, vgl. T002820):
# ohne Guard maessen sie die Ausstattung des CI-Runners statt den Zustand des
# Codes, und "rot, weil kein Cluster" waere von "rot, weil kaputt" nicht zu
# unterscheiden. `grep -rn 'kubectl' .github/workflows/ci.yml` zeigt, dass CI
# keinen Cluster bereitstellt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-10-llm-proxy-request-log.sql"
}

_db_available() {
  command -v kubectl >/dev/null 2>&1 || return 1
  ( cd "$REPO_ROOT" && BRAND=mentolder bash -c \
      'source scripts/factory/lib.sh; factory_resolve >/dev/null 2>&1 && echo "SELECT 1;" | factory_psql' \
  ) >/dev/null 2>&1
}

_psql() {
  ( cd "$REPO_ROOT" && BRAND=mentolder bash -c \
      "source scripts/factory/lib.sh; factory_resolve >/dev/null; echo \"$1\" | factory_psql" )
}

@test "T003277: die Migrationsdatei existiert" {
  # Positiv-Anker [T002356-M1] fuer die folgenden Tests: faende sich die Datei
  # nicht, liefen deren Aussagen ueber einer leeren Grundmenge ins Leere.
  [ -f "$MIGRATION" ]
}

@test "T003277: die Migration legt die Tabelle mit allen Mitschnitt-Spalten an" {
  _db_available || skip "keine erreichbare tickets-DB (kein Cluster) — dieser Test misst sonst den Runner"

  ( cd "$REPO_ROOT" && BRAND=mentolder bash -c \
      "source scripts/factory/lib.sh; factory_resolve >/dev/null; factory_psql < '$MIGRATION'" ) >/dev/null 2>&1

  run _psql "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='llm_proxy_request_log' ORDER BY column_name;"
  [ "$status" -eq 0 ]

  # Die Spalten, an denen die Zusicherungen des Specs haengen.
  for col in request_body response_body stream_incomplete truncated original_bytes \
             slot_id dispatch_ticket dispatch_partial streamed; do
    echo "$output" | grep -qx "$col" || { echo "Spalte fehlt: $col"; return 1; }
  done
}

@test "T003277: die Migration ist wiederholbar (idempotent)" {
  _db_available || skip "keine erreichbare tickets-DB (kein Cluster)"

  # Zweiter Lauf gegen dieselbe DB darf nicht scheitern — Marken-Migrationslaeufe
  # spielen das Verzeichnis wiederholt ein.
  run bash -c "cd '$REPO_ROOT' && BRAND=mentolder bash -c \"source scripts/factory/lib.sh; factory_resolve >/dev/null; factory_psql < '$MIGRATION'\""
  [ "$status" -eq 0 ]
}

@test "T003277: der NOTIFY-Trigger haengt an der Tabelle" {
  _db_available || skip "keine erreichbare tickets-DB (kein Cluster)"

  run _psql "SELECT tgname FROM pg_trigger WHERE tgrelid='tickets.llm_proxy_request_log'::regclass AND NOT tgisinternal;"
  [ "$status" -eq 0 ]
  # Ohne ihn erreicht kein Ereignis das Cockpit, und das Panel waere still tot.
  echo "$output" | grep -q 'cockpit_notify_dispatch'
}

@test "T003277: der Aufraeum-Task ist aufrufbar" {
  # Semantik statt Darstellung [T002716]: geprueft wird, DASS `task` den Namen
  # kennt — ohne Zeilenanker und ohne Spaltenformat, das sich zwischen
  # go-task-Versionen unterscheidet.
  run bash -c "cd '$REPO_ROOT' && task --list"
  [ "$status" -eq 0 ]
  # Positiv-Anker: die Liste ist ueberhaupt gefuellt.
  echo "$output" | grep -qF 'maintenance:ai-log-cleanup'
  echo "$output" | grep -qF 'maintenance:dispatch-log-cleanup'
}
