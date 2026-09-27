#!/usr/bin/env bats

# tests/spec/dev-flow-plan/plan-dir-resolution.bats
# T900689: plan-intel.sh, plan-intel-filter.sh und openspec-embed.mjs fanden Plaene
# nur unter openspec/changes/<slug>/. Plan-Heimat seit C7a ist .agents/plans/<slug>/.
# PRUEFMODUS: Output-Verifikation [T002448-M4] — Skripte AUSFUEHREN gegen einen
# Sandbox-Slug unter .agents/plans/, teardown raeumt auf.

setup() {
  export REPO="$(cd "$(dirname "${BATS_TESTDIR%/}")" && pwd)"
  export SLUG="sandbox-plan-dir-t900689"
  export PLAN_DIR="$REPO/.agents/plans/$SLUG"
  mkdir -p "$PLAN_DIR/tasks.d"
  cat <<'MARKDOWN' > "$PLAN_DIR/tasks.md"
---
title: "sandbox — Implementation Plan"
ticket_id: T900689
domains: [test]
status: plan_staged
---

# sandbox — Implementation Plan

## File Structure
- scripts/plan-intel.sh

## Partials
| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1.md | tests | scripts/plan-intel.sh | | 4b-local | 16000 |
MARKDOWN
  printf '# sandbox\n\nProposal text for the embed dry-run.\n' > "$PLAN_DIR/proposal.md"
}

teardown() {
  rm -rf "$PLAN_DIR"
}

@test "T900689: plan-intel.sh liest tasks.md aus .agents/plans und schreibt intel.json dorthin" {
  run "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]
  [ -f "$PLAN_DIR/intel.json" ]
  run jq -r '.impact_files[].path' "$PLAN_DIR/intel.json"
  [ "$output" = "scripts/plan-intel.sh" ]
}

@test "T900689: plan-intel-filter.sh loest den Slug unter .agents/plans auf" {
  "$REPO/scripts/plan-intel.sh" "$SLUG"
  run bash -c "cd '$REPO' && scripts/plan-intel-filter.sh '$SLUG' scripts/plan-intel.sh | jq -r '.impact_files[].path'"
  [ "$status" -eq 0 ]
  [ "$output" = "scripts/plan-intel.sh" ]
}

@test "T900689: openspec-embed.mjs --dry-run findet den Plan unter .agents/plans" {
  run node "$REPO/scripts/openspec-embed.mjs" --slug "$SLUG" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" != *"no OpenSpec files"* ]]
  [[ "$output" == *"[dry-run] slug='$SLUG'"* ]]
}
