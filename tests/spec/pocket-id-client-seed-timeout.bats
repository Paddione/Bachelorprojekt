#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-timeout.bats
# SSOT: openspec/changes/pocket-id-client-seed-timeout/tasks.md (T001327)
#
# Verifies that the pocket-id-client-seed init container timeout is raised
# to accommodate cold-start scenarios. RED phase: expects -ge 60 (the
# too-low default); GREEN phase: expects -ge 300 (the fix).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-timeout.bats
# or:  task test:unit SPEC=pocket-id-client-seed-timeout

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"
MANIFEST="${K3D}/pocket-id-client-seed.yaml"

setup() {
  load 'test_helper'
}

# ── RED phase: reproduces the bug ──────────────────────────────────────────

@test "pocket-id-client-seed: init container timeout is sufficient for cold start (RED: -ge 60 is too low)" {
  # The bug: init container fails after 60 iterations (120s) when pocket-id
  # + shared-db are still starting. This test FAILS because we expect the
  # timeout to be higher than the buggy value.
  #
  # RED → after fix: change expectation from 60 to 300
  grep -qE 'if \[ "\$i" -ge 60 \];' "$MANIFEST" && return 1 || return 0
}

@test "pocket-id-client-seed: backoffLimit is reasonable for the increased timeout" {
  # The job's backoffLimit should be lowered (from 5 to 2) since the
  # init container now waits much longer internally.
  #
  # RED → after fix: change expectation from 5 to 2
  grep -qE 'backoffLimit: 5' "$MANIFEST" && return 1 || return 0
}
