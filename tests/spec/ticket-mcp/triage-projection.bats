#!/usr/bin/env bats
#
# SSOT: openspec/changes/batch-mcp-introspection (T003811, Batch-Parent)
# Ticket: T003406 — ticket-mcp export_tickets returns insufficient fields for triage
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Der Test FUEHRT
# `ticket.sh list` gegen die echte lokale Dev-DB AUS und prueft die JSON-Projektion
# — es wird NICHT der Quelltext von list.sh gegreppt.
#
# Die Projektion ist die "belastbare Triage-Projektion" aus T003811: die
# missing[]-Berechnung (areas, depends_on, readiness, component, desc_len) und die
# Planungs-Einordnung (effort, planning_rank, updated_at) muessen ohne Umweg ueber
# rohes SQL aus list/export lesbar sein. Der Positiv-Anker (Fixture auffindbar)
# haengt an der eigenen Saat-Zeile, nicht an Umgebungsdaten.
#
# DB-Zugriff: Der Test braucht den echten lokalen Dev-Cluster (TICKET_TEST_DB_OK=1,
# siehe Kommentar in scripts/vda/ticket/_ticket-core.sh, Sentinel-Kontext).
# Ohne erreichbaren shared-db-Pod wird uebersprungen (etabliertes Muster aus
# tests/spec/ticket-system/list-test-data-filter.bats).

load "../../lib/factory-test-fixtures.sh"

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen"
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

@test "T003406: ticket.sh list liefert die Triage-Projektion (component, areas, depends_on, readiness, effort, planning_rank, desc_len, updated_at)" {
  _skip_if_no_db
  local ext_id
  ext_id=$(_seed_once)

  # Positiv-Anker (T002356-M1): die eigene Fixture ist ueberhaupt in der Liste
  # auffindbar — sonst waere "Felder fehlen" trivial erfuellt. list filtert
  # is_test_data standardmaessig raus; die Fixture wird mit --is-test-data
  # geseedet, also explizit einschliessen (das Flag ist Teil der CLI).
  run bash scripts/ticket.sh list --brand mentolder --limit 200 --include-test-data
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF "$ext_id"

  # Die Projektion ist fest verdrahtet: JEDE Zeile muss alle Triage-Felder
  # tragen (Werte duerfen NULL sein, die Schluessel nicht fehlen).
  printf '%s\n' "$output" | python3 -c '
import json, sys
rows = json.load(sys.stdin)
required = ["component", "areas", "depends_on", "readiness", "effort",
            "planning_rank", "desc_len", "updated_at"]
missing = [f for f in required if any(f not in r for r in rows)]
assert not missing, f"Triage-Felder fehlen in der Projektion: {missing}"
'
}
