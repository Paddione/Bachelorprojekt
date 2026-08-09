#!/usr/bin/env bash
# scripts/factory/conflict-check.sh — detects file-overlap conflicts
# between active features for the Software Factory Dispatcher.
#
# Usage:
#   BRAND=mentolder bash scripts/factory/conflict-check.sh <new_ticket_external_id> [touched_file...]
#   BRAND=korczewski bash scripts/factory/conflict-check.sh <new_ticket_external_id> [touched_file...]
#
# Environment variables:
#   BRAND           mentolder | korczewski — row filter only, NOT a namespace [T002689]
#   FACTORY_NS      namespace of the SDLC database (default: workspace)
#   FACTORY_CTX     kubectl context (default: k3d-mentolder-dev)
#   FACTORY_DRY_RESOLVE  if non-empty, prints resolved ctx+ns and exits 0 (used by tests)
#
# Output: JSON array of conflicting ticket external_ids, or empty array [].
# Exit 0 = no conflicts, Exit 1 = conflicts found, Exit 2 = error.

set -euo pipefail

# Warn only when the caller gave NEITHER a BRAND nor an explicit FACTORY_NS. The guard
# must read FACTORY_NS (what pipeline.js / schedule.sh actually export) — the old
# FACTORY_NS_EXPLICIT was never set by anyone, so the WARN always fired and leaked onto
# stderr (polluting callers that merge stdout+stderr, e.g. bats `run`).
if [[ -z "${BRAND:-}" && -z "${FACTORY_NS:-}" ]]; then
  echo "WARN: no BRAND set; defaulting FACTORY_NS=workspace (mentolder/prod). Set BRAND=mentolder|korczewski to be explicit." >&2
fi

# [T002689] Die eigene Kopie der Aufloesung ist entfallen. Sie hielt neben der
# Brand-Abbildung eine ZWEITE, veraltete Kontext-Suffix-Regel, der die
# k3d-Ausnahme aus T002626 fehlte: `k3d-*` bekam unbedingt `-dev` angehaengt.
# Damit loeste dieses Skript auch fuer den DEFAULT-Brand auf `workspace-dev`
# auf — ein Namespace, den es nicht gibt. Das Conflict-Gate lief seit T002626
# fuer beide Brands ins Leere. Durch das Sourcen von lib.sh erbt es jetzt die
# eine gepflegte Aufloesung samt k3d-Ausnahme.
# shellcheck source=scripts/factory/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
factory_resolve_data_ns

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
  # [T002386] Phase Running serverseitig filtern — sonst kann ein liegengebliebener
  # Failed/Succeeded-Pod vor dem lebenden sortieren und `kubectl exec` scheitert.
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1)
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
  -- [T002418] 'bug'/'fix' ergaenzt: die drei realen Kollidenten vom 2026-07-28
  -- (T002341/T002373/T002374, alle an scripts/agent-lock.sh) waren Mishap-Tickets und
  -- fielen durch den alten Typfilter komplett heraus.
  AND t.type IN ('feature','feat','task','chore','bug','fix')
  -- [T002418] Der Statusfilter bleibt bewusst auf ('in_progress','in_review) — geprueft
  -- und verworfen: 'plan_staged' aufzunehmen sah nach der offensichtlichen Luecke aus
  -- ("im Moment des Dispatch ist noch kein Ticket in_progress"), ist aber falsch.
  -- schedule.sh ruft conflict-check (Z. 82) VOR slots.sh claim-gang (Z. 106) auf, und der
  -- Claim setzt status='in_progress'; der naechste Schleifendurchlauf sieht das vorherige
  -- Ticket also sehr wohl. 'plan_staged' wuerde dagegen falsch-positiv blockieren, weil
  -- ein Ticket dort tagelang liegen kann. Festgehalten in FA-SF-45.
  -- Die Kollision vom 2026-07-28 kam nicht hierher, sondern von touched_files = null:
  -- der IS-NOT-NULL-Filter unten verwirft dann alles, egal welcher Status.
  AND t.status IN ('in_progress','in_review')
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
