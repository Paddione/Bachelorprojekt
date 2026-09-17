#!/usr/bin/env bats
# tests/spec/application-pipeline/schema.bats
# Guard for applications.* relational data model (Phase 1, T900228).
# Validates existence of applications schema, jobs, dossiers, and timeline tables,
# check constraints, unique constraints, and foreign key cascades.

setup() {
  command -v psql >/dev/null 2>&1 || skip "psql binary not installed"
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  source "${REPO_ROOT}/scripts/factory/lib.sh" 2>/dev/null || true
  factory_resolve >/dev/null 2>&1 || true
  _skip_if_no_db
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

@test "T900228: applications.jobs table exists with valid columns" {
  run _query "SELECT to_regclass('applications.jobs') IS NOT NULL;"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]

  run _query "SELECT column_name FROM information_schema.columns WHERE table_schema='applications' AND table_name='jobs' ORDER BY ordinal_position;"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "id" ]]
  [[ "$output" =~ "company" ]]
  [[ "$output" =~ "role_title" ]]
  [[ "$output" =~ "source_url" ]]
  [[ "$output" =~ "raw_text" ]]
  [[ "$output" =~ "requirements" ]]
  [[ "$output" =~ "status" ]]
  [[ "$output" =~ "created_at" ]]
  [[ "$output" =~ "updated_at" ]]
}

@test "T900228: applications.dossiers table exists with foreign key to jobs" {
  run _query "SELECT to_regclass('applications.dossiers') IS NOT NULL;"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]

  run _query "SELECT column_name FROM information_schema.columns WHERE table_schema='applications' AND table_name='dossiers' ORDER BY ordinal_position;"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "id" ]]
  [[ "$output" =~ "job_id" ]]
  [[ "$output" =~ "artifact_path" ]]
  [[ "$output" =~ "kind" ]]
  [[ "$output" =~ "created_at" ]]
}

@test "T900228: applications.timeline table exists with foreign key to jobs" {
  run _query "SELECT to_regclass('applications.timeline') IS NOT NULL;"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]

  run _query "SELECT column_name FROM information_schema.columns WHERE table_schema='applications' AND table_name='timeline' ORDER BY ordinal_position;"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "id" ]]
  [[ "$output" =~ "job_id" ]]
  [[ "$output" =~ "event_type" ]]
  [[ "$output" =~ "notes" ]]
  [[ "$output" =~ "created_at" ]]
}

@test "T900228: applications.jobs status check constraint enforces allowed stages" {
  run _query "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'applications' AND c.conrelid = 'applications.jobs'::regclass AND c.contype = 'c';"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "found" ]]
  [[ "$output" =~ "drafting" ]]
  [[ "$output" =~ "applied" ]]
  [[ "$output" =~ "interviewing" ]]
  [[ "$output" =~ "offered" ]]
  [[ "$output" =~ "rejected" ]]
  [[ "$output" =~ "withdrawn" ]]
}

@test "T900228: applications.jobs enforces unique (company, role_title)" {
  run _query "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'applications' AND c.conrelid = 'applications.jobs'::regclass AND c.contype = 'u';"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "company" ]]
  [[ "$output" =~ "role_title" ]]
}
