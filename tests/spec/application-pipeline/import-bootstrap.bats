#!/usr/bin/env bats
# tests/spec/application-pipeline/import-bootstrap.bats
# Guard for bootstrap import of existing application dossiers (Phase 1, T900228).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  BOOTSTRAP_SCRIPT="${REPO_ROOT}/scripts/vda/apply/import-bootstrap.sh"
  FIXTURES_DIR="${REPO_ROOT}/tests/fixtures/application-pipeline/bootstrap"

  source "${REPO_ROOT}/scripts/factory/lib.sh" 2>/dev/null || true
  factory_resolve >/dev/null 2>&1 || true
  _skip_if_no_db
}

teardown() {
  _query "DELETE FROM applications.jobs WHERE company IN ('TestCo', 'TestCo2');" >/dev/null 2>&1 || true
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

@test "T900228: import-bootstrap.sh exists and is executable" {
  [ -f "$BOOTSTRAP_SCRIPT" ]
  [ -x "$BOOTSTRAP_SCRIPT" ]
}

@test "T900228: import-bootstrap.sh imports dossiers and creates timeline events" {
  [ -f "$BOOTSTRAP_SCRIPT" ] || skip "import-bootstrap.sh does not exist yet"

  run bash "$BOOTSTRAP_SCRIPT" --dir "$FIXTURES_DIR" --status drafting --event-at "2026-09-15"
  [ "$status" -eq 0 ]

  # Verify job record
  run _query "SELECT status FROM applications.jobs WHERE company='TestCo' AND role_title='Test-Rolle';"
  [ "$status" -eq 0 ]
  [ "$output" = "drafting" ]

  # Verify dossier record
  run _query "SELECT d.kind, d.artifact_path FROM applications.dossiers d JOIN applications.jobs j ON j.id = d.job_id WHERE j.company='TestCo';"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "cover_letter" ]]
  [[ "$output" =~ "Anschreiben_TestCo_Test-Rolle.pdf" ]]

  # Verify timeline record
  run _query "SELECT t.event_type, t.created_at::date::text FROM applications.timeline t JOIN applications.jobs j ON j.id = t.job_id WHERE j.company='TestCo';"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "drafting" ]]
  [[ "$output" =~ "2026-09-15" ]]
}

@test "T900228: import-bootstrap.sh imports with default now() timeline event" {
  [ -f "$BOOTSTRAP_SCRIPT" ] || skip "import-bootstrap.sh does not exist yet"

  run bash "$BOOTSTRAP_SCRIPT" --dir "$FIXTURES_DIR" --status drafting
  [ "$status" -eq 0 ]

  # Verify timeline record has drafting event
  run _query "SELECT t.event_type FROM applications.timeline t JOIN applications.jobs j ON j.id = t.job_id WHERE j.company='TestCo';"
  [ "$status" -eq 0 ]
  [ "$output" = "drafting" ]
}

@test "T900228: import-bootstrap.sh ignores duplicate files without errors" {
  [ -f "$BOOTSTRAP_SCRIPT" ] || skip "import-bootstrap.sh does not exist yet"

  # First run
  run bash "$BOOTSTRAP_SCRIPT" --dir "$FIXTURES_DIR" --status drafting --event-at "2026-09-15"
  [ "$status" -eq 0 ]

  # Second run (duplicates)
  run bash "$BOOTSTRAP_SCRIPT" --dir "$FIXTURES_DIR" --status drafting --event-at "2026-09-15"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Duplicate" || "$output" =~ "already present" || "$output" =~ "skipping" ]]

  # Verify count remains 1
  run _query "SELECT count(*) FROM applications.jobs WHERE company='TestCo';"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}
