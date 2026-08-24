#!/usr/bin/env bats
# tests/spec/software-factory/factory-status-lane-status-field.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T015960 — factory_status meldete backlog/plan_staged dauerhaft 0,
# obwohl queue.sh 8 dispatchbare Rows lieferte. Ursache: countByStatus
# (mcp-go/main.go) parst das Feld `status`, queue.sh SELECTierte es aber
# nicht (Feldname fehlte im JSON → stiller ""-Key).
#
# PRUEFMODUS: Zwei Ebenen.
# 1. DB-gestützte Output-Verifikation (wenn ein shared-db-Pod erreichbar ist):
#    queue.sh wird AUSGEFÜHRT und jede Row muss ein nicht-leeres .status tragen.
# 2. Querschnitts-Wiring-Grep (offline/CI-fähig): der Kontrakt „queue.sh
#    SELECTiert status“ ist statisch verankert, damit die Spalte nicht wieder
#    lautlos verschwinden kann — das Parser-Ende des Kontrakts pinnt der Go-Test
#    TestCountByStatusRowsWithoutStatusFieldAreNotCounted.

load '_sf_common'

setup() { _sf_setup; }

_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$_pod" ]] || skip "kein erreichbarer shared-db-Pod — DB-gestützter Test übersprungen"
}

@test "T015960: queue.sh-Rows tragen ein nicht-leeres status-Feld (DB-Live)" {
  _skip_if_no_db
  run env BRAND=mentolder FACTORY_CTX="${FACTORY_CTX:-k3d-mentolder-dev}" \
    bash "$BATS_TEST_DIRNAME/../../../scripts/factory/queue.sh"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e 'type == "array"' >/dev/null
  # Leere Queue = kein Messwert für den Kontrakt (vakuumssicher skippen).
  [ "$(printf '%s' "$output" | jq 'length')" -gt 0 ] || skip "Queue leer — Kontrakt an dieser Stelle nicht messbar"
  # Jede Row muss status != null/"" haben — genau das, was countByStatus liest.
  printf '%s' "$output" | jq -e 'all(.[]; .status != null and .status != "")' >/dev/null
}

@test "T015960: Wiring-Kontrakt — queue.sh SELECTiert die status-Spalte (Querschnitts-Grep)" {
  # Der SELECT-Ausdruck muss `status` zwischen SELECT und FROM tickets.tickets
  # führen. Grep auf den SQL-Block, nicht aufs ganze File (Dokumentposition-
  # Falle T003104: der WHERE-Block erwähnt status='backlog' etc.).
  local sel
  sel=$(awk '/SELECT COALESCE/,/FROM tickets\.tickets/' \
    "$BATS_TEST_DIRNAME/../../../scripts/factory/queue.sh")
  printf '%s\n' "$sel" | grep -qE '(^|[[:space:],])status([[:space:]]*(--.*)?$|[,])'
}
