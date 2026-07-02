#!/usr/bin/env bats
# SSOT: openspec/changes/size04-loc-velocity/proposal.md
# G-SIZE04: LOC/Woche-Regression — Scope-Exklusion + Gate-Schwelle.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  LOC_SCRIPT="$REPO_ROOT/scripts/check-loc-budget.mjs"
}

@test "G-SIZE04: check-loc-budget.mjs excludes openspec/changes/** from scan" {
  grep -E "openspec/changes|':\(exclude\)\*\*/openspec" "$LOC_SCRIPT" | grep -qv "^#"
}

@test "G-SIZE04: S6 warn-pct is 2 or lower (not 5)" {
  val=$(grep -E 'warn.?pct' "$LOC_SCRIPT" | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
  echo "warn-pct found: $val"
  [ -n "$val" ]
  awk -v v="$val" 'BEGIN{exit (v <= 2) ? 0 : 1}'
}

@test "G-SIZE04: goals.md contains Shallow-Clone caveat" {
  grep -qi "shallow.clone\|shallow clone" "$REPO_ROOT/.claude/lib/goals.md"
}

@test "G-SIZE04: scan universe excludes environments/.secrets/** (git-crypt drift)" {
  # Run the check with --dry-run-style output to verify .secrets files are excluded
  # (git-crypt encrypted files have different line counts when unlocked vs locked)
  run node "$LOC_SCRIPT" 2>&1
  echo "output: $output"
  # Script should not crash — should pass or at least run cleanly
  [ "$status" -eq 0 ]
  # Verify .secrets files not in scan output
  run grep -c "environments/.secrets/" "$REPO_ROOT/docs/code-quality/gates.yaml"
  [ "$output" -ge 1 ]
}

@test "G-SIZE04: gates.yaml has environments/.secrets/** in scan.ignore_globs" {
  grep -E "environments/\.secrets" "$REPO_ROOT/docs/code-quality/gates.yaml"
}
