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
PHASE="${3:-}"

if [[ -z "$PHASE" ]]; then
  case "$SOURCE" in
    factory-scout)     PHASE="scout" ;;
    factory-plan)      PHASE="plan" ;;
    factory-implement) PHASE="implement" ;;
    factory-review)    PHASE="verify" ;;
  esac
fi

OPUS_MODEL="ternary-bonsai-27b"
OPUS_BASE_URL="http://127.0.0.1:18235"
if [[ "$TIER" == "opus" ]]; then
  printf '{"provider":"ternary-bonsai-27b","modelId":"%s","baseUrl":"%s","slotId":null,"ctx":0,"emergency":false}\n' "$OPUS_MODEL" "$OPUS_BASE_URL"
  exit 0
fi

if [[ -n "$PHASE" ]]; then
  SLOT=$(factory_psql -v phase="$PHASE" <<'SQL'
SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')
FROM tickets.factory_model_slots WHERE phase = :'phase';
SQL
)
  if [[ -n "$SLOT" ]]; then
    IFS=$'\t' read -r prov model burl <<< "$SLOT"
    if [[ -n "$prov" ]]; then
      BJSON=$([[ -n "$burl" ]] && printf '"%s"' "$burl" || printf 'null')
      printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":null,"ctx":0,"emergency":false}\n' "$prov" "$model" "$BJSON"
      exit 0
    fi
  fi
fi

# Ordered candidates: source-specific before '*', then priority asc.
CANDS=$(factory_psql -v src="$SOURCE" -v tier="$TIER" <<'SQL'
SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')||E'\t'||max_concurrent
       ||E'\t'||COALESCE(context_window,0)||E'\t'||COALESCE(context_budget::text,'')
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier=:'tier' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC;
SQL
)

while IFS=$'\t' read -r prov model burl maxc ctx budget; do
  [[ -z "$prov" ]] && continue
  # Atomic claim: circuit closed AND below cap AND (unbounded budget OR fits reservation).
  CLAIM=$(factory_psql -v prov="$prov" -v maxc="$maxc" -v ctx="${ctx:-0}" -v budget="$budget" <<'SQL'
INSERT INTO tickets.provider_health (provider) VALUES (:'prov') ON CONFLICT (provider) DO NOTHING;
UPDATE tickets.provider_health
SET active_agents = active_agents + 1, reserved_tokens = reserved_tokens + :'ctx'::int, updated_at = now()
WHERE provider = :'prov'
  AND active_agents < :'maxc'::int
  AND (cooldown_until IS NULL OR cooldown_until <= now())
  AND (nullif(:'budget','')::int IS NULL OR reserved_tokens + :'ctx'::int <= nullif(:'budget','')::int)
RETURNING provider;
SQL
)
  if [[ -n "$CLAIM" ]]; then
    BJSON=$([[ -n "$burl" ]] && printf '"%s"' "$burl" || printf 'null')
    printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":"%s","ctx":%s,"emergency":false}\n' "$prov" "$model" "$BJSON" "$prov" "${ctx:-0}"
    exit 0
  fi
done <<< "$CANDS"

# Emergency fallback: local Qwen3.6, no slot claimed.
printf '{"provider":"lmstudio","modelId":"qwythos-9b-v2","baseUrl":"http://127.0.0.1:1234","slotId":null,"ctx":0,"emergency":true}\n'
