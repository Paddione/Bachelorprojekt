#!/usr/bin/env bats
# tests/unit/bats-runner-path.bats
# T002265: Verify CLAUDE.md documents the correct vendored BATS runner path.

CLAUDE_FILE="CLAUDE.md"
BATS_PATH="tests/unit/lib/bats-core/bin/bats"

@test "CLAUDE.md documents the BATS runner path" {
  grep -q "$BATS_PATH" "$CLAUDE_FILE" || {
    echo "CLAUDE.md does not mention the BATS runner path: $BATS_PATH"
    return 1
  }
}

@test "vendored BATS runner path exists and is executable" {
  [ -x "$BATS_PATH" ] || {
    echo "BATS runner not found or not executable at: $BATS_PATH"
    return 1
  }
}
