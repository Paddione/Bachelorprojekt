# scripts/vda/ticket/update-status.sh — ticket update-status subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" status="" resolution="" notes=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)         id="$2"; shift 2 ;;
      --status)     status="$2"; shift 2 ;;
      --resolution) resolution="$2"; shift 2 ;;
      --notes)      notes="$2"; shift 2 ;;
      *)            echo "Unknown update-status option: $1" >&2; exit 2 ;;
    esac; done

  if [[ -z "$id" || -z "$status" ]]; then
    echo "ERROR: --id and --status are required." >&2
    exit 2
  fi

  # Status → auto-emitted phase event (T001444). Leere auto_phase = keine Emission.
  local auto_phase="" auto_state=""
  case "$status" in
    in_progress) auto_phase="implement"; auto_state="entered" ;;
    in_review)   auto_phase="implement"; auto_state="done" ;;
    qa_review)   auto_phase="verify";    auto_state="entered" ;;
    done)        auto_phase="deploy";    auto_state="done" ;;
    blocked)     auto_phase="__last__";  auto_state="blocked" ;;
  esac
  local driver="${TICKET_PHASE_DRIVER:-devflow}"
  case "$driver" in factory|devflow) ;; *) driver="devflow" ;; esac

  local pod
  pod=$(_pgpod)

  # UPDATE (autocommit) läuft VOR dem Event-INSERT — Telemetrie kann den
  # Statuswechsel nicht zurückrollen. blocked löst die letzte Phase per Lookup auf
  # (Fallback implement). Dedup: kein Insert bei vorhandenem (ticket,phase,state).
  _exec_sql "$pod" \
    -v ext_id="$id" \
    -v status="$status" \
    -v res="$resolution" \
    -v notes="$notes" \
    -v auto_phase="$auto_phase" \
    -v auto_state="$auto_state" \
    -v driver="$driver" \
    -v detail="auto: update-status $status" <<'EOF' >/dev/null
UPDATE tickets.tickets SET
  status = :'status',
  resolution = NULLIF(:'res', ''),
  done_at = CASE WHEN :'status' = 'done' THEN now() ELSE done_at END,
  -- Release the pipeline slot on a terminal transition so the ledger never leaks (T000525).
  pipeline_slot = CASE WHEN :'status' IN ('done','archived') THEN NULL ELSE pipeline_slot END,
  notes = CASE WHEN :'notes' <> '' THEN COALESCE(notes || E'\n\n', '') || :'notes' ELSE notes END
WHERE external_id = :'ext_id';

INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT t.id, r.phase, :'auto_state', :'detail', :'driver'
FROM tickets.tickets t
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN :'auto_phase' = '__last__'
      THEN COALESCE(
        (SELECT e.phase FROM tickets.factory_phase_events e
          WHERE e.ticket_id = t.id ORDER BY e.at DESC LIMIT 1),
        'implement')
    ELSE :'auto_phase'
  END AS phase
) r
WHERE t.external_id = :'ext_id'
  AND :'auto_phase' <> ''
  AND NOT EXISTS (
    SELECT 1 FROM tickets.factory_phase_events e2
     WHERE e2.ticket_id = t.id AND e2.phase = r.phase AND e2.state = :'auto_state'
  );
EOF

  echo "Ticket $id status updated to $status"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
