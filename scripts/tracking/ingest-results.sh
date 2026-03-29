#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# ingest-results.sh — Import test results JSON into tracking.db
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/tracking/ingest-results.sh <results.json>
#
# Reads a runner.sh JSON report, writes test_runs + test_results,
# and updates pipeline testing stages automatically.
#
# Success criteria for the "testing" pipeline stage:
#   - ALL test cases for a requirement must pass
#   - If any test fails → stage = 'fail'
#   - If all pass       → stage = 'done'
#   - If all skipped     → stage = 'skip'
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB="${PROJECT_DIR}/tracking.db"

if [[ ! -f "$DB" ]]; then
  echo "Error: tracking.db not found. Run init-db.sh first." >&2
  exit 1
fi

JSON_FILE="${1:?Usage: $0 <results.json>}"
if [[ ! -f "$JSON_FILE" ]]; then
  echo "Error: File not found: ${JSON_FILE}" >&2
  exit 1
fi

# ── Parse report metadata ────────────────────────────────────────
tier=$(jq -r '.meta.tier' "$JSON_FILE")
run_date=$(jq -r '.meta.date' "$JSON_FILE")
host=$(jq -r '.meta.host' "$JSON_FILE")
total=$(jq -r '.summary.total' "$JSON_FILE")
pass=$(jq -r '.summary.pass' "$JSON_FILE")
fail=$(jq -r '.summary.fail' "$JSON_FILE")
skip=$(jq -r '.summary.skip' "$JSON_FILE")
json_path=$(realpath "$JSON_FILE")

echo "Ingesting: ${tier} tier, ${run_date} (${total} assertions)"

# ── Insert test run ──────────────────────────────────────────────
run_id=$(sqlite3 "$DB" "
  INSERT INTO test_runs (run_date, tier, host, total, pass, fail, skip, json_path)
  VALUES ('${run_date}', '${tier}', '${host}', ${total}, ${pass}, ${fail}, ${skip}, '${json_path}');
  SELECT last_insert_rowid();
")

echo "  Created test_run #${run_id}"

# ── Insert individual results ────────────────────────────────────
jq -c '.results[]' "$JSON_FILE" | while IFS= read -r result; do
  req=$(echo "$result" | jq -r '.req')
  test_name=$(echo "$result" | jq -r '.test')
  desc=$(echo "$result" | jq -r '.desc' | sed "s/'/''/g")
  status=$(echo "$result" | jq -r '.status')
  duration=$(echo "$result" | jq -r '.duration_ms')
  detail=$(echo "$result" | jq -r '.detail // ""' | sed "s/'/''/g")

  sqlite3 "$DB" "INSERT INTO test_results (run_id, req_id, test_name, description, status, duration_ms, detail)
    VALUES (${run_id}, '${req}', '${test_name}', '${desc}', '${status}', ${duration}, '${detail}');"
done

# ── Update pipeline testing stages ───────────────────────────────
# For each requirement that had test results: determine overall status
echo "  Updating pipeline stages..."

sqlite3 "$DB" "
  -- Requirements where ALL tests passed → testing = done
  UPDATE pipeline SET status = 'done', updated_at = datetime('now')
  WHERE stage = 'testing'
  AND req_id IN (
    SELECT DISTINCT req_id FROM test_results WHERE run_id = ${run_id}
    EXCEPT
    SELECT DISTINCT req_id FROM test_results WHERE run_id = ${run_id} AND status != 'pass'
  );

  -- Requirements with ANY failure → testing = fail
  UPDATE pipeline SET status = 'fail', updated_at = datetime('now')
  WHERE stage = 'testing'
  AND req_id IN (
    SELECT DISTINCT req_id FROM test_results WHERE run_id = ${run_id} AND status = 'fail'
  );

  -- Requirements where ALL tests skipped → testing = skip
  UPDATE pipeline SET status = 'skip', updated_at = datetime('now')
  WHERE stage = 'testing'
  AND req_id IN (
    SELECT req_id FROM test_results WHERE run_id = ${run_id}
    GROUP BY req_id
    HAVING COUNT(*) = SUM(CASE WHEN status = 'skip' THEN 1 ELSE 0 END)
  );

  -- If testing is done, mark implementation as done too (if still pending)
  UPDATE pipeline SET status = 'done', updated_at = datetime('now')
  WHERE stage = 'implementation' AND status = 'pending'
  AND req_id IN (
    SELECT req_id FROM pipeline WHERE stage = 'testing' AND status = 'done'
  );
"

# ── Print summary ────────────────────────────────────────────────
echo ""
echo "Results ingested into run #${run_id}:"
sqlite3 -header -column "$DB" "
  SELECT req_id, test_name, status, duration_ms
  FROM test_results WHERE run_id = ${run_id}
  ORDER BY req_id, test_name;
"
echo ""

# Show updated pipeline for affected requirements
affected=$(sqlite3 "$DB" "SELECT DISTINCT req_id FROM test_results WHERE run_id = ${run_id};" | tr '\n' ',' | sed 's/,$//')
if [[ -n "$affected" ]]; then
  echo "Pipeline updates:"
  sqlite3 -header -column "$DB" "
    SELECT * FROM v_pipeline_status
    WHERE id IN (${affected// /,});
  "
fi
