#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/kit-binding.bats
# SSOT: openspec/changes/sdlc-cockpit-design/design.md
#
# Prüft, dass die Belegartefakte das Kit korrekt einbinden. [T002460]

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PROOF_DIR="$REPO/.lavish"
}

@test "T002460 Referenz-Board bindet tokens.css und document.css per link ein" {
  run grep -c 'tokens\.css' "$PROOF_DIR/reference-board.html"
  [ "$output" -gt 0 ]

  run grep -c 'document\.css' "$PROOF_DIR/reference-board.html"
  [ "$output" -gt 0 ]
}

@test "T002460 Cockpit-Huelle bindet Kit per link und script ein" {
  run grep -c 'tokens\.css' "$PROOF_DIR/cockpit-shell.html"
  [ "$output" -gt 0 ]

  run grep -c 'panel\.css' "$PROOF_DIR/cockpit-shell.html"
  [ "$output" -gt 0 ]

  run grep -c 'panel\.js' "$PROOF_DIR/cockpit-shell.html"
  [ "$output" -gt 0 ]

  run grep -c 'adapter\.js' "$PROOF_DIR/cockpit-shell.html"
  [ "$output" -gt 0 ]
}
