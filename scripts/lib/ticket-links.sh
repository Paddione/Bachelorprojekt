#!/usr/bin/env bash
# scripts/lib/ticket-links.sh
# Pure helper sourced by ticket.sh — declares cmd_add_pr_link only.
# No top-level side effects, no back-imports.
# Schema: tickets.ticket_links (from_id text, kind text, pr_number int, ...)
# getShipped() in factory-floor.ts reads: WHERE kind = 'pr' AND pr_number IS NOT NULL
#   and joins l.from_id = t.id

cmd_add_pr_link() {
  local id="" pr=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      --pr) pr="$2"; shift 2 ;;
      *)    echo "Unknown add-pr-link option: $1" >&2; exit 2 ;;
    esac; done

  if [[ -z "$id" || -z "$pr" ]]; then
    echo "ERROR: --id and --pr are required." >&2
    exit 2
  fi
  if ! [[ "$pr" =~ ^[0-9]+$ ]]; then
    echo "ERROR: --pr must be an integer (got '$pr')." >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  # Resolve the ticket UUID so we can set from_id (getShipped joins l.from_id = t.id).
  local uuid
  uuid=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT id FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
  if [[ -z "$uuid" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  # Idempotent: skip if a pr-link for this ticket+pr already exists.
  _exec_sql "$pod" \
    -v uuid="$uuid" \
    -v pr="$pr" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_links (from_id, kind, pr_number)
SELECT :'uuid', 'pr', :'pr'::integer
WHERE NOT EXISTS (
  SELECT 1 FROM tickets.ticket_links
   WHERE from_id = :'uuid' AND kind = 'pr' AND pr_number = :'pr'::integer
);
EOF

  echo "PR link #$pr recorded for ticket $id"
}
