#!/usr/bin/env bats

load test_helper

@test "coaching:ingest-json task exists in Taskfile.yml" {
  run grep -c "coaching:ingest-json:" "${PROJECT_DIR}/Taskfile.yml"
  assert_success
  assert_output "1"
}

@test "ingest-json.mts script exists" {
  run test -f "${PROJECT_DIR}/scripts/coaching/ingest-json.mts"
  assert_success
}

@test "ingest-json-core.ts exists in website/src/lib" {
  run test -f "${PROJECT_DIR}/website/src/lib/ingest-json-core.ts"
  assert_success
}

@test "ingest-json.mts exits 2 with no args" {
  run bash -c "cd '${PROJECT_DIR}/website' && npx tsx ../scripts/coaching/ingest-json.mts 2>&1; echo EXIT:\$?"
  assert_output --partial "EXIT:2"
  assert_output --partial "Usage:"
}

@test "ingest-json.mts exits 1 on malformed JSON content" {
  local bad_json="${BATS_TEST_TMPDIR}/bad.json"
  echo '[{"id":"x"}]' > "$bad_json"
  run bash -c "PGHOST=127.0.0.1 PGPORT=1 cd '${PROJECT_DIR}/website' && npx tsx ../scripts/coaching/ingest-json.mts '$bad_json' test-slug 2>&1; echo EXIT:\$?"
  assert_output --partial "content fehlt"
}
