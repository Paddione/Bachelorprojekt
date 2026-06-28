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

# cmd_link_tickets --from <ext_id> --to <ext_id> --kind blocks|relates
# Creates a directed dependency link between two tickets. Idempotent via ON CONFLICT DO NOTHING.
# Offline-safe: TICKET_OFFLINE=1 skips the cluster write.
cmd_link_tickets() {
  local from_ext="" to_ext="" kind=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --from)  from_ext="$2"; shift 2 ;;
    --to)    to_ext="$2"; shift 2 ;;
    --kind)  kind="$2"; shift 2 ;;
    *)       echo "Unknown link-tickets option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -z "$from_ext" || -z "$to_ext" || -z "$kind" ]]; then
    echo "ERROR: --from, --to, and --kind are required." >&2
    exit 2
  fi
  if [[ "$kind" != "blocks" && "$kind" != "relates" ]]; then
    echo "ERROR: --kind must be 'blocks' or 'relates' (got '$kind')." >&2
    exit 2
  fi
  if _ticket_offline_skip "link-tickets" "--from" "$from_ext" "--to" "$to_ext" "--kind" "$kind"; then return 0; fi

  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v from_ext="$from_ext" -v to_ext="$to_ext" -v kind="$kind" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_links (from_id, to_id, kind)
SELECT f.id, t.id, :'kind'
FROM tickets.tickets f, tickets.tickets t
WHERE f.external_id = :'from_ext' AND t.external_id = :'to_ext'
ON CONFLICT (from_id, to_id, kind) DO NOTHING;
EOF

  echo "Link $from_ext --[$kind]--> $to_ext recorded."
}

# cmd_get_ticket_links --id <ext_id>
# Returns JSON: {"blocks": [...], "blocked_by": [...], "relates": [...]}
# Refuses offline reads (exits 9 with TICKET_OFFLINE=1).
cmd_get_ticket_links() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --id)  id="$2"; shift 2 ;;
    *)     echo "Unknown get-ticket-links option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -z "$id" ]]; then
    echo "ERROR: --id is required." >&2
    exit 2
  fi
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: refused read get-ticket-links (cluster required)" >&2
    exit 9
  fi

  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT jsonb_build_object(
  'blocks', COALESCE((
    SELECT jsonb_agg(t2.external_id ORDER BY t2.external_id)
    FROM tickets.ticket_links tl
    JOIN tickets.tickets t2 ON t2.id = tl.to_id
    WHERE tl.from_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
      AND tl.kind = 'blocks'
  ), '[]'::jsonb),
  'blocked_by', COALESCE((
    SELECT jsonb_agg(t2.external_id ORDER BY t2.external_id)
    FROM tickets.ticket_links tl
    JOIN tickets.tickets t2 ON t2.id = tl.from_id
    WHERE tl.to_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
      AND tl.kind = 'blocks'
  ), '[]'::jsonb),
  'relates', COALESCE((
    SELECT jsonb_agg(DISTINCT other.external_id ORDER BY other.external_id)
    FROM tickets.ticket_links tl
    JOIN tickets.tickets self  ON self.external_id = :'ext_id'
    JOIN tickets.tickets other ON other.id = CASE
      WHEN tl.from_id = self.id THEN tl.to_id
      ELSE tl.from_id
    END
    WHERE tl.kind = 'relates'
      AND (tl.from_id = self.id OR tl.to_id = self.id)
  ), '[]'::jsonb)
) AS links;
EOF
}
