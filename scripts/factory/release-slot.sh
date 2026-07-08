#!/usr/bin/env bash
# scripts/factory/release-slot.sh <slotId(provider)> [success=true|false] [ctx=0]
# Decrements active_agents for the provider; success=false records a failure (→ circuit).
# ctx (token-budget semaphore, T001590): the context_window reserved by the matching claim;
# decrements provider_health.reserved_tokens by the same amount (floored at 0). Omitted/0
# is safe but leaves reserved_tokens unreleased for that claim — always pass the route's ctx.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve
PROV="${1:?slotId/provider required}"; SUCCESS="${2:-true}"; CTX="${3:-0}"
# null slot (opus / emergency) → nothing to release.
[[ "$PROV" == "null" || -z "$PROV" ]] && exit 0

factory_psql -v prov="$PROV" -v ctx="$CTX" <<'SQL'
UPDATE tickets.provider_health
SET active_agents = GREATEST(0, active_agents - 1),
    reserved_tokens = GREATEST(0, reserved_tokens - :'ctx'::int),
    updated_at = now()
WHERE provider = :'prov';
SQL

if [[ "$SUCCESS" != "true" ]]; then
  factory_psql -v prov="$PROV" -v thr="3" -v cd="10" <<'SQL'
UPDATE tickets.provider_health
SET failure_count = failure_count + 1,
    last_failure  = now(),
    cooldown_until = CASE WHEN failure_count + 1 >= :'thr'::int
                          THEN now() + (:'cd' || ' minutes')::interval ELSE cooldown_until END,
    updated_at = now()
WHERE provider = :'prov';
SQL
fi
echo "released $PROV (success=$SUCCESS)"
