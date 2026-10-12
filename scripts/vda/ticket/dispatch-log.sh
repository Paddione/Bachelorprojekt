# scripts/vda/ticket/dispatch-log.sh — Wave-1 dispatch telemetry (T901790).
# Sourced by ticket.sh. Writes a machine-readable marker comment (kind='system',
# author 'ticket-dispatch') so dispatch wait time and stale-skip rate become
# measurable. Body format: DISPATCH-<EVENT> <detail|->.
# Events: request (masterplan presented), approved (user approved + dispatched),
# stale-skip (removed from wave by the STALE-STATE rule).
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" event="" detail="-"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)     id="$2"; shift 2 ;;
      --event)  event="$2"; shift 2 ;;
      --detail) detail="$2"; shift 2 ;;
      *)        echo "Unknown dispatch-log option: $1" >&2; echo "  Aufruf ohne Argumente zeigt die erwarteten Flags: ticket.sh dispatch-log" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-48).
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  case "$event" in request|approved|stale-skip) ;; *) echo "ERROR: --event must be request|approved|stale-skip." >&2; exit 2 ;; esac
  if _ticket_offline_skip "dispatch-log" "--id" "$id"; then return 0; fi

  local pod; pod=$(_pgpod)
  local marker="DISPATCH-${event^^} ${detail:- -}"
  _exec_sql "$pod" -v ext_id="$id" -v marker="$marker" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, kind, body, visibility)
SELECT id, 'ticket-dispatch', 'system', :'marker', 'internal'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  echo "dispatch-log $event recorded for ticket $id"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
