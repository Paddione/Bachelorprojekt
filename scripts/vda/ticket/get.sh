# scripts/vda/ticket/get.sh — ticket get subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      -*)   echo "Unknown get option: $1 (valid: --id <ID>)" >&2; exit 2 ;;
      *)    if [[ -z "$id" ]]; then id="$1"; shift; else echo "Unexpected argument: $1 (valid: --id <ID>)" >&2; exit 2; fi ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  # TICKET_OFFLINE=1 — refuse the read loudly so the operator knows the
  # result is unavailable. dev-flow-execute relies on cluster reachability
  # for state validation. See T001242 M3.
  if _ticket_offline_refuse_read "get" "--id" "$id"; then exit 9; fi
  local pod; pod=$(_pgpod)
  # [T014386] Das Ergebnis wird eingesammelt statt direkt ausgegeben, damit ein
  # leeres Resultat von einem Treffer unterschieden werden kann. Vorher lief die
  # Ausgabe durch und ein nicht existierendes Ticket ergab '' mit Exit 0 — von
  # "kein Treffer" nicht unterscheidbar, und drei Aufrufer haben sich deshalb
  # eine eigene Leer-Pruefung gebaut (ticket-reclaim.sh, scout-drift.sh,
  # devflow-post-merge-finalize.sh).
  local _row
  _row=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT json_build_object(
  'external_id', t.external_id, 'id', t.id, 'type', t.type, 'brand', t.brand,
  'title', t.title, 'status', t.status, 'priority', t.priority,
  'touched_files', t.touched_files, 'pipeline_slot', t.pipeline_slot,
  'created_at', t.created_at, 'updated_at', t.updated_at,
  'resolution', t.resolution, 'severity', t.severity, 'description', t.description,
  'plan_ref', (
    SELECT c.body FROM tickets.ticket_comments c
    WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
    ORDER BY c.created_at DESC LIMIT 1
  )
) FROM tickets.tickets t WHERE t.external_id = :'ext_id';
EOF
  )
  # Exit 4 trennt "gibt es nicht" von Bedienfehler (2) und Offline-Refusal (9).
  if [[ -z "${_row//[[:space:]]/}" ]]; then
    echo "ERROR: Ticket '${id}' nicht gefunden." >&2
    return 4
  fi
  printf '%s\n' "$_row"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
