#!/usr/bin/env bash
# scripts/lib/ticket-links.sh
# Pure helper sourced by ticket.sh — declares cmd_add_pr_link only.
# No top-level side effects, no back-imports.
# Schema: tickets.ticket_links (from_id uuid NOT NULL, to_id uuid NOT NULL,
#   kind text, pr_number int, UNIQUE(from_id, to_id, kind)). A PR has no target
#   ticket, so we self-link (to_id = from_id) to satisfy the NOT NULL FK.
# Readers (delivery-metrics, getShipped) filter WHERE kind = 'pr'
#   AND pr_number IS NOT NULL and join l.from_id = t.id (to_id is ignored).

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
  # TICKET_OFFLINE=1 — skip the cluster call (T001242 M3).
  if _ticket_offline_skip "add-pr-link" "--id" "$id" "--pr" "$pr"; then return 0; fi

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

  # Idempotent: to_id is NOT NULL (FK to tickets), and a PR has no target
  # ticket, so we self-link (to_id = from_id) — same pattern as transition.ts.
  # ON CONFLICT (from_id, to_id, kind) keeps one 'pr' link per ticket, updated
  # to the latest PR number.
  _exec_sql "$pod" \
    -v uuid="$uuid" \
    -v pr="$pr" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
VALUES (:'uuid', :'uuid', 'pr', :'pr'::integer)
ON CONFLICT (from_id, to_id, kind) DO UPDATE SET pr_number = EXCLUDED.pr_number;
EOF

  echo "PR link #$pr recorded for ticket $id"
}
