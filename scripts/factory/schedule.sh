#!/usr/bin/env bash
# scripts/factory/schedule.sh — poll the queue for a brand, run the best-effort
# brand-aware conflict gate on KNOWN touched_files, claim a slot per
# non-conflicting feature up to the per-brand pool AND a global concurrency cap
# (summed across both brands), and emit the launch plan as JSON:
#   [{ "brand": "...", "external_id": "...", "slot": N }]
#
#   BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
#
# The AUTHORITATIVE conflict gate is pipeline.js' Plan phase (③). This is a
# pre-filter on already-known touched_files; a fresh feature (NULL touched_files,
# conflict-check exits 2 = "no known conflict") schedules and self-corrects if
# the pipeline's own gate later blocks it.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
BRAND="${BRAND:-}"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}"

# Global concurrency = occupied slots across BOTH brands (separate DBs).
global_used=0
for b in mentolder korczewski; do
  n=$(BRAND="$b" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" count 2>/dev/null || echo 0)
  global_used=$((global_used + ${n:-0}))
done

plan='[]'
mapfile -t candidates < <(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/queue.sh" | jq -c '.[]')
for c in "${candidates[@]}"; do
  [[ -z "$c" ]] && continue
  [[ "$global_used" -ge "$GLOBAL_CAP" ]] && break
  ext_id=$(echo "$c" | jq -r '.external_id')

  # Dependency blocker gate (TDR-2): skip tickets whose depends_on predecessors
  # are not all done. Queries the DB directly via factory_psql.
  set +e
  blocker_json=$(cat <<SQL | BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" factory_psql 2>/dev/null
SELECT COALESCE(json_build_object(
  'blocked', true,
  'blockers', json_agg(d.external_id)
), '{"blocked":false,"blockers":[]}'::json)
FROM (
  SELECT unnest(depends_on) AS dep_id
  FROM tickets.tickets WHERE external_id = '${ext_id}'
) d
LEFT JOIN tickets.tickets t ON t.external_id = d.dep_id
WHERE t.status IS DISTINCT FROM 'done'
SQL
)
  set -e
  if [[ -n "$blocker_json" ]] && echo "$blocker_json" | jq -e '.blocked == true' >/dev/null 2>&1; then
    blockers=$(echo "$blocker_json" | jq -r '.blockers | join(", ")')
    continue
  fi

  # Best-effort conflict gate on known touched_files. rc 0 = no conflict,
  # rc 1 = conflict (skip), rc 2 = error/null touched_files (treat as schedulable).
  set +e
  BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/conflict-check.sh" "$ext_id" >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -eq 1 ]] && continue

  # Gang-Bedarf des Kandidaten (Design §3): slot_count wird von stage-plan
  # --partials gesetzt; Default 1 = Single-Slot wie bisher.
  needed=$(printf '%s' "SELECT COALESCE(slot_count,1) FROM tickets.tickets WHERE external_id = :'ext_id';" \
    | BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" factory_psql -v ext_id="$ext_id")
  needed="${needed:-1}"

  used=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" count)
  free=$(( ${FACTORY_SLOTS_PER_BRAND:-3} - ${used:-0} ))

  # head-of-line blocking: passt der vorderste Gang-Kandidat nicht, werden KEINE
  # nachrangigen Tickets vorgezogen (sonst Gang-Starvation) — break, kein continue.
  if [[ "$needed" -gt "$free" || $(( global_used + needed )) -gt "$GLOBAL_CAP" ]]; then
    break
  fi

  if BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" claim-gang "$ext_id" "$needed" >/dev/null 2>&1; then
    plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$needed" '. + [{brand:$b, external_id:$e, slot:$s}]')
    global_used=$((global_used + needed))
  fi
done
echo "$plan"
