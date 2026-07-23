#!/usr/bin/env bats
# Regression guard for T002135: the bats libraries under tests/unit/lib/
# (bats-core, bats-support, bats-assert, bats-file) are vendored in-tree.
#
# They were git submodules before (T000107). That (a) surfaced every worktree
# as 4 extra repositories in IDEs and (b) blocked worktree cleanup — git
# refuses `git worktree remove` on working trees containing submodules.
# These tests keep the repo submodule-free.

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

@test "T002135: no .gitmodules — repo stays submodule-free" {
  [ ! -e "$REPO_ROOT/.gitmodules" ]
}

@test "T002135: no gitlink entries (mode 160000) anywhere in the index" {
  gitlinks="$(git -C "$REPO_ROOT" ls-files --stage | awk '$1 == "160000"' | wc -l)"
  [ "$gitlinks" -eq 0 ]
}

@test "T002135: bats libs are tracked regular files present in the checkout" {
  tracked="$(git -C "$REPO_ROOT" ls-files -- tests/unit/lib/bats-core | wc -l)"
  [ "$tracked" -gt 0 ]
  [ -x "$REPO_ROOT/tests/unit/lib/bats-core/bin/bats" ]
  [ -f "$REPO_ROOT/tests/unit/lib/bats-support/load.bash" ]
  [ -f "$REPO_ROOT/tests/unit/lib/bats-assert/load.bash" ]
  [ -f "$REPO_ROOT/tests/unit/lib/bats-file/load.bash" ]
}
