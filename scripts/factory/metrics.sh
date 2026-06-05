#!/usr/bin/env bash
# scripts/factory/metrics.sh — summarize factory throughput for a brand and post
# it as a comment on the Vorhaben ticket (default T000413).
#   BRAND=<brand> FACTORY_METRICS_TICKET=T000413 bash scripts/factory/metrics.sh
# Reads the latest v_factory_metrics row + a live slot/queue snapshot, formats a
# short markdown summary, and appends it via ticket.sh add-comment (best-effort:
# a missing ticket in a brand's DB is a silent no-op).
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
TICKET="${FACTORY_METRICS_TICKET:-T000413}"

today=$(cat <<'SQL' | factory_psql
SELECT COALESCE(
  (SELECT format('shipped=%s avg_cycle_h=%s escalations=%s total_features=%s',
     features_shipped, COALESCE(avg_cycle_time_h::text,'n/a'), escalations, total_features)
   FROM tickets.v_factory_metrics ORDER BY day DESC LIMIT 1),
  'no metrics yet');
SQL
)
active=$(printf "SELECT count(*) FROM tickets.tickets WHERE type='feature' AND status='in_progress';" | factory_psql)
backlog=$(printf "SELECT count(*) FROM tickets.tickets WHERE type='feature' AND status='backlog';" | factory_psql)

body=$(printf '**Factory metrics — %s**\n- %s\n- active(in_progress)=%s backlog=%s' "$BRAND" "$today" "$active" "$backlog")
BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$TICKET" --body "$body"
echo "$body"
