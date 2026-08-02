#!/usr/bin/env bats
# tests/spec/ci-cd/freshness-check-base-mismatch.bats
# SSOT: openspec/specs/ci-cd.md
# T002561: `task freshness:check` measures generated artifacts against the
# LOCAL branch tip (`git diff HEAD -- "$f"`), while CI measures the same
# task against the PR's merge commit (which already includes the latest
# origin/main). Both measurements are individually correct but compare
# different bases, so a local-green freshness:check can still fail in CI —
# a re-run does not help, and nothing in the local output says so. Root
# cause verified by source-inspection of Taskfile.yml `freshness:check`
# (no `origin/main` / `rev-list` reference anywhere in that task) — cost 3
# attempts on PR #3658.
#
# Fix scope (per ticket, both combined): the `freshness:check` task must
# (1) tell the user which base it measured against, and (2) warn when the
# local branch is behind origin/main (the exact condition that produces a
# false-green local run).
#
# Test mode: source verification (Taskfile.yml is a CI-config/task-runner
# definition, not application code with a directly executable output — the
# behavior under test IS the shell text of the `freshness:check` task, so
# grep against it is the appropriate check per the documented exception in
# CLAUDE.md's Test-Resultats-Konvention).
#
# Two tests:
#   (1) RED-Sanity — `freshness:check` does not currently compute or warn
#       about divergence from origin/main (fails against main, passes
#       after fix).
#   (2) Control — `freshness:check` still runs `task freshness:regenerate`
#       (guard against over-fixing / accidentally removing Phase 0).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

# Extract just the `freshness:check:` task body (stops at the next
# top-level task key, i.e. a line starting with two spaces of indent and
# no further leading whitespace before a `word:` at the task-name level).
_freshness_check_block() {
  awk '
    /^  freshness:check:/ { capture=1; print; next }
    capture && /^  [a-zA-Z0-9_-]+:/ { capture=0 }
    capture { print }
  ' "$TASKFILE"
}

@test "T002561: freshness:check warns when local branch is behind origin/main (RED against main)" {
  [ -f "$TASKFILE" ] || { echo "MISSING taskfile: $TASKFILE"; return 1; }
  block="$(_freshness_check_block)"
  [ -n "$block" ] || { echo "MISSING 'freshness:check:' task in $TASKFILE"; return 1; }

  echo "$block" | grep -qE 'rev-list[[:space:]]+--count[[:space:]]+HEAD\.\.origin/main' \
    || { echo "MISSING 'git rev-list --count HEAD..origin/main' divergence check in freshness:check task"; return 1; }

  echo "$block" | grep -qE 'origin/main' \
    || { echo "MISSING any origin/main reference in freshness:check task"; return 1; }
}

@test "T002561: freshness:check still runs task freshness:regenerate (control test, must stay green)" {
  [ -f "$TASKFILE" ] || { echo "MISSING taskfile: $TASKFILE"; return 1; }
  block="$(_freshness_check_block)"
  [ -n "$block" ] || { echo "MISSING 'freshness:check:' task in $TASKFILE"; return 1; }

  echo "$block" | grep -qE 'task:[[:space:]]*freshness:regenerate' \
    || { echo "MISSING 'task: freshness:regenerate' in freshness:check — guard over-suppressed!"; return 1; }
}
