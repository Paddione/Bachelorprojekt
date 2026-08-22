#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CONTRACT="$REPO_ROOT/.agents/skills/references/dev-flow-lifecycle.md"
  EXEC="$REPO_ROOT/.agents/skills/dev-flow-execute/SKILL.md"
  E2E="$REPO_ROOT/.agents/skills/dev-flow-e2e/SKILL.md"
}

@test "lifecycle contract declares all four transitions and E2E specialization" {
  [ -f "$CONTRACT" ]
  for skill in dev-flow-plan dev-flow-chore dev-flow-execute dev-flow-e2e; do
    grep -q "| $skill |" "$CONTRACT"
  done
  grep -q "test-only Chore" "$CONTRACT"
}

@test "execute orders review, phase chain, merge, then finalizer" {
  review=$(grep -n "requesting-code-review\|Code-Review-Gate" "$EXEC" | head -1 | cut -d: -f1)
  phase=$(grep -n "assert-phase-chain" "$EXEC" | head -1 | cut -d: -f1)
  merge=$(grep -n "gh pr merge --auto" "$EXEC" | head -1 | cut -d: -f1)
  finalizer=$(grep -n "frischen Finalizer\|fresh Finalizer" "$EXEC" | head -1 | cut -d: -f1)
  [ -n "$review" ] && [ -n "$phase" ] && [ -n "$merge" ] && [ -n "$finalizer" ]
  [ "$review" -lt "$phase" ] && [ "$phase" -lt "$merge" ] && [ "$merge" -lt "$finalizer" ]
}

@test "contract keeps exception loop active until MERGED and re-enters gates" {
  grep -q "until.*MERGED\|bis.*MERGED" "$CONTRACT"
  grep -q "DIRTY" "$CONTRACT"
  grep -q "CONFLICTING" "$CONTRACT"
  grep -q "replacement\|Ersatz" "$CONTRACT"
  grep -q "re-review\|erneut.*Review\|phase-chain.*erneut" "$CONTRACT"
}

@test "E2E points to chore lifecycle and keeps live test ownership" {
  grep -q "chore/" "$E2E"
  ! grep -q "E2E-Branches nutzen.*feature" "$E2E"
  grep -q "Playwright" "$E2E"
  grep -q "PR" "$E2E"
}

@test "mirrors are byte-identical" {
  cmp -s "$REPO_ROOT/.claude/skills/references/dev-flow-lifecycle.md" "$CONTRACT"
}
