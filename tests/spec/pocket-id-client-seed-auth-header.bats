#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-auth-header.bats
# SSOT: openspec/changes/pocket-id-client-seed-auth-header/specs/pocket-id-client-seed-auth-header.md (T001355)
#
# Verifies pocket-id-client-seed authenticates against Pocket ID's admin API
# with the X-API-KEY header, not Authorization: Bearer (which Pocket ID
# v2.9.0 rejects with 401 "You are not signed in" regardless of key
# validity -- live-verified 2026-07-01).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-auth-header.bats
# or:  task test:unit SPEC=pocket-id-client-seed-auth-header

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"
MANIFEST="${K3D}/pocket-id-client-seed.yaml"

setup() {
  load 'test_helper'
}

@test "pocket-id-client-seed: admin API auth uses X-API-KEY, not Authorization Bearer" {
  # The bug: AUTH="Authorization: Bearer ${POCKET_ID_API_KEY}" makes every
  # admin API call 401 regardless of key validity. Pocket ID v2.9.0 requires
  # X-API-KEY instead.
  run grep -qE 'AUTH="X-API-KEY: \$\{POCKET_ID_API_KEY\}"' "$MANIFEST"
  [ "$status" -eq 0 ]
}

@test "pocket-id-client-seed: no remaining Authorization Bearer auth header for the admin API" {
  run grep -qE 'AUTH="Authorization: Bearer' "$MANIFEST"
  [ "$status" -ne 0 ]
}
