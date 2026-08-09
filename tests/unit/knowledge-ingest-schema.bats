#!/usr/bin/env bats

load test_helper

setup_file() {
  export MANIFESTS_DIR="${PROJECT_DIR}/k3d"
  export RENDERED="${BATS_FILE_TMPDIR}/rendered-knowledge-schema.yaml"
  kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
}

@test "ingest-prs.mjs does NOT query non-existent columns (body, labels)" {
  # The broken columns should NOT be found in the SELECT query.
  # [T002605] Quelle ist jetzt tickets.ticket_links — der SELECT beginnt mit
  # 'SELECT DISTINCT l.pr_number' (Live-Quelle statt bachelorprojekt.features).
  run grep -A 10 "SELECT DISTINCT l.pr_number" "$RENDERED"
  assert_success
  
  refute_line --partial "body,"
  refute_line --partial "labels"
}
