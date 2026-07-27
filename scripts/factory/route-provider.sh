#!/usr/bin/env bash
# scripts/factory/route-provider.sh <source> <tier>
# Emits JSON: {"provider":..,"modelId":..,"baseUrl":..|null,"slotId":..|null,"emergency":bool}
# opus → provider_config lookup without slot claim (T002277). Used by dev-flow, auto-triage.sh
# and scout-llm-fallback.sh. (Hier stand bis T002281 der Hinweis, die Logik sei zusätzlich in
# pipeline.js dupliziert — das stimmt nicht: pipeline.js enthält weder slotId noch
# provider_health, und die Behauptung hat beim Debuggen des Slot-Leaks in die Irre geführt.)
# slotId == provider name (slots are per-provider counters, not per-claim UUIDs).
# WER CLAIMT, MUSS FREIGEBEN: scripts/factory/release-slot.sh — sonst bleibt active_agents
# stehen, bis der Provider auf max_concurrent steht und still übersprungen wird. Netz
# darunter: scripts/factory/reap-provider-slots.sh (TTL über claimed_at).
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

# Tier "opus": Modell aus der Registry, aber OHNE Slot-Claim.
#
# T002277: hier stand ein hardcodiertes ternary-bonsai-27b, das die DB komplett
# umging. Nach dem Gemma-Cutover (2026-07-27) existiert dieses Modell auf keinem
# Backend mehr - der Aufruf lief nur deshalb noch, weil resolveModel() im
# llm-proxy unbekannte Modelle still auf das erste gesunde Backend umbiegt. Ein
# Routing, das von einem Fallback lebt, ist keins.
#
# WARUM KEIN SLOT-CLAIM: opus lieferte immer slotId:null, es gibt fuer diesen Tier
# also keinen Release-Pfad beim Aufrufer. Ginge er jetzt durch die normale
# Claim-Kette weiter unten, wuerde jeder Aufruf provider_health.active_agents
# erhoehen, ohne ihn je zu senken - der Provider waere nach max_concurrent
# Aufrufen dauerhaft blockiert. Daher eigener Zweig mit reinem Lookup.
#
# WARUM DER FALLBACK BLEIBT: der alte Hardcode hatte eine Eigenschaft, die nicht
# verloren gehen darf - opus routete OHNE Cluster. factory_psql geht ueber
# `kubectl exec` in den shared-db-Pod; ohne erreichbaren Cluster (CI, offline
# arbeitendes dev-flow) waere ein reiner DB-Lookup ein harter Abbruch. Die DB
# gewinnt, wenn sie antwortet; sonst greift der Default unten. Er ist bewusst
# derselbe Wert, den die Migration in die Registry schreibt - weicht er ab, ist
# das ein Bug, kein Feature.
OPUS_FALLBACK=$'llamacpp\tgemma-4-12b\thttp://127.0.0.1:18235'
if [[ "$TIER" == "opus" ]]; then
  OPUS_ROW=$(factory_psql -v src="$SOURCE" 2>/dev/null <<'SQL' || true
SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier='opus' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC
LIMIT 1;
SQL
)
  if [[ -z "$OPUS_ROW" ]]; then
    echo "route-provider: provider_config fuer tier=opus nicht lesbar oder leer (source=$SOURCE)." >&2
    echo "  Fallback auf den eingebauten Default. Bei erreichbarem Cluster:" >&2
    echo "  scripts/migrations/2026-07-27-llm-proxy-gemma-backend.sql anwenden." >&2
    OPUS_ROW="$OPUS_FALLBACK"
  fi
  IFS=$'\t' read -r opus_prov opus_model opus_burl <<< "$OPUS_ROW"
  OPUS_BJSON=$([[ -n "$opus_burl" ]] && printf '"%s"' "$opus_burl" || printf 'null')
  printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":null,"ctx":0,"emergency":false}\n' \
    "$opus_prov" "$opus_model" "$OPUS_BJSON"
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
SET active_agents = active_agents + 1, reserved_tokens = reserved_tokens + :'ctx'::int,
    claimed_at = now(), updated_at = now()
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
