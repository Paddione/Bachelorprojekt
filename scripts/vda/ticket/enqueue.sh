# scripts/vda/ticket/enqueue.sh — ticket enqueue subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" branch="" plan=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)     id="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --plan)   plan="$2"; shift 2 ;;
      *)        echo "Unknown enqueue option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)

  # [T003575] Ein bereits gestagtes Ticket NICHT nach backlog demoten.
  #
  # queue.sh hat zwei Dispatch-Zweige mit unterschiedlichen Zusatzgates:
  #   Zweig A: type IN (feature,feat) AND status='backlog'     AND lastenheft_locked=true
  #   Zweig B: type NOT IN (project,incident) AND status='plan_staged' AND execution_released!=false
  # Ein gestagtes Ticket erfuellt Zweig B und ist damit bereits dispatchbar. Die
  # Demotion nach backlog wirft es in Zweig A, der zusaetzlich lastenheft_locked
  # verlangt — eine Flag, die aus dev-flow-plan stammende Tickets nicht tragen
  # (COALESCE-Default false). Das Ticket faellt dann aus BEIDEN Zweigen und ist
  # fuer den Dispatcher unsichtbar. Der Statuswechsel tauscht also die
  # Torwaechter mit aus; enqueue stammt aus der Zeit, als es nur Zweig A gab.
  local current_status
  current_status=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF' | head -1 | tr -d '[:space:]'
SELECT status FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  )
  local staged=false
  if [[ "$current_status" == "plan_staged" ]]; then
    staged=true
  else
    _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET status='backlog' WHERE external_id = :'ext_id';
EOF
  fi
  if [[ -n "$branch" || -n "$plan" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'factory', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND NOT EXISTS (
     SELECT 1 FROM tickets.ticket_comments c
      WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
   );
EOF
  fi
  if [[ "$staged" == true ]]; then
    echo "Ticket $id ist bereits plan_staged — Status unveraendert gelassen (queue.sh dispatcht gestagte Tickets direkt; eine Demotion nach backlog haette es unsichtbar gemacht)."
  else
    echo "Ticket $id enqueued for the Software Factory (status=backlog)"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
