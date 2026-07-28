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

  _ticket_lock_guard "$id" || exit 7

  local pod
  pod=$(_pgpod)

  # [T002382] Status transition guard: forbid terminal → non-terminal transitions.
  # Merge = Abschluss (T001092): a done ticket can only go to archived. Any other
  # transition would lose the resolution and violate the contract. This guard runs
  # as a separate SELECT before the UPDATE so we fail early with a clear message.
  # Note: this guard is best-effort — the SELECT and UPDATE are separate autocommit
  # calls with no enclosing transaction, so a concurrent writer could race between
  # them (pre-existing architectural limitation; the TS side avoids it via FOR UPDATE).
  # Note: scripts/factory/reconcile-ticket-status.sh bypasses this guard by writing
  # SQL directly via kubectl exec — that's intentional for its watchdog patterns.
  local _sql="SELECT status FROM tickets.tickets WHERE external_id = '${id}' LIMIT 1;"
  local _cur_status
  _cur_status=$(echo "$_sql" | _exec_sql "$pod" 2>/dev/null | tr -d '[:space:]')
  case "${_cur_status}:${status}" in
    done:done|archived:archived)
      ;; # idempotent — always allowed
    done:archived)
      ;; # done → archived — the only permitted non-idempotent terminal transition
    done:*)
      echo "ERROR: Cannot transition from 'done' to '$status' — terminal tickets can only transition to 'archived'." >&2
      exit 2 ;;
    archived:*)
      echo "ERROR: Cannot transition from 'archived' to '$status' — archived is a terminal state." >&2
      exit 2 ;;
  esac

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
  -- [T002230] resolution used to be `NULLIF(:'res','')` unconditionally, so every
  -- caller that omitted --resolution wiped an existing one — including the
  -- post-merge automation, which never passes it. Tickets ended up on
  -- `done/null`: correct-looking in lists, but dropped from every report that
  -- groups by resolution, notably `vda.sh cfr` and /admin/dora.
  --
  -- This mirrors website/src/lib/tickets/transition.ts:79, the other write path,
  -- which had it right all along: a resolution only means anything for a terminal
  -- status. So keep the existing value when none is supplied, let an explicit one
  -- override, and still clear it on a non-terminal transition — `openspec.sh`
  -- (→ planning) and `factory/pipeline.mjs` (→ backlog) rely on that clearing, so
  -- a blanket COALESCE would strand a stale `fixed` on a reopened ticket.
  resolution = CASE
    WHEN :'status' IN ('done','archived') THEN COALESCE(NULLIF(:'res', ''), resolution)
    ELSE NULL
  END,
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
