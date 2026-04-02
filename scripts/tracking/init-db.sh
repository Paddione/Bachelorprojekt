#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# init-db.sh — Initialize the SQLite tracking database
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/tracking/init-db.sh [--reset]
#
# Creates tracking.db from schema.sql, then imports all requirements
# from docs/requirements/overview.md and seeds the pipeline stages.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB="${PROJECT_DIR}/tracking.db"
SCHEMA="${SCRIPT_DIR}/schema.sql"
OVERVIEW="${PROJECT_DIR}/../docs/requirements/overview.md"

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
for cmd in sqlite3 awk; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed." >&2
    exit 1
  fi
done

if [[ ! -f "$OVERVIEW" ]]; then
  echo "Error: requirements overview not found at ${OVERVIEW}" >&2
  exit 1
fi

# ── Create schema ────────────────────────────────────────────────
echo "Creating database schema..."
sqlite3 "$DB" < "$SCHEMA"

# ── Import requirements ──────────────────────────────────────────
echo "Importing requirements..."

STAGES=("idea" "implementation" "testing" "documentation" "archive")

import_requirements_from_md() {
  local file="$1"

  # Parse Markdown tables from overview.md using awk.
  # Section headers determine the German category name.
  # Data rows match: | XX-NN | Name | Description |
  while IFS=$'\t' read -r category id name desc criteria tests; do
    [[ -n "$id" ]] || continue

    local automated=0
    # Check local bash tests: exact match (FA-01.sh) or suffixed (SA-08-sso.sh)
    if compgen -G "${PROJECT_DIR}/tests/local/${id}.sh" >/dev/null 2>&1 || \
       compgen -G "${PROJECT_DIR}/tests/local/${id}-*.sh" >/dev/null 2>&1; then
      automated=1
    fi
    # Check e2e Playwright specs: e.g. fa-01-messaging.spec.ts
    local id_lower
    id_lower=$(echo "$id" | tr '[:upper:]' '[:lower:]')
    if compgen -G "${PROJECT_DIR}/tests/e2e/specs/${id_lower}-*.spec.ts" >/dev/null 2>&1 || \
       compgen -G "${PROJECT_DIR}/tests/e2e/specs/${id_lower}.spec.ts" >/dev/null 2>&1; then
      automated=1
    fi

    sqlite3 "$DB" "INSERT OR REPLACE INTO requirements (id, category, name, description, acceptance_criteria, test_cases, automated)
      VALUES ('${id}', '${category}', $(sqlite_quote "$name"), $(sqlite_quote "$desc"), $(sqlite_quote "$criteria"), $(sqlite_quote "$tests"), ${automated});"

    for stage in "${STAGES[@]}"; do
      sqlite3 "$DB" "INSERT OR IGNORE INTO pipeline (req_id, stage) VALUES ('${id}', '${stage}');"
    done
  done < <(awk -F' \\| ' '
    /^## Functional/      { cat = "Funktionale Anforderung" }
    /^## Security/        { cat = "Sicherheitsanforderung" }
    /^## Non-Functional/  { cat = "Nicht-Funktionale Anforderung" }
    /^## Acceptance/      { cat = "Abnahmekriterium" }
    /^## Deliverables/    { cat = "Auslieferbares Objekt" }
    /^\| [A-Z]+-[0-9]+/ {
      id       = $1; sub(/^\| /, "", id)
      name     = $2
      desc     = $3
      criteria = $4
      tests    = $5; sub(/ \|.*$/, "", tests)
      print cat "\t" id "\t" name "\t" desc "\t" criteria "\t" tests
    }
  ' "$file")
}

# Helper: safely quote strings for SQLite (escape single quotes)
sqlite_quote() {
  local val="$1"
  val="${val//\'/\'\'}"
  echo "'${val}'"
}

# Auto-detect idea stage: all requirements start as "done" for idea
# (they're defined in the overview, so the idea exists)
mark_idea_done() {
  sqlite3 "$DB" "UPDATE pipeline SET status = 'done', updated_at = datetime('now')
    WHERE stage = 'idea';"
}

# Auto-detect implementation: if test files exist, implementation is likely done
mark_implementation_from_tests() {
  # Helper: resolve req_id from filename, handling suffixes like SA-08-sso → SA-08
  _resolve_req_id() {
    local req_id="$1"
    if ! sqlite3 "$DB" "SELECT 1 FROM requirements WHERE id = '${req_id}'" | grep -q 1; then
      local base_id="${req_id%%-[a-z]*}"
      if [[ "$base_id" != "$req_id" ]]; then
        req_id="$base_id"
      fi
    fi
    echo "$req_id"
  }

  # Check local bash tests
  for test_file in "${PROJECT_DIR}"/tests/local/*.sh; do
    [[ -f "$test_file" ]] || continue
    local req_id
    req_id=$(_resolve_req_id "$(basename "$test_file" .sh)")
    sqlite3 "$DB" "UPDATE pipeline SET status = 'done', updated_at = datetime('now')
      WHERE req_id = '${req_id}' AND stage = 'implementation'
      AND EXISTS (SELECT 1 FROM requirements WHERE id = '${req_id}');"
  done

  # Check e2e Playwright specs (e.g. fa-03-video.spec.ts → FA-03)
  for spec_file in "${PROJECT_DIR}"/tests/e2e/specs/*.spec.ts; do
    [[ -f "$spec_file" ]] || continue
    local basename_lower
    basename_lower=$(basename "$spec_file" .spec.ts)
    # Extract requirement ID: fa-03-video → FA-03
    local req_id
    req_id=$(echo "$basename_lower" | grep -oE '^[a-z]+-[0-9]+' | tr '[:lower:]' '[:upper:]')
    [[ -n "$req_id" ]] || continue
    sqlite3 "$DB" "UPDATE pipeline SET status = 'done', updated_at = datetime('now')
      WHERE req_id = '${req_id}' AND stage = 'implementation'
      AND EXISTS (SELECT 1 FROM requirements WHERE id = '${req_id}');"
  done
}

# Import requirements from canonical Markdown overview
echo "  ← $(basename "$OVERVIEW")"
import_requirements_from_md "$OVERVIEW"

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
