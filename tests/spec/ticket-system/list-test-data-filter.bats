#!/usr/bin/env bats
#
# SSOT: openspec/specs/ticket-system.md
# Ticket: T002781 — ticket.sh list filtert is_test_data nicht
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Die Tests FUEHREN
# `ticket.sh list` gegen die echte Datenbank AUS und pruefen dessen JSON-Ausgabe.
# Es wird NICHT der Quelltext von list.sh gegreppt.
#
# POSITIV-ANKER (T002356-M1): Test 1 belegt, dass die frisch gesaete Testdaten-Zeile
# ueber `--include-test-data` UEBERHAUPT auffindbar ist. Erst darauf stuetzt Test 2 die
# Negativ-Aussage. Ohne diesen Anker bestuende Test 2 vakuos — eine Implementierung, die
# gar nichts mehr zurueckgibt, wuerde ihn ebenfalls bestehen.
#
# WARUM DER ANKER NICHT "Liste ist nicht leer" LAUTET: im Status backlog existiert
# derzeit KEIN einziges regulaeres Ticket (gemessen am 2026-08-09: 1 Testdaten-Zeile,
# 0 regulaere). Ein Anker auf eine nicht-leere backlog-Liste wuerde nach dem Fix
# fehlschlagen, obwohl der Fix korrekt waere. Der Anker haengt deshalb an der eigenen
# Fixture, nicht an Umgebungsdaten.
#
# Die Fixture wird ueber tests/lib/factory-test-fixtures.sh erzeugt und in teardown_file
# wieder gepurgt — der Test stuetzt sich ausdruecklich NICHT auf liegengebliebene
# SF-TEST-Zeilen fremder Laeufe.

load "../../lib/factory-test-fixtures.sh"

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
}

setup_file() {
  export TICKET_TEST_BRAND="mentolder"
  export SEEDED_ID_FILE="$BATS_FILE_TMPDIR/seeded_id"
  # scripts/vda/ticket/_ticket-core.sh zeigt unter BATS bewusst auf den Sentinel-Kontext
  # "bats-no-cluster-t002224", damit Tests nicht versehentlich echte Tickets schreiben
  # (rund 130 Geisterzeilen im Juli 2026, siehe Kommentar dort). Dieser Test BRAUCHT den
  # echten lokalen Dev-Cluster — er saet eine markierte Fixture und purgt sie in
  # teardown_file wieder. Deshalb das ausdrueckliche Opt-in.
  export TICKET_TEST_DB_OK=1
}

teardown_file() {
  # Purge raeumt ALLE is_test_data=true-Zeilen der Brand ab — genau der vorgesehene
  # teardown-Pfad der Fixture-Lib.
  purge_factory_test_data "mentolder" >/dev/null 2>&1 || true
}

_seed_once() {
  if [[ ! -s "$SEEDED_ID_FILE" ]]; then
    seed_test_feature "mentolder" > "$SEEDED_ID_FILE"
  fi
  cat "$SEEDED_ID_FILE"
}

@test "T002781: --include-test-data macht eine is_test_data-Zeile sichtbar (Positiv-Anker)" {
  _skip_if_no_db
  seeded="$(_seed_once)"
  [ -n "$seeded" ]

  run bash "$BATS_TEST_DIRNAME/../../../scripts/ticket.sh" list \
    --status backlog --limit 200 --include-test-data

  # Der Aufruf muss ueberhaupt durchlaufen und JSON liefern — sonst ist jede
  # Aussage ueber den Inhalt wertlos.
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e 'type == "array"' >/dev/null

  # Die gesaete Zeile ist ueber den Opt-out auffindbar.
  [ "$(printf '%s' "$output" | jq -r --arg id "$seeded" '[.[] | select(.external_id == $id)] | length')" -eq 1 ]
}

@test "T002781: ohne Flag verschwindet die is_test_data-Zeile aus ticket.sh list" {
  _skip_if_no_db
  seeded="$(_seed_once)"
  [ -n "$seeded" ]

  run bash "$BATS_TEST_DIRNAME/../../../scripts/ticket.sh" list \
    --status backlog --limit 200

  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e 'type == "array"' >/dev/null

  # Eigentliche Aussage: die Testdaten-Zeile ist per Default NICHT enthalten.
  [ "$(printf '%s' "$output" | jq -r --arg id "$seeded" '[.[] | select(.external_id == $id)] | length')" -eq 0 ]
}
