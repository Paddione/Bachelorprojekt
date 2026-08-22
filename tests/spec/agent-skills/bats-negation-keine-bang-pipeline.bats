#!/usr/bin/env bats
# T013719-Mishap #9: Eine nackte '!'-Pipeline als BATS-Negativ-Assertion schlaegt den
# Test nicht fehl, wenn das Muster gefunden wird (bash nimmt '!'-Kommandos von errexit
# und dem ERR-Trap aus). Die Konvention muss in tests/CLAUDE.md stehen, damit sie
# nicht von der naechsten Testsession wiederholt wird.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CLAUDE_TESTS="$REPO_ROOT/tests/CLAUDE.md"
}

@test "tests/CLAUDE.md verbietet die nackte '!'-Pipeline als Negativ-Assertion" {
  # Positiv-Anker: die Konventionszeile existiert und nennt das Anti-Muster samt Abhilfe.
  run grep -n "Negativ-Assertion" "$CLAUDE_TESTS"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  grep -qF "'!'-Pipeline" <<<"$output"
}
