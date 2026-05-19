#!/usr/bin/env bats

load test_helper

setup_file() {
  export MANIFESTS_DIR="${PROJECT_DIR}/k3d"
  export RENDERED="${BATS_FILE_TMPDIR}/rendered-knowledge-bugs.yaml"
  kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
}

@test "ingest-bug-tickets.mjs does NOT query non-existent columns (id, title)" {
  # The broken columns should NOT be found in the SELECT query
  run grep "SELECT id, title" "$RENDERED"
  assert_failure
  
  # ticket_id SHOULD be found
  run grep "ticket_id," "$RENDERED"
  assert_success
}
