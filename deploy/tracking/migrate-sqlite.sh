#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Migrate existing SQLite tracking.db → PostgreSQL (bachelorprojekt schema)
# Usage: ./migrate-sqlite.sh [path/to/tracking.db]
# Requires: sqlite3, psql (or kubectl port-forward)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SQLITE_DB="${1:-../Bachelorprojekt/tracking.db}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DB:-tracking}"
PG_USER="${PG_USER:-tracking}"
SCHEMA="bachelorprojekt"

if [[ ! -f "$SQLITE_DB" ]]; then
  echo "ERROR: SQLite database not found: $SQLITE_DB" >&2
  exit 1
fi

echo "=== Migrating $SQLITE_DB → PostgreSQL ($SCHEMA schema) ==="

# Export requirements
echo "  Exporting requirements..."
REQUIREMENTS_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT count(*) FROM requirements")
echo "  Found $REQUIREMENTS_COUNT requirements"

sqlite3 -csv "$SQLITE_DB" "SELECT id, category, name, description, acceptance_criteria, test_cases, automated, created_at FROM requirements" | \
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -c "
    SET search_path TO $SCHEMA;
    COPY requirements(id, category, name, description, acceptance_criteria, test_cases, automated, created_at)
    FROM STDIN WITH (FORMAT csv, NULL '')
  "

# Export pipeline
echo "  Exporting pipeline..."
PIPELINE_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT count(*) FROM pipeline")
echo "  Found $PIPELINE_COUNT pipeline entries"

sqlite3 -csv "$SQLITE_DB" "SELECT req_id, stage, status, updated_at, commit_ref, notes FROM pipeline" | \
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -c "
    SET search_path TO $SCHEMA;
    COPY pipeline(req_id, stage, status, updated_at, commit_ref, notes)
    FROM STDIN WITH (FORMAT csv, NULL '')
  "

# Export test_runs (if any)
RUNS_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT count(*) FROM test_runs")
if [[ "$RUNS_COUNT" -gt 0 ]]; then
  echo "  Exporting $RUNS_COUNT test runs..."
  sqlite3 -csv "$SQLITE_DB" "SELECT id, run_date, tier, host, total, pass, fail, skip, json_path FROM test_runs" | \
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -c "
      SET search_path TO $SCHEMA;
      COPY test_runs(id, run_date, tier, host, total, pass, fail, skip, json_path)
      FROM STDIN WITH (FORMAT csv, NULL '')
    "

  RESULTS_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT count(*) FROM test_results")
  if [[ "$RESULTS_COUNT" -gt 0 ]]; then
    echo "  Exporting $RESULTS_COUNT test results..."
    sqlite3 -csv "$SQLITE_DB" "SELECT id, run_id, req_id, test_name, description, status, duration_ms, detail FROM test_results" | \
      psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -c "
        SET search_path TO $SCHEMA;
        COPY test_results(id, run_id, req_id, test_name, description, status, duration_ms, detail)
        FROM STDIN WITH (FORMAT csv, NULL '')
      "
  fi
fi

echo ""
echo "=== Migration complete ==="
echo "  Requirements: $REQUIREMENTS_COUNT"
echo "  Pipeline:     $PIPELINE_COUNT"
echo "  Test runs:    $RUNS_COUNT"
echo ""
echo "Verify with:"
echo "  psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DB -c 'SELECT * FROM $SCHEMA.v_pipeline_status'"
