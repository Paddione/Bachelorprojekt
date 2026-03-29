#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# init-db.sh — Initialize the SQLite tracking database
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/tracking/init-db.sh [--reset]
#
# Creates tracking.db from schema.sql, then imports all requirements
# from docs/requirements/*.json and seeds the pipeline stages.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB="${PROJECT_DIR}/tracking.db"
SCHEMA="${SCRIPT_DIR}/schema.sql"
REQ_DIR="${PROJECT_DIR}/docs/requirements"

# ── Args ─────────────────────────────────────────────────────────
if [[ "${1:-}" == "--reset" ]]; then
  echo "Resetting database..."
  rm -f "$DB"
fi

if [[ -f "$DB" && "${1:-}" != "--reset" ]]; then
  echo "Database already exists at ${DB}"
  echo "Use --reset to recreate from scratch."
  exit 0
fi

# ── Prerequisites ────────────────────────────────────────────────
for cmd in sqlite3 jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed." >&2
    exit 1
  fi
done

# ── Create schema ────────────────────────────────────────────────
echo "Creating database schema..."
sqlite3 "$DB" < "$SCHEMA"

# ── Import requirements ──────────────────────────────────────────
echo "Importing requirements..."

STAGES=("idea" "implementation" "testing" "documentation" "archive")

import_requirements() {
  local file="$1"
  local filename
  filename=$(basename "$file" .json)
  # Extract category prefix: SA, FA, NFA, AK, L
  local category="${filename%%_*}"

  # Handle both object format {ID: {...}} and array format [{ID: ..., ...}]
  local is_array
  is_array=$(jq 'type == "array"' "$file")

  # Normalize both formats to JSON lines with stable keys
  local jq_script
  jq_script=$(mktemp)
  if [[ "$is_array" == "true" ]]; then
    cat > "$jq_script" <<'JQEOF'
.[] | {id: .ID, name: .Bezeichnung, desc: .Beschreibung, criteria: (.["Erf\u00fcllungskriterien"] // ""), tests: .Testfall}
JQEOF
  else
    cat > "$jq_script" <<'JQEOF'
to_entries[] | {id: .key, name: .value.Bezeichnung, desc: .value.Beschreibung, criteria: (.value["Erf\u00fcllungskriterien"] // ""), tests: .value.Testfall}
JQEOF
  fi

  jq -c -f "$jq_script" "$file" | while IFS= read -r row; do
    local id name desc criteria tests
    id=$(echo "$row" | jq -r '.id')
    name=$(echo "$row" | jq -r '.name')
    desc=$(echo "$row" | jq -r '.desc')
    criteria=$(echo "$row" | jq -r '.criteria')
    tests=$(echo "$row" | jq -r '.tests')
    local automated=0
    [[ -f "${PROJECT_DIR}/tests/local/${id}.sh" ]] && automated=1

    sqlite3 "$DB" "INSERT OR REPLACE INTO requirements (id, category, name, description, acceptance_criteria, test_cases, automated)
      VALUES ('${id}', '${category}', $(sqlite_quote "$name"), $(sqlite_quote "$desc"), $(sqlite_quote "$criteria"), $(sqlite_quote "$tests"), ${automated});"

    for stage in "${STAGES[@]}"; do
      sqlite3 "$DB" "INSERT OR IGNORE INTO pipeline (req_id, stage) VALUES ('${id}', '${stage}');"
    done
  done
  rm -f "$jq_script"
}

# Helper: safely quote strings for SQLite (escape single quotes)
sqlite_quote() {
  local val="$1"
  val="${val//\'/\'\'}"
  echo "'${val}'"
}

# Auto-detect idea stage: all requirements start as "done" for idea
# (they're defined in the JSON, so the idea exists)
mark_idea_done() {
  sqlite3 "$DB" "UPDATE pipeline SET status = 'done', updated_at = datetime('now')
    WHERE stage = 'idea';"
}

# Auto-detect implementation: if test files exist, implementation is likely done
mark_implementation_from_tests() {
  for test_file in "${PROJECT_DIR}"/tests/local/*.sh; do
    [[ -f "$test_file" ]] || continue
    local req_id
    req_id=$(basename "$test_file" .sh)
    sqlite3 "$DB" "UPDATE pipeline SET status = 'done', updated_at = datetime('now')
      WHERE req_id = '${req_id}' AND stage = 'implementation'
      AND EXISTS (SELECT 1 FROM requirements WHERE id = '${req_id}');"
  done
}

# Import all requirement files
for req_file in "${REQ_DIR}"/*_requirements.json; do
  [[ -f "$req_file" ]] || continue
  echo "  ← $(basename "$req_file")"
  import_requirements "$req_file"
done

mark_idea_done
mark_implementation_from_tests

# ── Summary ──────────────────────────────────────────────────────
total=$(sqlite3 "$DB" "SELECT COUNT(*) FROM requirements;")
automated=$(sqlite3 "$DB" "SELECT COUNT(*) FROM requirements WHERE automated = 1;")
echo ""
echo "Done! Imported ${total} requirements (${automated} with automated tests)."
echo "Database: ${DB}"
echo ""
echo "Next steps:"
echo "  ./scripts/tracking/status.sh          # view pipeline"
echo "  ./scripts/tracking/update-pipeline.sh  # update stages"
