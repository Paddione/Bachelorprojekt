#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/kit-artifacts-exist.bats
# SSOT: openspec/changes/sdlc-cockpit-design/design.md
#
# Prüft, dass alle 5 Kit-Dateien + 2 Belegartefakte existieren. [T002460]

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  KIT_DIR="$REPO/.lavish/kit"
  PROOF_DIR="$REPO/.lavish"
}

@test "T002460 Alle 5 Kit-Dateien existieren" {
  [ -f "$KIT_DIR/tokens.css" ]
  [ -f "$KIT_DIR/document.css" ]
  [ -f "$KIT_DIR/panel.css" ]
  [ -f "$KIT_DIR/panel.js" ]
  [ -f "$KIT_DIR/adapter.js" ]
}

@test "T002460 Beide Belegartefakte existieren" {
  [ -f "$PROOF_DIR/reference-board.html" ]
  [ -f "$PROOF_DIR/cockpit-shell.html" ]
}
