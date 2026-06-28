#!/usr/bin/env bats
# tests/spec/code-quality.bats
# SSOT: openspec/changes/cq05-todo-cleanup/proposal.md
# T001282 — G-CQ05: Keine freien Stub-Marker-Wörter im Quelltext (Baseline: 0).
#
# This test is intentionally FAILING before the fix is applied (6 matches).
# It becomes green once Tasks 2–5 of the implementation plan are complete.

setup() {
  REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ05: kein freies Stub-Marker-Wort in Quelltext (Baseline 0)" {
  local count
  count=$(grep -rnE '\bTODO\b' \
    --include='*.ts' --include='*.svelte' --include='*.astro' \
    --include='*.sh' --include='*.js' --include='*.mjs' \
    "$REPO/website/src" "$REPO/scripts" "$REPO/tests" "$REPO/brett/src" 2>/dev/null \
    | grep -cvE 'node_modules|/dist/|plan-lint\.sh|plan-qa-check\.sh|openspec\.sh' || true)
  [ "$count" -eq 0 ]
}
