#!/usr/bin/env bats
# tests/spec/openspec-worktree-anchor.bats
# SSOT: openspec/changes/openspec-worktree-anchor/tasks.md (T001997)
#
# Verifies scripts/openspec.sh and scripts/openspec-status-map.sh anchor
# their REPO root on the caller's actual working directory (git toplevel),
# not on the physical path the script file happens to be invoked with.
# The BASH_SOURCE-dirname pattern breaks in a worktree setup: invoking the
# script via a wrong relative path (e.g. `../../scripts/openspec.sh` from
# inside `.worktrees/<slug>/`, which resolves outside the worktree) makes
# REPO point at the wrong checkout even though $PWD was correct -- exactly
# what happened live during T001995 planning (T001997 mishap).

REPO="${REPO:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"

setup() {
  load 'test_helper'
}

# ── RED phase: reproduces the bug ──────────────────────────────────────────

@test "openspec.sh: REPO is anchored via git rev-parse --show-toplevel, not BASH_SOURCE path (RED)" {
  run grep -n 'REPO=.*git rev-parse --show-toplevel' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

@test "openspec.sh: no longer derives REPO from dirname of BASH_SOURCE" {
  run grep -n 'REPO="\$(cd "\$HERE/\.\." && pwd)"' "$REPO/scripts/openspec.sh"
  [ "$status" -ne 0 ]
}

@test "openspec-status-map.sh: REPO is anchored via git rev-parse --show-toplevel, not BASH_SOURCE path (RED)" {
  run grep -n 'REPO=.*git rev-parse --show-toplevel' "$REPO/scripts/openspec-status-map.sh"
  [ "$status" -eq 0 ]
}
