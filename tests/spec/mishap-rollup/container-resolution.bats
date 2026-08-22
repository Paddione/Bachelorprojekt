#!/usr/bin/env bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T013304 — Rollup Container Resolution ist markenuebergreifend

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  TICKET_SH="${REPO_ROOT}/scripts/ticket.sh"
}

@test "ticket.sh rollup-container query does not filter on brand" {
  # Verifiziert anhand von cmd_rollup_container, dass kein 'AND brand = :' Filter existiert
  local fn_body
  fn_body=$(sed -n '/^cmd_rollup_container()/,/^}/p' "$TICKET_SH")
  ! grep -q 'AND brand = ' <<<"$fn_body"
}

@test "ticket.sh timeline query uses t.brand instead of parameter" {
  # Verifiziert, dass cmd_get_timeline t.brand aus der tickets-Tabelle nutzt
  local fn_body
  fn_body=$(sed -n '/^cmd_get_timeline()/,/^}/p' "$TICKET_SH")
  grep -q "'brand', t.brand" <<<"$fn_body"
}
