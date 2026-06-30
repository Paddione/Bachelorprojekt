# scripts/vda/ticket/stage-plan.sh — ticket stage-plan subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" branch="" plan=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)     id="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --plan)   plan="$2"; shift 2 ;;
      *)        echo "Unknown stage-plan option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id"     ]]; then echo "ERROR: --id is required."     >&2; exit 2; fi
  if [[ -z "$branch" ]]; then echo "ERROR: --branch is required." >&2; exit 2; fi
  if [[ -z "$plan"   ]]; then echo "ERROR: --plan is required."   >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET status='plan_staged' WHERE external_id = :'ext_id';
EOF
  _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'dev-flow-plan', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND NOT EXISTS (
     SELECT 1 FROM tickets.ticket_comments c
      WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
   );
EOF
  echo "Ticket $id staged in Kommissionierung (status=plan_staged)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
