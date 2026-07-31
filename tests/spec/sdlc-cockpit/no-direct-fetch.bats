#!/usr/bin/env bats

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  KIT_DIR="$REPO/.lavish/kit"
  PROOF_DIR="$REPO/.lavish"
}

@test "T002460 Kein Panel ruft fetch direkt auf (E1) [Negativtest + Positiv-Anker]" {
  # POSITIV-ANCHOR: adapter.js provides tickets() method (K2 live-client signature)
  grep -q 'tickets' "$KIT_DIR/adapter.js" || return 1
  # NEGATIVTEST: panel.js has NO fetch call
  run grep -c 'fetch(' "$KIT_DIR/panel.js"
  [ "$status" -eq 1 ] || [ "$output" = "0" ]
  # cockpit-shell.html has NO fetch call
  run grep -c 'fetch(' "$PROOF_DIR/cockpit-shell.html"
  [ "$status" -eq 1 ] || [ "$output" = "0" ]
}
