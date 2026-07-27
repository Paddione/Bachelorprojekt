#!/usr/bin/env bats
# Tests for scripts/vda/ticket/stage-plan.sh

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  STAGE_PLAN="$REPO_ROOT/scripts/vda/ticket/stage-plan.sh"
}

@test "stage-plan rejects FACTORY-PLAN-REF pointing to nonexistent file" {
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/test" --plan "openspec/changes/nonexistent/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "stage-plan rejects empty plan path" {
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/test" --plan ""
  [ "$status" -eq 2 ]
  [[ "$output" == *"--plan is required"* ]]
}

@test "stage-plan rejects missing --id flag" {
  run bash "$STAGE_PLAN" --branch "feature/test" --plan "openspec/changes/test/tasks.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--id is required"* ]]
}

@test "stage-plan rejects missing --branch flag" {
  run bash "$STAGE_PLAN" --id T000999 --plan "openspec/changes/test/tasks.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--branch is required"* ]]
}

@test "stage-plan rejects missing --plan flag" {
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/test"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--plan is required"* ]]
}

# --- T002263: plan path resolution against the branch, not HEAD ---------------
# The ticket-mcp server always runs bash from the MAIN checkout, so `HEAD` is
# `main` there — a plan that lives only on a worktree's feature branch was
# rejected as "does not exist in git", even though the branch ref is perfectly
# visible from the main checkout (worktrees share one .git).

@test "T002263: a plan that exists only on the named branch is accepted" {
  local repo="$BATS_TEST_TMPDIR/wt-repo"
  mkdir -p "$repo"
  (
    cd "$repo"
    git init -q -b main .
    git config user.email t@example.com
    git config user.name Test
    echo base > README.md
    git add README.md
    git commit -q -m base
    git checkout -q -b feature/only-here
    mkdir -p openspec/changes/demo
    echo "# plan" > openspec/changes/demo/tasks.md
    git add openspec/changes/demo/tasks.md
    git commit -q -m plan
    # Back to main: the plan is NOT in the working tree and NOT in HEAD.
    git checkout -q main
  )
  cd "$repo"
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/only-here" \
      --plan "openspec/changes/demo/tasks.md"
  # The DB step will fail in this sandbox — that is fine. What must NOT happen
  # is the pre-flight rejecting the plan as missing.
  [[ "$output" != *"does not exist in git"* ]]
}

@test "T002263: a plan on no branch at all is still rejected" {
  local repo="$BATS_TEST_TMPDIR/wt-repo-empty"
  mkdir -p "$repo"
  (
    cd "$repo"
    git init -q -b main .
    git config user.email t@example.com
    git config user.name Test
    echo base > README.md
    git add README.md
    git commit -q -m base
  )
  cd "$repo"
  run bash "$STAGE_PLAN" --id T000999 --branch "feature/absent" \
      --plan "openspec/changes/ghost/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}
