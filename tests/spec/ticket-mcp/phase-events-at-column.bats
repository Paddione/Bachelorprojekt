#!/usr/bin/env bats
#
# SSOT: openspec/specs/phase-events.md (factory_phase_events)
# Ticket: T003804 — factory_phase_events Zeit-Spalte heißt `at` — Introspect-Queries
# schlugen zweimal fehl
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Der Test schreibt ein
# Phasen-Event fuer eine gesaete Fixture und liest es ueber den offiziellen
# Timeline-Pfad (`ticket.sh get-timeline`) zurueck: die ts-Spalte des Events muss
# befuellt sein. Ein Regression auf "created_at/occurred_at" wuerde die Timeline
# leer oder fehlerhaft machen und diesen Test rot faerben. Zusaetzlich wird die
# Spalten-Introspection als Schemawissen abgesichert (der Fehler-Typ aus T003804
# war genau eine fehlgeschlagene Introspection).
#
# DB-Zugriff: echte lokale Dev-DB (TICKET_TEST_DB_OK=1), Fixture wird in
# teardown_file gepurged.

load "../../lib/factory-test-fixtures.sh"

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
}

_pod() {
  kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1
}

setup_file() {
  export BRAND="mentolder"
  export SEEDED_ID_FILE="$BATS_FILE_TMPDIR/seeded_id"
  export TICKET_TEST_DB_OK=1
}

teardown_file() {
  purge_factory_test_data "mentolder" >/dev/null 2>&1 || true
}

_seed_once() {
  if [[ ! -s "$SEEDED_ID_FILE" ]]; then
    seed_test_feature "mentolder" > "$SEEDED_ID_FILE"
  fi
  cat "$SEEDED_ID_FILE"
}

@test "T003804: factory_phase_events traegt die Zeit-Spalte 'at' (Introspection-Wissen)" {
  _skip_if_no_db
  local pod
  pod=$(_pod)

  run kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -c postgres -- psql -U website -d website -qtA -v ON_ERROR_STOP=1 -c \
    "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='factory_phase_events' AND column_name IN ('at','created_at','occurred_at') ORDER BY column_name;"
  [ "$status" -eq 0 ]
  [ "$output" = "at" ]
}

@test "T003804: Timeline liest das Phasen-Event mit befuellter ts-Spalte" {
  _skip_if_no_db
  local ext_id
  ext_id=$(_seed_once)

  # Positiv-Anker: das Event schreiben und im Timeline-Output wiederfinden.
  # (driver: nur factory|devflow sind CLI-gueltig; die Fixture ist devflow-artig.)
  run bash scripts/ticket.sh phase "$ext_id" implement entered --driver devflow
  [ "$status" -eq 0 ]

  run bash scripts/ticket.sh get-timeline --id "$ext_id" --brand mentolder
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF "phase_event"
  printf '%s\n' "$output" | python3 -c '
import json, sys
data = json.load(sys.stdin)
# Positiv-Anker: der Ticket-Lookup muss die Fixture finden (sonst waeren leere
# Events trivial — "Nichts da" waere kein Beleg fuer eine funktionierende at-Spalte).
assert data.get("ticket", {}).get("external_id"), "Ticket-Lookup fand die Fixture nicht"
rows = data["events"]
pe = [r for r in rows if r.get("source") == "phase_event"]
assert pe, "kein phase_event in der Timeline"
assert pe[0].get("ts"), "phase_event ohne ts (at-Spalte nicht gelesen?)"
assert pe[0]["detail"].get("state") == "entered"
'
}
