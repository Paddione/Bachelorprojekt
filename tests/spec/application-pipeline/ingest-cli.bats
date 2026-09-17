#!/usr/bin/env bats
# tests/spec/application-pipeline/ingest-cli.bats
# Guard for CLI job ingestion (scripts/vda/apply/ingest.sh, Phase 1, T900228).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  INGEST_SCRIPT="${REPO_ROOT}/scripts/vda/apply/ingest.sh"
  source "${REPO_ROOT}/scripts/factory/lib.sh" 2>/dev/null || true
  factory_resolve >/dev/null 2>&1 || true
  _skip_if_no_db

  TEST_RUN_ID="test-$$-$RANDOM"
  TEST_COMPANY="TestCorp-${TEST_RUN_ID}"
  TEST_ROLE="Senior DevOps Engineer"
}

teardown() {
  if [[ -n "${TEST_COMPANY:-}" ]]; then
    _query "DELETE FROM applications.jobs WHERE company = '${TEST_COMPANY}';" >/dev/null 2>&1 || true
  fi
}

_skip_if_no_db() {
  if [[ -n "${FACTORY_PG_URL:-}" ]]; then
    return 0
  fi
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1) || true
  if [[ -z "$_pod" ]]; then
    skip "no Running shared-db pod reachable (offline/CI)"
  fi
}

_query() {
  local sql="$1"
  if [[ -n "${FACTORY_PG_URL:-}" ]]; then
    psql "$FACTORY_PG_URL" -qtA -v ON_ERROR_STOP=1 -c "$sql"
  else
    local pod
    pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
      -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running -o name 2>/dev/null | head -1)
    kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
      -c postgres -- psql -U website -d website -qtA -v ON_ERROR_STOP=1 -c "$sql"
  fi
}

@test "T900228: ingest.sh exists and is executable" {
  [ -f "$INGEST_SCRIPT" ]
  [ -x "$INGEST_SCRIPT" ]
}

@test "T900228: ingest.sh ingests job posting from file into applications.jobs" {
  [ -f "$INGEST_SCRIPT" ] || skip "ingest.sh does not exist yet"

  JOB_FILE="${BATS_TEST_TMPDIR}/posting.txt"
  cat <<EOF > "$JOB_FILE"
${TEST_ROLE} @ ${TEST_COMPANY}
Requirements: Kubernetes, PostgreSQL, Linux, Docker, FluxCD.
We are looking for an experienced DevOps specialist to lead our fleet operations.
Apply at https://example.com/jobs/123
EOF

  run bash "$INGEST_SCRIPT" --file "$JOB_FILE"
  [ "$status" -eq 0 ]

  run _query "SELECT status FROM applications.jobs WHERE company='${TEST_COMPANY}' AND role_title='${TEST_ROLE}';"
  [ "$status" -eq 0 ]
  [ "$output" = "found" ]

  run _query "SELECT count(*) FROM applications.jobs WHERE company='${TEST_COMPANY}';"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "T900228: ingest.sh handles duplicate company and role cleanly without raw SQL error" {
  [ -f "$INGEST_SCRIPT" ] || skip "ingest.sh does not exist yet"

  JOB_FILE="${BATS_TEST_TMPDIR}/posting_dup.txt"
  cat <<EOF > "$JOB_FILE"
${TEST_ROLE} @ ${TEST_COMPANY}
Requirements: Kubernetes, PostgreSQL.
Initial posting description.
EOF

  # First ingestion
  run bash "$INGEST_SCRIPT" --file "$JOB_FILE"
  [ "$status" -eq 0 ]

  # Duplicate ingestion
  run bash "$INGEST_SCRIPT" --file "$JOB_FILE"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Duplicate" || "$output" =~ "already ingested" ]]

  # Verify still only 1 row exists
  run _query "SELECT count(*) FROM applications.jobs WHERE company='${TEST_COMPANY}' AND role_title='${TEST_ROLE}';"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}
