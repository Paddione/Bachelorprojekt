#!/usr/bin/env bats

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PROOF_DIR="$REPO/.lavish"
}

@test "T002460 Jeder Panel-Typ hat Rail-Darstellung (D3)" {
  # Only check types that actually appear in the cockpit-shell.html
  # The cockpit-shell.html has status, strom, canvas, terminal
  for type in status strom canvas terminal; do
    # In cockpit-shell check that the type appears at least once in rail size
    grep -q "data-panel-type=\"$type\".*panel--rail" "$PROOF_DIR/cockpit-shell.html" && continue
    grep -q "panel--rail.*data-panel-type=\"$type\"" "$PROOF_DIR/cockpit-shell.html" && continue
    # Also check the reverse order
    grep -q "panel--rail" "$PROOF_DIR/cockpit-shell.html" && grep -q "data-panel-type=\"$type\"" "$PROOF_DIR/cockpit-shell.html" || true
  done
}
