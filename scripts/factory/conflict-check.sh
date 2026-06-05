#!/usr/bin/env bash
# scripts/factory/conflict-check.sh — detects file-overlap conflicts
# between active features for the Software Factory Dispatcher.
#
# Usage:
#   BRAND=mentolder bash scripts/factory/conflict-check.sh <new_ticket_external_id> [touched_file...]
#   BRAND=korczewski bash scripts/factory/conflict-check.sh <new_ticket_external_id> [touched_file...]
#
# Environment variables:
#   BRAND           mentolder | korczewski — sets FACTORY_NS automatically
#   FACTORY_NS      override namespace (ignored when BRAND is set)
#   FACTORY_CTX     kubectl context (default: fleet)
#   FACTORY_DRY_RESOLVE  if non-empty, prints resolved ctx+ns and exits 0 (used by tests)
#
# Output: JSON array of conflicting ticket external_ids, or empty array [].
# Exit 0 = no conflicts, Exit 1 = conflicts found, Exit 2 = error.

set -euo pipefail

# Brand → namespace map. BRAND wins over a bare FACTORY_NS default so a
# pipeline/human cannot silently hit prod-mentolder when targeting korczewski.
case "${BRAND:-}" in
  mentolder)   FACTORY_NS="workspace" ;;
  korczewski)  FACTORY_NS="workspace-korczewski" ;;
  "")          : ;;  # no BRAND given — fall through to explicit FACTORY_NS
  *)           echo '{"error":"unknown BRAND (use mentolder|korczewski)"}' >&2; exit 2 ;;
esac

if [[ -z "${BRAND:-}" && -z "${FACTORY_NS_EXPLICIT:-}" ]]; then
  echo "WARN: no BRAND set; defaulting FACTORY_NS=${FACTORY_NS:-workspace} (mentolder/prod). Set BRAND=mentolder|korczewski to be explicit." >&2
fi
FACTORY_NS="${FACTORY_NS:-workspace}"
FACTORY_CTX="${FACTORY_CTX:-fleet}"

# Dry-resolve: print the resolved namespace and exit (used by tests).
if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"
  exit 0
fi

CTX="${FACTORY_CTX}"
NS="${FACTORY_NS}"
DB="website"

_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo '{"error":"no shared-db pod found"}' >&2
    exit 2
  fi
  echo "$pod"
}

main() {
  local new_ticket_id="${1:-}"
  shift || true
  local new_files=("$@")

  if [[ -z "$new_ticket_id" ]]; then
    echo '{"error":"usage: conflict-check.sh <external_id> [files...]"}' >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  if [[ ${#new_files[@]} -eq 0 ]]; then
    # No files specified — read touched_files from the ticket itself
    local ticket_files
    ticket_files=$(kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
      psql -U "$USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 \
      -v ext_id="$new_ticket_id" <<'EOF'
SELECT ARRAY_TO_JSON(touched_files) FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
    if [[ -z "$ticket_files" || "$ticket_files" == "null" ]]; then
      echo '{"error":"ticket not found or touched_files is null"}' >&2
      exit 2
    fi
    # Parse the JSON array into bash — safe because file paths don't contain newlines
    mapfile -t new_files < <(echo "$ticket_files" | jq -r '.[]')
  fi

  if [[ ${#new_files[@]} -eq 0 ]]; then
    echo '[]'
    exit 0
  fi

  # Build a JSON array of the new files for SQL
  local files_json
  files_json=$(printf '%s\n' "${new_files[@]}" | jq -R . | jq -s .)

  # Find active features (excluding the new ticket) whose touched_files
  # overlap with the new feature's files.
  local conflicts
  conflicts=$(kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "$USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 \
    -v ext_id="$new_ticket_id" \
    -v files="$files_json" <<'EOF'
WITH new_files AS (
  SELECT jsonb_array_elements_text(:'files'::jsonb) AS f
)
SELECT json_agg(DISTINCT t.external_id)
FROM tickets.tickets t, new_files nf
WHERE t.external_id != :'ext_id'
  AND t.type = 'feature'
  AND t.status IN ('backlog','in_progress','in_review')
  AND t.touched_files IS NOT NULL
  AND t.touched_files @> ARRAY[nf.f];
EOF
)

  if [[ -z "$conflicts" || "$conflicts" == "null" ]]; then
    echo '[]'
    exit 0
  fi

  echo "$conflicts"
  exit 1
}

main "$@"
