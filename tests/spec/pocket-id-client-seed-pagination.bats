#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-pagination.bats
# SSOT: openspec/changes/pocket-id-seed-pagination/tasks.md (T001996)
#
# Verifies find_client_id() in pocket-id-client-seed.yaml searches ALL pages
# of GET /api/oidc/clients, not just page 1. Pocket ID v2.9.0 hard-caps
# itemsPerPage at 20 server-side (verified live: requesting itemsPerPage=100
# is silently ignored) -- once a brand accumulates >20 oidc_clients rows,
# the old single-page lookup stops finding existing clients on later pages
# and the job creates duplicate ("zombie") client rows instead. Live-observed
# on workspace-korczewski: 131 rows (expected ~19), 45 confirmed zombies.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-pagination.bats
# or:  task test:unit SPEC=pocket-id-client-seed-pagination

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"
MANIFEST="${K3D}/pocket-id-client-seed.yaml"

setup() {
  load 'test_helper'
}

# ── RED phase: reproduces the bug ──────────────────────────────────────────

@test "pocket-id-client-seed: find_client_id paginates across pages (RED: single unpaginated GET is the bug)" {
  # The bug: find_client_id() does exactly one GET with no pagination[page]
  # parameter, so it only ever sees the first 20 oidc_clients rows.
  #
  # RED → after fix: find_client_id must loop over pagination[page]=N.
  run grep -A6 'find_client_id() {' "$MANIFEST"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'pagination%5Bpage%5D'
}

@test "pocket-id-client-seed: find_client_id stops once totalPages is exhausted" {
  # After the fix, the loop must read totalPages from the response and
  # terminate instead of looping forever when the name is never found.
  run grep -A20 'find_client_id() {' "$MANIFEST"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'totalPages'
}
