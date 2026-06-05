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

  # Best-effort conflict gate on known touched_files. rc 0 = no conflict,
  # rc 1 = conflict (skip), rc 2 = error/null touched_files (treat as schedulable).
  set +e
  BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/conflict-check.sh" "$ext_id" >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -eq 1 ]] && continue

  slot=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" next)
  [[ -z "$slot" ]] && continue   # brand pool full

  if BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" claim "$ext_id" "$slot" >/dev/null 2>&1; then
    plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$slot" '. + [{brand:$b, external_id:$e, slot:$s}]')
    global_used=$((global_used + 1))
  fi
done
echo "$plan"
