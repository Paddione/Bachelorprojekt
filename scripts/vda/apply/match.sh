#!/usr/bin/env bash
# scripts/vda/apply/match.sh — Deterministic keyword-based match scoring (Phase 2, T900234)
#
# Computes a deterministic match score (0-100) for a job posting by matching its
# requirements text against the curated evidence catalog, and persists the score
# and selected evidence IDs on the job record.
#
# Usage: scripts/vda/apply/match.sh --job-id <id>
# Score formula: score = min(100, treffer_summe * 20)
# Default fallback: 20 (single default entry, 1 hit * 20)

set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_repo_root="$(cd "$_script_dir/../../.." && pwd)"
_lib_dir="${_repo_root}/scripts/lib"

# --- Arg parsing ---
job_id=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id) job_id="$2"; shift 2 ;;
    *) echo "Error: unknown option '$1'" >&2; echo "Usage: $0 --job-id <id>" >&2; exit 1 ;;
  esac
done

if [[ -z "$job_id" ]]; then
  echo "Error: --job-id is required" >&2
  echo "Usage: $0 --job-id <id>" >&2
  exit 1
fi

# --- Load evidence library ---
if [[ ! -f "${_lib_dir}/application-pipeline-evidence.sh" ]]; then
  echo "Error: evidence library not found at ${_lib_dir}/application-pipeline-evidence.sh" >&2
  exit 1
fi
source "${_lib_dir}/application-pipeline-evidence.sh"

# --- Load DB helper ---
if [[ ! -f "${_lib_dir}/application-pipeline-db.sh" ]]; then
  echo "Error: DB helper not found at ${_lib_dir}/application-pipeline-db.sh" >&2
  exit 1
fi
source "${_lib_dir}/application-pipeline-db.sh"

# --- Load requirements text ---
requirements=$(_app_pipeline_exec_sql "SELECT requirements FROM applications.jobs WHERE id = :'job_id'::int;" -v job_id="$job_id" 2>/dev/null | tr -d '[:space:]')

if [[ -z "$requirements" ]]; then
  echo "Error: job $job_id not found or has no requirements text" >&2
  exit 1
fi

echo "Computing match score for job $job_id..."

# --- Run evidence selection ---
echo "Running evidence selection..."
evidence_output=$(app_pipeline_select_evidence "$requirements")

if [[ -z "$evidence_output" ]]; then
  echo "Warning: no evidence entries returned — setting default score" >&2
  _app_pipeline_exec_sql "UPDATE applications.jobs SET match_score = 20, match_evidence_ids = ARRAY[]::TEXT[] WHERE id = :'job_id'::int;" -v job_id="$job_id" 2>/dev/null
  echo "Set match_score=20 (no evidence available)"
  exit 0
fi

# --- Compute score: sum of match_counts, score = min(100, sum * 20) ---
treffer_summe=0
evidence_ids=()

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # Parse match_count from JSON: {"id":"...","label":"...","summary":"...","match_count":N}
  mc=$(echo "$line" | grep -o '"match_count":[0-9]*' | grep -o '[0-9]*$' || true)
  mc="${mc:-0}"
  treffer_summe=$((treffer_summe + mc))

  # Parse id
  eid=$(echo "$line" | grep -o '"id":"[^"]*"' | sed 's/"id":"//;s/"$//' || true)
  eid="${eid:-}"
  if [[ -n "$eid" ]]; then
    evidence_ids+=("$eid")
  fi
done <<< "$evidence_output"

# score = min(100, treffer_summe * 20)
if [[ $treffer_summe -eq 0 ]]; then
  score=20  # default fallback
else
  score=$((treffer_summe * 20))
  if [[ $score -gt 100 ]]; then
    score=100
  fi
fi

# --- Build evidence_ids array string for SQL (PostgreSQL array literal {a,b,c}) ---
if [[ ${#evidence_ids[@]} -eq 0 ]]; then
  sql_ids=""
else
  sql_ids="{"
  for i in "${!evidence_ids[@]}"; do
    if [[ $i -gt 0 ]]; then
      sql_ids+=","
    fi
    sql_ids+="${evidence_ids[$i]}"
  done
  sql_ids+="}"
fi

echo "match_score=${score}, evidence_hits=${treffer_summe}, evidence_ids_count=${#evidence_ids[@]}"

# --- Persist to DB ---
_app_pipeline_exec_sql "UPDATE applications.jobs SET match_score = :'score', match_evidence_ids = :'evidence_ids'::text[] WHERE id = :'job_id'::int;" \
  -v score="$score" \
  -v evidence_ids="$sql_ids" \
  -v job_id="$job_id" 2>/dev/null

echo "Done. Updated job $job_id: match_score=$score"
