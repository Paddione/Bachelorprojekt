#!/usr/bin/env bats

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  KIT_DIR="$REPO/.lavish/kit"
}

@test "T002460 Dokument-Bausteine nutzen ausschliesslich Tokens (E11) [Negativtest + Positiv-Anker]" {
  # POSITIV-ANCHOR: tokens.css exists and has token definitions
  test -f "$KIT_DIR/tokens.css" || return 1
  grep -q '--color-bg-base' "$KIT_DIR/tokens.css" || return 1
  # NEGATIVTEST: no hardcoded hex/rgb/hsl colors in document.css (except in content/var fallbacks)
  run grep -cE '(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})' "$KIT_DIR/document.css"
  # Only content properties may have hex
  [ "$status" -eq 1 ] || return 1
}
