#!/usr/bin/env bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T013304 — Mishap-Rollup laeuft genau einmal pro Tick in wakeup.sh

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WAKEUP_SH="${REPO_ROOT}/scripts/factory/wakeup.sh"
}

@test "wakeup.sh executes mishap-rollup once per tick (not inside brand loop)" {
  # Prueft, dass mishap-rollup.sh genau 1x im Script aufgerufen wird
  local count
  count=$(grep -c 'mishap-rollup\.sh' "$WAKEUP_SH" || true)
  [ "$count" -eq 1 ]

  # Prueft, dass kein for ... in mentolder korczewski Block den Aufruf umschliesst
  ! grep -B 2 'mishap-rollup\.sh' "$WAKEUP_SH" | grep -q 'for .* in mentolder korczewski'
}
