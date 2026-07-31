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
  # apiKeyEnv:null haelt das Ausgabeschema mit der Kandidatenkette deckungsgleich [T002359].
  # Die Auswahllogik dieses Zweigs bleibt bewusst unangetastet (kein Slot-Claim).
  printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":false}\n' \
    "$opus_prov" "$opus_model" "$OPUS_BJSON"
  exit 0
fi

# Der Phase-Pin aus factory_model_slots ist Kandidat #0, nicht das Ergebnis [T002359].
# Bis hierher returnte dieser Block beim ersten Treffer und uebersprang damit
# Priority-Kette, provider_health, Cooldown und Claim vollstaendig — die gesamte
# Fallback-Logik darunter war fuer plan/implement/verify toter Code.
#
# factory_model_slots hat keine max_concurrent-Spalte; der Literalwert 3 haelt das
# Feldformat mit provider_config deckungsgleich, damit beide Quellen dieselbe
# Claim-Schleife durchlaufen.
#
# FELDTRENNER \x1f STATT TAB [T002359]: Tab ist fuer bash ein IFS-WHITESPACE-Zeichen —
# aufeinanderfolgende Tabs verschmelzen zu einem einzigen Trenner und leere Felder
# verschwinden spurlos. Bei einer Cloud-Zeile ohne context_budget rutschte dadurch
# api_key_env in die budget-Variable, und der Claim brach mit
# `invalid input syntax for type integer: "DEEPSEEK_API_KEY_PK"` ab — also ausgerechnet
# auf der Fallback-Stufe, die dieses Ticket ueberhaupt erst erreichbar macht. Der Unit
# Separator ist kein Whitespace, daher bleiben leere Felder als leere Felder erhalten.
PINNED=""
# T002369: ROUTE_SKIP_PINNED=true überspringt den Phase-Pin (factory_model_slots)
# und sucht direkt in provider_config. Die Escalation-Leiter (haiku/sonnet) darf
# nicht vom lokalen Phase-Pin übersteuert werden.
if [[ -n "$PHASE" && "${ROUTE_SKIP_PINNED:-false}" != "true" ]]; then
  # max_concurrent kommt NICHT als Literal: factory_model_slots fuehrt die Spalte nicht,
  # aber der Cap gehoert zum Provider, nicht zur Tier-Zeile. Ein fester Wert wuerde den
  # konfigurierten Cap unterlaufen — registriert provider-register-bonsai.sh llamacpp mit
  # max_concurrent=1, liessen drei parallele Ticks trotzdem drei Claims gegen das Literal
  # durch. MIN() ueber die enabled provider_config-Zeilen desselben Providers waehlt
  # bewusst den strengsten konfigurierten Cap; 3 bleibt nur der Fallback fuer einen
  # Provider, der ueberhaupt keine Zeile hat.
  PINNED=$(factory_psql -v phase="$PHASE" <<'SQL'
SELECT s.provider||E'\x1f'||s.model_id||E'\x1f'||COALESCE(s.base_url,'')
       ||E'\x1f'||COALESCE((SELECT MIN(c.max_concurrent) FROM tickets.provider_config c
                             WHERE c.provider = s.provider AND c.enabled = true), 3)
       ||E'\x1f'||0||E'\x1f'||''||E'\x1f'||COALESCE(s.api_key_env,'')
FROM tickets.factory_model_slots s WHERE s.phase = :'phase';
SQL
)
fi

# Ordered candidates: source-specific before '*', then priority asc.
CANDS=$(factory_psql -v src="$SOURCE" -v tier="$TIER" <<'SQL'
SELECT provider||E'\x1f'||model_id||E'\x1f'||COALESCE(base_url,'')||E'\x1f'||max_concurrent
       ||E'\x1f'||COALESCE(context_window,0)||E'\x1f'||COALESCE(context_budget::text,'')
       ||E'\x1f'||COALESCE(api_key_env,'')
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier=:'tier' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC;
SQL
)
[[ -n "$PINNED" ]] && CANDS="${PINNED}"$'\n'"${CANDS}"

while IFS=$'\x1f' read -r prov model burl maxc ctx budget keyenv; do
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
    KJSON=$([[ -n "$keyenv" ]] && printf '"%s"' "$keyenv" || printf 'null')
    printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":"%s","ctx":%s,"apiKeyEnv":%s,"emergency":false}\n' \
      "$prov" "$model" "$BJSON" "$prov" "${ctx:-0}" "$KJSON"
    exit 0
  fi
done <<< "$CANDS"

# Emergency fallback: lokales LM Studio, kein Slot geclaimt.
# RC5 [T002359]: hier stand ein Modell, das LM Studio seit dem Gemma-Cutover nicht
# mehr serviert. Der Router gab es lautlos zurueck — der llm-proxy bog es still auf
# das erste gesunde Backend um, sodass nirgends ein Fehler auftauchte.
echo "route-provider: ALLE Kandidaten fuer source=$SOURCE tier=$TIER belegt oder auf Cooldown." >&2
echo "  Emergency-Fallback aktiv — pruefe 'bash scripts/factory/reap-provider-slots.sh --dry-run'." >&2
printf '{"provider":"lmstudio","modelId":"gemma-4-12b","baseUrl":"http://127.0.0.1:1234","slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":true}\n'
