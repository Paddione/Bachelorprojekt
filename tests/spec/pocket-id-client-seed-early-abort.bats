#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-early-abort.bats
# SSOT: openspec/changes/pocket-id-seed-early-abort/tasks.md (T001995)
#
# Verifies pocket-id-client-seed aborts immediately when POCKET_ID_API_KEY is
# invalid (HTTP 401/403 from the admin API), BEFORE processing any ROWS
# entry. Without this guard, every upsert() call for every client silently
# treats the auth failure as "client not found" and attempts a POST (new
# client + new secret) before the script finally dies under `set -e` --
# each Kubernetes restartPolicy: OnFailure retry then adds more zombie
# client rows (root cause behind the 45 zombie rows found in T001992 on
# workspace-korczewski).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-early-abort.bats
# or:  task test:unit SPEC=pocket-id-client-seed-early-abort

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"
MANIFEST="${K3D}/pocket-id-client-seed.yaml"

setup() {
  load 'test_helper'
}

# ── RED phase: reproduces the bug ──────────────────────────────────────────

@test "pocket-id-client-seed: aborts on 401/403 auth check before processing ROWS (RED: no early auth check exists)" {
  # The bug: there is no up-front auth verification -- the script only
  # discovers an invalid API key while already inside the per-client loop.
  #
  # RED → after fix: an http_code capture + 401/403 check must appear
  # BEFORE the `echo "$ROWS" | while` loop.
  run grep -n 'echo "\$ROWS" | while' "$MANIFEST"
  [ "$status" -eq 0 ]
  rows_loop_line="${lines[0]%%:*}"

  run grep -n 'http_code' "$MANIFEST"
  [ "$status" -eq 0 ]
  auth_check_line="${lines[0]%%:*}"

  [ "$auth_check_line" -lt "$rows_loop_line" ]
}

@test "pocket-id-client-seed: auth check rejects on 401 or 403" {
  run grep -A5 'http_code' "$MANIFEST"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '401.*403|403.*401|"401"\)|"403"\)'
}
