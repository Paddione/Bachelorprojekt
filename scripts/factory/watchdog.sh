#!/usr/bin/env bash
# scripts/factory/watchdog.sh — escalate stale in-flight features for a brand.
#   BRAND=<brand> FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
# A feature in_progress whose updated_at is older than the threshold is treated
# as a hung/crashed pipeline: status → triage (back to queue), slot released, and
# a comment recorded. updated_at is auto-bumped by fn_lifecycle_ts on every row
# write; pipeline.js writes a `ticket.sh touch` at each phase boundary, so a
# healthy long phase is not mistaken for stale. JSON array of escalated ext_ids.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
STALE_MIN="${FACTORY_STALE_MIN:-30}"

mapfile -t stale < <(printf "SELECT external_id FROM tickets.tickets WHERE type='feature' AND status='in_progress' AND updated_at < now() - make_interval(mins => %s);" "$STALE_MIN" | factory_psql)

escalated='[]'
for ext_id in "${stale[@]}"; do
  [[ -z "$ext_id" ]] && continue
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status triage >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write). Returned to queue (triage); slot released." >/dev/null
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done
echo "$escalated"
