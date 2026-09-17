#!/usr/bin/env bash
# scripts/lib/application-pipeline-db.sh — Shared DB functions for application pipeline (T900228)
# Sourced by scripts/vda/apply/ingest.sh and scripts/vda/apply/import-bootstrap.sh.

_app_pipeline_repo_root() {
  local dir; dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  echo "$dir"
}

_app_pipeline_resolve_db() {
  local root; root="$(_app_pipeline_repo_root)"
  if [[ -f "${root}/scripts/factory/lib.sh" ]]; then
    source "${root}/scripts/factory/lib.sh"
    factory_resolve >/dev/null 2>&1 || true
  fi
}

_app_pipeline_exec_sql() {
  local sql="$1"; shift
  _app_pipeline_resolve_db
  if [[ -n "${FACTORY_PG_URL:-}" ]]; then
    echo "$sql" | psql "$FACTORY_PG_URL" -qtA -v ON_ERROR_STOP=1 "$@"
  else
    local pod
    pod="$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
      -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name 2>/dev/null | head -1)"
    if [[ -z "$pod" ]]; then
      echo "Error: no running shared-db pod found" >&2
      return 1
    fi
    echo "$sql" | kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
      -c postgres -- psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@" 2>/dev/null
  fi
}

# app_pipeline_upsert_job <company> <role> <source_url> <raw_text> <requirements> <status>
# Returns new job id or "DUPLICATE" on stdout.
app_pipeline_upsert_job() {
  local company="$1"
  local role="$2"
  local source_url="${3:-}"
  local raw_text="${4:-}"
  local requirements="${5:-}"
  local status="${6:-found}"

  local sql="INSERT INTO applications.jobs (company, role_title, source_url, raw_text, requirements, status)
VALUES (:'company', :'role', NULLIF(:'source_url', ''), :'raw_text', NULLIF(:'requirements', ''), :'status')
ON CONFLICT (company, role_title) DO NOTHING
RETURNING id;"

  local out
  out="$(_app_pipeline_exec_sql "$sql" \
    -v company="$company" \
    -v role="$role" \
    -v source_url="$source_url" \
    -v raw_text="$raw_text" \
    -v requirements="$requirements" \
    -v status="$status" | tr -d '[:space:]')"

  if [[ -z "$out" ]]; then
    echo "DUPLICATE"
  else
    echo "$out"
  fi
}

# app_pipeline_insert_dossier <job_id> <artifact_path> <kind>
app_pipeline_insert_dossier() {
  local job_id="$1"
  local artifact_path="$2"
  local kind="$3"

  local sql="INSERT INTO applications.dossiers (job_id, artifact_path, kind)
VALUES (:'job_id'::int, :'artifact_path', :'kind')
RETURNING id;"

  _app_pipeline_exec_sql "$sql" \
    -v job_id="$job_id" \
    -v artifact_path="$artifact_path" \
    -v kind="$kind" | tr -d '[:space:]'
}

# app_pipeline_insert_timeline <job_id> <event_type> <notes> [created_at]
app_pipeline_insert_timeline() {
  local job_id="$1"
  local event_type="$2"
  local notes="${3:-}"
  local created_at="${4:-}"

  local sql
  if [[ -n "$created_at" ]]; then
    sql="INSERT INTO applications.timeline (job_id, event_type, notes, created_at)
VALUES (:'job_id'::int, :'event_type', NULLIF(:'notes', ''), :'created_at'::timestamptz)
RETURNING id;"
    _app_pipeline_exec_sql "$sql" \
      -v job_id="$job_id" \
      -v event_type="$event_type" \
      -v notes="$notes" \
      -v created_at="$created_at" | tr -d '[:space:]'
  else
    sql="INSERT INTO applications.timeline (job_id, event_type, notes)
VALUES (:'job_id'::int, :'event_type', NULLIF(:'notes', ''))
RETURNING id;"
    _app_pipeline_exec_sql "$sql" \
      -v job_id="$job_id" \
      -v event_type="$event_type" \
      -v notes="$notes" | tr -d '[:space:]'
  fi
}
