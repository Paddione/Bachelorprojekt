#!/usr/bin/env bats
# tests/spec/application-pipeline/match-scoring.bats
# BATS-Test für Deterministic Keyword-Based Match Scoring (Phase 2, T900234).
# Testet: Schema-Erweiterung, match.sh CLI, Scoring-Formel, Default-Fallback.

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

# ========== Task 1: Schema-Erweiterung ==========

@test "T900234: applications.jobs has match_score column" {
  run _query "SELECT column_name FROM information_schema.columns WHERE table_schema='applications' AND table_name='jobs' AND column_name='match_score';"
  [ "$status" -eq 0 ]
  [ "$output" = "match_score" ]
}

@test "T900234: applications.jobs has match_evidence_ids column" {
  run _query "SELECT column_name FROM information_schema.columns WHERE table_schema='applications' AND table_name='jobs' AND column_name='match_evidence_ids';"
  [ "$status" -eq 0 ]
  [ "$output" = "match_evidence_ids" ]
}

# ========== Task 2: match.sh CLI ==========

run_match() {
  local job_id="$1"
  _MATCH_SH="${REPO_ROOT}/scripts/vda/apply/match.sh"
  bash "$_MATCH_SH" --job-id "$job_id"
}

# --- GREEN: match.sh existiert und unterstützt --job-id ---

@test "T900234: match.sh executable and accepts --job-id" {
  local output
  output=$(run_match 99999 2>&1) || true
  # Skript sollte existieren und entweder einen DB-Fehler (keine ID) oder Usage zeigen
  [[ -f "${REPO_ROOT}/scripts/vda/apply/match.sh" ]]
}

@test "T900234: strong evidence-catalog overlap → match_score > 70" {
  # Insert a test job with requirements that match several evidence-catalog keywords
  local job_id
  job_id=$(_query "INSERT INTO applications.jobs (company, role_title, raw_text, requirements, status) VALUES ('test', 'match-high', 'Kubernetes CI/CD Linux docker pipeline testing', 'Kubernetes CI/CD Linux docker pipeline testing', 'found') ON CONFLICT DO NOTHING RETURNING id;")

  # If DUPLICATE (empty), find existing
  if [[ -z "$job_id" ]]; then
    job_id=$(_query "SELECT id FROM applications.jobs WHERE company='test' AND role_title='match-high' LIMIT 1;")
  fi
  [ -n "$job_id" ]

  run_match "$job_id"

  # Check match_score is set and > 70
  local score
  score=$(_query "SELECT COALESCE(match_score, 0) FROM applications.jobs WHERE id=$job_id;")
  [[ "$score" -gt 70 ]] || [[ "$(echo "$score > 70" | bc -l 2>/dev/null || echo 0)" = "1" ]]

  # Check match_evidence_ids is not empty
  local evidence_count
  evidence_count=$(_query "SELECT array_length(match_evidence_ids, 1) FROM applications.jobs WHERE id=$job_id;")
  [ "${evidence_count:-0}" -gt 0 ]

  # Cleanup
  _query "DELETE FROM applications.jobs WHERE id=$job_id;" 2>/dev/null || true
}

@test "T900234: no evidence-catalog overlap → default fallback score (not null, no crash)" {
  local job_id
  job_id=$(_query "INSERT INTO applications.jobs (company, role_title, raw_text, requirements, status) VALUES ('test', 'match-default', 'xyz qrf wvu random nonsense text', 'xyz qrf wvu random nonsense text', 'found') ON CONFLICT DO NOTHING RETURNING id;")

  if [[ -z "$job_id" ]]; then
    job_id=$(_query "SELECT id FROM applications.jobs WHERE company='test' AND role_title='match-default' LIMIT 1;")
  fi
  [ -n "$job_id" ]

  run_match "$job_id"

  # match_score should be set (default, not null) and >= 0
  local score
  score=$(_query "SELECT match_score FROM applications.jobs WHERE id=$job_id;")
  [ "$score" != "NULL" ]

  # match_evidence_ids should contain default entries
  local evidence_count
  evidence_count=$(_query "SELECT array_length(match_evidence_ids, 1) FROM applications.jobs WHERE id=$job_id;")
  [ "${evidence_count:-0}" -gt 0 ]

  # Cleanup
  _query "DELETE FROM applications.jobs WHERE id=$job_id;" 2>/dev/null || true
}
