#!/usr/bin/env bash
# scripts/factory/route-provider.sh <source> <tier>
# Emits JSON: {"provider":..,"modelId":..,"baseUrl":..|null,"slotId":..|null,"emergency":bool}
# opus → hardcoded Anthropic, no DB. Used by dev-flow AND inlined into pipeline.js.
# slotId == provider name (slots are per-provider counters, not per-claim UUIDs).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve
SOURCE="${1:?source required}"; TIER="${2:?tier required}"

OPUS_MODEL="claude-opus-4-6"
if [[ "$TIER" == "opus" ]]; then
  printf '{"provider":"anthropic","modelId":"%s","baseUrl":null,"slotId":null,"emergency":false}\n' "$OPUS_MODEL"
  exit 0
fi

# Ordered candidates: source-specific before '*', then priority asc.
CANDS=$(factory_psql -v src="$SOURCE" -v tier="$TIER" <<'SQL'
SELECT provider||'\t'||model_id||'\t'||COALESCE(base_url,'')||'\t'||max_concurrent
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier=:'tier' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC;
SQL
)

while IFS=$'\t' read -r prov model burl maxc; do
  [[ -z "$prov" ]] && continue
  # Atomic claim: only succeeds if circuit closed AND below cap. RETURNING row = claimed.
  CLAIM=$(factory_psql -v prov="$prov" -v maxc="$maxc" <<'SQL'
INSERT INTO tickets.provider_health (provider) VALUES (:'prov') ON CONFLICT (provider) DO NOTHING;
UPDATE tickets.provider_health
SET active_agents = active_agents + 1, updated_at = now()
WHERE provider = :'prov'
  AND active_agents < :'maxc'::int
  AND (cooldown_until IS NULL OR cooldown_until <= now())
RETURNING provider;
SQL
)
  if [[ -n "$CLAIM" ]]; then
    BJSON=$([[ -n "$burl" ]] && printf '"%s"' "$burl" || printf 'null')
    printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":"%s","emergency":false}\n' "$prov" "$model" "$BJSON" "$prov"
    exit 0
  fi
done <<< "$CANDS"

# Emergency fallback: Anthropic sonnet, no slot claimed.
printf '{"provider":"anthropic","modelId":"claude-sonnet-4-6","baseUrl":null,"slotId":null,"emergency":true}\n'
