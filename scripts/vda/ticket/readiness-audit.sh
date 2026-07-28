# scripts/vda/ticket/readiness-audit.sh — read-only audit for readiness truncation
# Sourced by dispatchers.
#
# Reports tickets where the readiness JSONB object may have been silently
# truncated by the plan-meta set --readiness replace-bug (fixed in T002388).
# Two heuristics:
#   1) Suspiciously narrow — exactly one readiness key despite status > triage
#   2) Lock suspicion   — requirements_list set but lastenheft_locked key absent
#
# The module is SELECT-only. Lost keys are not reconstructable; only the
# candidate list is, and decisions belong to a human.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local brand="" show_help=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --brand) brand="$2"; shift 2 ;;
    --help|-h) show_help=1; shift ;;
    *) echo "Unknown readiness-audit option: $1" >&2; exit 2 ;;
  esac; done

  if [[ "$show_help" == "1" ]]; then
    echo "Usage: vda.sh ticket readiness-audit [--brand mentolder|korczewski]"
    echo ""
    echo "Reports tickets whose readiness JSONB may have been truncated by the"
    echo "plan-meta set --readiness replace-bug (T002388). Read-only — no writes."
    exit 0
  fi

  # Brand resolution: --brand > BRAND env > default mentolder
  if [[ -z "$brand" ]]; then
    brand="${BRAND:-mentolder}"
  fi
  case "$brand" in
    mentolder)  NS="workspace";              CTX="${TICKET_CTX:-fleet}" ;;
    korczewski) NS="workspace-korczewski";   CTX="${TICKET_CTX:-fleet}" ;;
    *) echo "ERROR: unknown brand '$brand' (use mentolder|korczewski)" >&2; exit 2 ;;
  esac

  local pod; pod=$(_pgpod)

  echo "============================================"
  echo "Readiness Audit Report — brand: $brand"
  echo "============================================"
  echo ""

  # Heuristic 1: Suspiciously narrow readiness
  echo "--- Heuristic 1: Suspiciously narrow readiness (exactly 1 key, status > triage) ---"
  local narrow
  narrow=$(_exec_sql "$pod" <<'EOF'
SELECT jsonb_build_object(
  'external_id', external_id,
  'status', status,
  'type', type,
  'readiness', readiness
  )::text
FROM tickets.tickets
WHERE jsonb_typeof(readiness) = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(readiness)) = 1
  AND status NOT IN ('triage', 'archived')
ORDER BY updated_at DESC;
EOF
)
  if [[ -z "$narrow" ]]; then
    echo "  (none found)"
  else
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      echo "  MATCH: $line"
    done <<< "$narrow"
  fi
  echo ""

  # Heuristic 2: Lock suspicion — lastenheft_locked missing
  echo "--- Heuristic 2: Lock suspicion (requirements_list set, lastenheft_locked absent) ---"
  local lock
  lock=$(_exec_sql "$pod" <<'EOF'
SELECT jsonb_build_object(
  'external_id', external_id,
  'status', status,
  'type', type,
  'readiness', readiness
  )::text
FROM tickets.tickets
WHERE requirements_list IS NOT NULL
  AND array_length(requirements_list, 1) > 0
  AND NOT readiness ? 'lastenheft_locked'
ORDER BY updated_at DESC;
EOF
)
  if [[ -z "$lock" ]]; then
    echo "  (none found)"
  else
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      echo "  MATCH: $line"
    done <<< "$lock"
  fi
  echo ""
  echo "--- End of report ---"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
