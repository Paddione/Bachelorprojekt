#!/usr/bin/env bats

load test_helper

setup_file() {
  export MANIFESTS_DIR="${PROJECT_DIR}/k3d"
  export RENDERED="${BATS_FILE_TMPDIR}/rendered-knowledge.yaml"
  kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
}

@test "knowledge-ingest init containers do NOT install directly in /scripts (readonly mount)" {
  # The broken command should NOT be found
  run grep -F "cd /scripts && npm install pg --no-package-lock --silent" "$RENDERED"
  assert_failure
}

@test "knowledge-ingest init containers use prefix /tmp for npm install" {
  # The fix command SHOULD be found
  run grep -F -e "--prefix /tmp" "$RENDERED"
  assert_success
  
  run grep -F "cp -r /tmp/node_modules/*" "$RENDERED"
  assert_success
}
