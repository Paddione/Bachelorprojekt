#!/usr/bin/env bats

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PROOF_DIR="$REPO/.lavish"
}

@test "T002460 Jedes Panel deklariert gueltigen data-panel-type (D2)" {
  grep -o 'data-panel-type="[^"]*"' "$PROOF_DIR/cockpit-shell.html" | while read -r attr; do
    type=$(echo "$attr" | sed 's/.*="\(.*\)"/\1/')
    case "$type" in
      status|strom|canvas|terminal) ;;
      *) exit 1 ;;
    esac
  done
}
