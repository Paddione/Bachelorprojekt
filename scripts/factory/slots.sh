#!/usr/bin/env bash
# scripts/factory/slots.sh — per-brand slot accounting for the Dispatcher.
#   BRAND=<brand> bash scripts/factory/slots.sh count                # occupied slots (this brand)
#   BRAND=<brand> bash scripts/factory/slots.sh next                 # lowest free slot 1..N, or empty if full
#   BRAND=<brand> bash scripts/factory/slots.sh claim <ext_id> <n>   # atomic; echoes n on success
#   BRAND=<brand> bash scripts/factory/slots.sh release <ext_id>
# Slots are 1..FACTORY_SLOTS_PER_BRAND (default 3). claim only succeeds if the
# feature has no slot yet (UPDATE ... WHERE pipeline_slot IS NULL) — race-free.
# Exit 0 ok, 1 claim-failed, 2 error.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

SLOTS_PER_BRAND="${FACTORY_SLOTS_PER_BRAND:-3}"
cmd="${1:-}"; shift || true

case "$cmd" in
  count)
    printf "SELECT count(*) FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress';" | factory_psql
    ;;
  next)
    printf "WITH used AS (SELECT pipeline_slot FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress'), s AS (SELECT generate_series(1,%s) AS n) SELECT min(n) FROM s WHERE n NOT IN (SELECT pipeline_slot FROM used);" "$SLOTS_PER_BRAND" | factory_psql
    ;;
  claim)
    ext_id="${1:?usage: claim <ext_id> <slot>}"; slot="${2:?usage: claim <ext_id> <slot>}"
    out=$(printf '%s' "UPDATE tickets.tickets SET pipeline_slot = :'slot'::integer, status='in_progress' WHERE external_id = :'ext_id' AND pipeline_slot IS NULL AND status IN ('backlog','triage','plan_staged') RETURNING pipeline_slot;" | factory_psql -v ext_id="$ext_id" -v slot="$slot")
    if [[ -z "$out" ]]; then echo "claim failed (already slotted or wrong status): $ext_id" >&2; exit 1; fi
    echo "$out"
    ;;
  release)
    ext_id="${1:?usage: release <ext_id>}"
    printf '%s' "UPDATE tickets.tickets SET pipeline_slot=NULL WHERE external_id = :'ext_id';" | factory_psql -v ext_id="$ext_id" >/dev/null
    echo "released $ext_id"
    ;;
  *) echo '{"error":"usage: slots.sh count|next|claim|release [...]"}' >&2; exit 2 ;;
esac
