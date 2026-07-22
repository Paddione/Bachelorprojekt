# scripts/vda/ticket/stage-plan.sh — ticket stage-plan subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" branch="" plan="" partials="1"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)       id="$2"; shift 2 ;;
      --branch)   branch="$2"; shift 2 ;;
      --plan)     plan="$2"; shift 2 ;;
      --partials) partials="$2"; shift 2 ;;
      *)          echo "Unknown stage-plan option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id"     ]]; then echo "ERROR: --id is required."     >&2; exit 2; fi
  if [[ -z "$branch" ]]; then echo "ERROR: --branch is required." >&2; exit 2; fi
  if [[ -z "$plan"   ]]; then echo "ERROR: --plan is required."   >&2; exit 2; fi
  case "$partials" in 1|2|3) ;; *) echo "ERROR: --partials must be 1..3" >&2; exit 2 ;; esac
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v partials="$partials" <<'EOF' >/dev/null
UPDATE tickets.tickets SET status='plan_staged', slot_count = :'partials'::integer
 WHERE external_id = :'ext_id';
EOF
  _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
DELETE FROM tickets.ticket_comments c
 USING tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND c.ticket_id = t.id
   AND c.body LIKE 'FACTORY-PLAN-REF %';
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'dev-flow-plan', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id';
EOF
  local driver="${TICKET_PHASE_DRIVER:-devflow}"
  case "$driver" in factory|devflow) ;; *) driver="devflow" ;; esac
  _exec_sql "$pod" -v ext_id="$id" -v driver="$driver" -v detail="auto: stage-plan" <<'EOF' >/dev/null
INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT t.id, p.phase, 'done', :'detail', :'driver'
FROM tickets.tickets t
CROSS JOIN (VALUES ('scout'),('design'),('plan')) AS p(phase)
WHERE t.external_id = :'ext_id'
  AND NOT EXISTS (
    SELECT 1 FROM tickets.factory_phase_events e
     WHERE e.ticket_id = t.id AND e.phase = p.phase AND e.state = 'done'
  );
EOF
  echo "Ticket $id staged in Kommissionierung (status=plan_staged)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
