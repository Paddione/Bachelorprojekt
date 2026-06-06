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

# Warn only when the caller gave NEITHER a BRAND nor an explicit FACTORY_NS. The guard
# must read FACTORY_NS (what pipeline.js / schedule.sh actually export) — the old
# FACTORY_NS_EXPLICIT was never set by anyone, so the WARN always fired and leaked onto
# stderr (polluting callers that merge stdout+stderr, e.g. bats `run`).
if [[ -z "${BRAND:-}" && -z "${FACTORY_NS:-}" ]]; then
  echo "WARN: no BRAND set; defaulting FACTORY_NS=workspace (mentolder/prod). Set BRAND=mentolder|korczewski to be explicit." >&2
fi
FACTORY_NS="${FACTORY_NS:-workspace}"
FACTORY_CTX="${FACTORY_CTX:-fleet}"

# If context is a dev cluster, append -dev to namespace
if [[ "$FACTORY_CTX" == k3d-* || "$FACTORY_CTX" == *-dev ]]; then
  if [[ "$FACTORY_NS" == "workspace" ]]; then
    FACTORY_NS="workspace-dev"
  elif [[ "$FACTORY_NS" == "workspace-korczewski" ]]; then
    FACTORY_NS="workspace-korczewski-dev"
  fi
fi

# Dry-resolve: print the resolved namespace and exit (used by tests).
if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"
  exit 0
fi

CTX="${FACTORY_CTX}"
NS="${FACTORY_NS}"
DB="website"
USER="website"

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
  AND t.type IN ('feature','task')
  AND t.status IN ('backlog','in_progress','in_review')
  AND t.touched_files IS NOT NULL
  AND (
    -- base: exact element containment (unchanged)
    t.touched_files @> ARRAY[nf.f]
    -- augment: directory-prefix match, ONLY for the closed shared-state
    -- allowlist (k3d/, prod, environments/, Taskfile) and NOT for
    -- website/src/pages/ (page-only features must stay parallel).
    OR (
      nf.f NOT LIKE 'website/src/pages/%'
      AND EXISTS (
        SELECT 1
        FROM (VALUES ('k3d/%'), ('prod%'), ('environments/%'), ('Taskfile%')) AS p(prefix)
        WHERE nf.f LIKE p.prefix
          AND EXISTS (
            SELECT 1 FROM unnest(t.touched_files) AS tf
            WHERE tf LIKE p.prefix
          )
      )
    )
  );
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
