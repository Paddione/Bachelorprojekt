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

PIN="$(factory_model_pin)"
PIN_MODEL=""; PIN_LOCKED="0"
if [[ -n "$PIN" ]]; then
  IFS=$'\t' read -r PIN_MODEL PIN_LOCKED <<< "$PIN"
  if [[ "$PIN_LOCKED" == "1" ]]; then
    echo "route-provider: Factory-Modell gesperrt auf '$PIN_MODEL' (source=$SOURCE tier=$TIER) — DB-Routing uebersprungen." >&2
    printf '{"provider":"llamacpp","modelId":"%s","baseUrl":"http://127.0.0.1:18235","slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":false}\n' "$PIN_MODEL"
    exit 0
  fi
fi
FACTORY_DEFAULT_MODEL="${PIN_MODEL:-${FACTORY_MODEL_ID:-gemma26-throughput}}"

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
# [T002582] Stand hier bis 2026-08-02 auf 'gemma-4-12b' — ein Name, den das
# Gateway nicht mehr aufloest (routing-check.sh meldete ihn als FEHLT). Der
# Default ist per FACTORY_MODEL_ID ueberschreibbar, damit ein Modellwechsel
# nicht wieder an drei Stellen nachgezogen werden muss.
# [T003538] ZWEITER Fall derselben Klasse: der Nachfolger 'gemma26-factory' war ab
# spaetestens 2026-08-10 ebenfalls tot — das Loadout ist in loadouts.json zwar
# aktiviert, sein Backend (Port 8091) aber nicht geladen. "Aktiviert" und "geladen"
# sind verschiedene Dinge; nur Letzteres entscheidet, und es ist offline nicht
# pruefbar. Weil resolveModel() im llm-proxy eine unbekannte ID STILL auf das erste
# gesunde Backend umleitet, entsteht dabei nirgends ein Fehler: die Anfrage wird
# beantwortet, nur von einem anderen Modell — oder vom Cloud-Backend, das dann
# HTTP 402 ("Insufficient Balance") liefert und wie ein sporadischer Modellfehler
# aussieht. Der Default zeigt jetzt auf 'gemma26-throughput' (Port 8092, geladen).
# Dass es zweimal passierte, lag nicht am Wert, sondern daran, dass niemand
# routing-check.sh aufrief — wakeup.sh tut das seither pro Tick (fail-soft).
OPUS_FALLBACK=$'llamacpp\t'"$FACTORY_DEFAULT_MODEL"$'\thttp://127.0.0.1:18235'
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

# T013302: Der fruehere Phase-Pin aus der damaligen Slot-Tabelle ist entfernt —
# provider_config ist die einzige DB-Quelle des Routings. Der Factory-Default
# lebt am llm-proxy (factory_model_pin oben) und greift dort, wo er gesperrt ist.

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

# Emergency fallback: kein Slot geclaimt, Weg ueber das Gateway.
# RC5 [T002359]: hier stand ein Modell, das LM Studio seit dem Gemma-Cutover nicht
# mehr serviert. Der Router gab es lautlos zurueck — der llm-proxy bog es still auf
# das erste gesunde Backend um, sodass nirgends ein Fehler auftauchte.
# [T002582] Die damalige Korrektur trug nur einen anderen toten Namen ein
# ('gemma-4-12b') und zeigte weiterhin auf LM Studio :1234 — das dort seit T002551
# ausschliesslich Embedding- und Reranker-Modelle serviert, also GAR KEIN
# Chat-Modell mehr. Der Fallback zeigt jetzt auf dasselbe Gateway wie der
# regulaere Weg; damit gibt es nur noch eine Stelle, die ein Modell benennen kann.
echo "route-provider: ALLE Kandidaten fuer source=$SOURCE tier=$TIER belegt oder auf Cooldown." >&2
echo "  Emergency-Fallback aktiv — pruefe 'bash scripts/factory/reap-provider-slots.sh --dry-run'." >&2
printf '{"provider":"llamacpp","modelId":"%s","baseUrl":"http://127.0.0.1:18235","slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":true}\n' "$FACTORY_DEFAULT_MODEL"
