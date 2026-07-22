#!/usr/bin/env bash
# scripts/factory/slots.sh — per-brand slot accounting for the Dispatcher.
#   BRAND=<brand> bash scripts/factory/slots.sh count                     # occupied slots (SUM(slot_count), this brand)
#   BRAND=<brand> bash scripts/factory/slots.sh next                      # lowest free slot 1..N, or empty if full
#   BRAND=<brand> bash scripts/factory/slots.sh claim <ext_id> <slot>     # single-slot (legacy); echoes slot on success
#   BRAND=<brand> bash scripts/factory/slots.sh claim-gang <ext_id> <n>   # atomic gang claim of n slots; echoes slot on success
#   BRAND=<brand> bash scripts/factory/slots.sh release <ext_id>
# Slots are 1..FACTORY_SLOTS_PER_BRAND (default 3). Accounting sums slot_count
# (gang tickets occupy n slots). claim/claim-gang only succeed if the feature has
# no slot yet (UPDATE ... WHERE pipeline_slot IS NULL) — race-free.
# Exit 0 ok, 1 claim-failed, 2 error.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

SLOTS_PER_BRAND="${FACTORY_SLOTS_PER_BRAND:-3}"
cmd="${1:-}"; shift || true

case "$cmd" in
  count)
    # Gang-aware: sum slot_count of running tickets (default 1 = single slot).
    printf "SELECT COALESCE(SUM(slot_count),0) FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress';" | factory_psql
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
  claim-gang)
    ext_id="${1:?usage: claim-gang <ext_id> <n> [min_n]}"; n="${2:?usage: claim-gang <ext_id> <n> [min_n]}"; min_n="${3:-$n}"
    # T002082: partial claim — claim min(n, free) >= min_n (default min_n=n = all-or-nothing).
    out=$(printf '%s' "UPDATE tickets.tickets SET pipeline_slot = sub.next_slot, slot_count = sub.actual_n, status='in_progress' FROM (SELECT COALESCE(min(s.n),0) AS next_slot, GREATEST(0, LEAST(:'n'::integer, ${SLOTS_PER_BRAND} - (SELECT COALESCE(SUM(slot_count),0) FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress'))) AS actual_n FROM generate_series(1,${SLOTS_PER_BRAND}) s(n) WHERE s.n NOT IN (SELECT pipeline_slot FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress')) sub WHERE external_id = :'ext_id' AND pipeline_slot IS NULL AND status IN ('backlog','triage','plan_staged') AND sub.actual_n >= :'min_n'::integer RETURNING pipeline_slot;" \
      | factory_psql -v ext_id="$ext_id" -v n="$n" -v min_n="$min_n")
    if [[ -z "$out" ]]; then echo "claim-gang failed (pool < min_n, already slotted, or wrong status): $ext_id n=$n min_n=$min_n" >&2; exit 1; fi
    echo "$out"
    ;;
  release)
    ext_id="${1:?usage: release <ext_id>}"
    # Reset slot_count=1 so the next occupant starts single-slot (covers the
    # dispatcher path ticket.sh release-slot → slots.sh release; no dispatcher diff).
    printf '%s' "UPDATE tickets.tickets SET pipeline_slot=NULL, slot_count=1 WHERE external_id = :'ext_id';" | factory_psql -v ext_id="$ext_id" >/dev/null
    echo "released $ext_id"
    ;;
  *) echo '{"error":"usage: slots.sh count|next|claim|claim-gang|release [...]"}' >&2; exit 2 ;;
esac
