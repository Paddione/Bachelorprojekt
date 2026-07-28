#!/usr/bin/env bats
# tests/spec/dev-flow-execute.bats
# SSOT: openspec/specs/mishap-t002352.md
#
# Post-facto tests for T002352 mishap bundle. All fixes were already merged to
# main in separate PRs (T002375, PR #3398). These tests verify the fixes are
# in place and guard against regressions.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

# ── Mishap 1: Worktree cleanup owned by orchestrator, not implementer ─────

@test "T002352-M1: implementer-facing step 2 does not mention git worktree remove" {
  SKILL="$REPO_ROOT/.agents/skills/dev-flow-execute/SKILL.md"
  run grep -n "git worktree remove" "$SKILL"
  [ "$status" -ne 0 ]
}

@test "T002352-M1: cd X && cmd || fallback pattern absent from dev-flow-execute-phases" {
  PHASES="$REPO_ROOT/.claude/skills/references/dev-flow-execute-phases.md"
  run grep -nE 'cd [^&]+ && .+ \|\|' "$PHASES"
  [ "$status" -ne 0 ]
}

@test "T002352-M1: implementer step 2 does not mention worktree cleanup or deletion" {
  SKILL="$REPO_ROOT/.agents/skills/dev-flow-execute/SKILL.md"
  # Extract implementer section (## Schritt 2) until the next ## heading
  IMPL_SECTION=$(awk '/^## Schritt 2:/{flag=1; next} /^## /{flag=0} flag' "$SKILL" 2>/dev/null || echo "")
  echo "$IMPL_SECTION" | grep -nEi '(worktree.*(remov|clean|delet|lösch)|\.worktrees.*rm|branch -D)' && { echo "implementer section mentions worktree cleanup"; false; } || true
}

# ── Mishap 2: SSOT negative-assertion tests must filter Scenario blocks ────

@test "T002352-M2: mcp-gateway bats test has Scenario-block filter" {
  TESTFILE="$REPO_ROOT/tests/spec/mcp-gateway.bats"
  run grep -c 'Scenario:' "$TESTFILE"
  [ "$output" -gt 0 ] || skip "no Scenario tests in mcp-gateway.bats"
  run grep -c 'Scenario.*next\|in_s.*1' "$TESTFILE"
  [ "$output" -ge 2 ]
}

@test "T002352-M2: all spec bats tests using negative grep over SSOT documents have scenario filters" {
  BATS_DIR="$REPO_ROOT/tests/spec"
  pushd "$BATS_DIR" >/dev/null || exit 1
  for batsfile in *.bats; do
    run grep -nE 'grep.*openspec/specs' "$batsfile"
    if [ "$status" -eq 0 ] && [ -n "$output" ]; then
      has_negative=$(grep -cE '\$status -ne 0|fail.*grep.*found|not grep' "$batsfile" || true)
      if [ "$has_negative" -gt 0 ]; then
        has_filter=$(grep -cE 'Scenario:|in_s[[:space:]]*=|!in_s' "$batsfile" || true)
        [ "$has_filter" -ge 1 ] || {
          echo "ERROR: $batsfile has negative grep over openspec/specs without Scenario filter"
          exit 1
        }
      fi
    fi
  done
  popd >/dev/null || exit 1
}

@test "T002352-M2: mcp-gateway.bats has negation probe for scenario filter" {
  TESTFILE="$REPO_ROOT/tests/spec/mcp-gateway.bats"
  # The test at line 429 contains "Negativ-Probe" — a probe that verifies the
  # scenario filter still lets non-scenario content through (grep -cE '^#+ ')
  run grep -c "Negativ-Probe" "$TESTFILE"
  [ "$output" -ge 1 ] || { echo "missing negation probe in mcp-gateway.bats"; false; }
}

# ── Mishap 3: freshness:check must distinguish "not staged" from "stale" ───

@test "T002352-M3: freshness:check diff-check loop uses 'regenerated but not staged' not 'is stale'" {
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  # Extract only the for-loop body (from 'for f in' to 'if [ $ERRORS')
  FOR_LOOP=$(awk '/^        for f in \$FILES; do$/{flag=1} flag{print} flag && /^        if \[ \$ERRORS -gt 0 \]; then$/{flag=0}' "$TASKFILE" 2>/dev/null || echo "")
  run grep -c 'is stale' <<<"$FOR_LOOP"
  [ "$output" -eq 0 ]
}

@test "T002352-M3: freshness:check has 'regenerated but not staged' message" {
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  run grep -c "regenerated but not staged" "$TASKFILE"
  [ "$output" -ge 1 ]
}

@test "T002352-M3: freshness:check has 'staged but not committed' message" {
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  run grep -c "staged but not committed" "$TASKFILE"
  [ "$output" -ge 1 ]
}

@test "T002352-M3: freshness:check message says to add+commit not re-regenerate" {
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  run grep -c "run 'git add" "$TASKFILE"
  [ "$output" -ge 1 ]
}
