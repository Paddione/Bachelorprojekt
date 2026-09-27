#!/usr/bin/env bats
# tests/evals/task-list-golden.bats
# T900560-C5: CLI-surface golden — the public `task --list-all` listing is the
# contract agents rely on. Any rename/removal/addition must be a deliberate,
# human-reviewed change (golden refresh via `task test:evals:update`).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  GOLDEN="$REPO_ROOT/tests/evals/golden/task-list-all.txt"
}

@test "task-list-golden: committed snapshot exists" {
  [ -f "$GOLDEN" ] || { echo "MISSING golden: $GOLDEN"; return 1; }
  [ -s "$GOLDEN" ] || { echo "EMPTY golden: $GOLDEN"; return 1; }
}

@test "task-list-golden: task --list-all matches the snapshot byte-for-byte" {
  [ -f "$GOLDEN" ] || { echo "MISSING golden: $GOLDEN"; return 1; }
  command -v task >/dev/null || { echo "MISSING task binary (repo prerequisite)"; return 1; }
  run bash -c "cd '$REPO_ROOT' && task --list-all --color=false | diff -u '$GOLDEN' -"
  [ "$status" -eq 0 ] || {
    echo "CLI surface drifted from golden. If intentional, a HUMAN refreshes via:"
    echo "  task test:evals:update   # human-only, PR needs [evals-override]"
    echo "$output"
    return 1
  }
}
