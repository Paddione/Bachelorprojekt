#!/usr/bin/env bats
# FA-SF-43: the factory pipeline's Implement phase must create its worktree via the
# git-crypt-safe scripts/worktree-create.sh, NOT the harness `isolation: 'worktree'`
# option. The harness option runs a raw `git worktree add` whose checkout invokes the
# git-crypt smudge filter and fails fatally (the new per-worktree gitdir has no key) —
# T000473 / T000426. Verified live 2026-06-07: the first real autopilot run failed at
# exactly this step. These are structural guards (grep + node --check), in the spirit
# of FA-SF-20/31, because the Workflow script cannot be unit-executed offline.

@test "FA-SF-43: pipeline.js does NOT pass the harness isolation:'worktree' option (code, not comments)" {
  run bash -c "CODE_ONLY() { grep -v '^[[:space:]]*//' scripts/factory/pipeline.js | grep -v '^[[:space:]]*\*'; }; CODE_ONLY | grep -Eq \"isolation:[[:space:]]*'worktree'\""
  [ "$status" -ne 0 ]
}

@test "FA-SF-43: pipeline.js creates the worktree via scripts/worktree-create.sh" {
  run grep -Eq 'scripts/worktree-create\.sh[[:space:]]+\$\{WORK_BRANCH\}[[:space:]]+\$\{WORK_WT\}' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: pipeline.js fails loudly (returns blocked) when worktree setup fails" {
  run grep -Eq "reason: 'worktree-setup'" scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: spec/plan filenames are date-stamped by the agent, not from A.timestamp" {
  # the undefined- filename bug: A.timestamp is not reliably passed → must use date +%F
  run grep -Eq '\$\{A\.timestamp\}-\$\{slug\}' scripts/factory/pipeline.js
  [ "$status" -ne 0 ]
  run grep -Eq 'docs/superpowers/specs/\$\(date \+%F\)-\$\{slug\}-design\.md' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  run grep -Eq 'docs/superpowers/plans/\$\(date \+%F\)-\$\{slug\}\.md' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: worktree-create.sh supports an existing branch (reuse/dev-flow path)" {
  run grep -q 'BRANCH_EXISTS' scripts/worktree-create.sh
  [ "$status" -eq 0 ]
  run bash -n scripts/worktree-create.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: pipeline.js still parses" {
  run node --check scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
