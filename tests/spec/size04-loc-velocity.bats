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
