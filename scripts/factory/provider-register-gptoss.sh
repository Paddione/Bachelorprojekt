#!/usr/bin/env bash
# scripts/factory/provider-register-gptoss.sh — register openai/gpt-oss-20b
# (:8097) as a SECOND, INERT candidate for implement + review. Idempotent.
#
#   bash scripts/factory/provider-register-gptoss.sh            # both brands
#
# WARUM PRIORITY 1 UND NICHT 0 (T002268):
# route-provider.sh sortiert die Kandidaten mit `ORDER BY (source=:'src') DESC,
# priority ASC`. Ternary-Bonsai steht auf priority 0, der Anthropic-Fallback auf
# 99. Ein Eintrag auf priority 1 bedeutet also:
#   - im Normalbetrieb inert, Bonsai gewinnt weiterhin;
#   - aber lokaler Fallback VOR Anthropic, falls Bonsais Circuit-Breaker
#     (tickets.provider_health) ausloest.
#
# WAS DIESES SKRIPT ABSICHTLICH NICHT TUT:
# Es schreibt NICHT in tickets.factory_model_slots. Das ist der Phase-Pin, den
# route-provider.sh gegenueber provider_config BEVORZUGT — ihn zu setzen wuerde
# das Live-Routing umstellen. Der Umstieg auf gpt-oss ist eine bewusste,
# separate Entscheidung und soll erst nach einem A/B ueber
# scripts/factory/eval-replay.mjs fallen.
#
# ENABLED IST HEALTH-GATED:
# Ist :8097 nicht erreichbar, wird der Eintrag mit enabled=false angelegt. Sonst
# wuerde ein Bonsai-Ausfall auf einen toten Endpunkt kaskadieren, bevor der
# Anthropic-Fallback greift.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODEL_ID="gpt-oss-20b"
# [T003492] OHNE '/v1' — siehe provider-register-local.sh: die Konsumenten von
# provider_config.base_url haengen '/v1/chat/completions' selbst an.
BASE_URL="http://127.0.0.1:8097"
PRIORITY=1

# --- Health-Gate --------------------------------------------------------------
if curl -fsS --max-time 5 "http://127.0.0.1:8097/health" >/dev/null 2>&1; then
  ENABLED=true
  echo "health :8097 ok — registriere enabled=true"
else
  ENABLED=false
  echo "health :8097 NICHT erreichbar — registriere enabled=false"
  echo "  Server starten mit: scripts/llm/start-gptoss-server.ps1 (auf dem GPU-Host)"
  echo "  Danach dieses Skript erneut aufrufen, um enabled=true zu setzen."
fi

for b in mentolder korczewski; do
  BRAND="$b" MODEL_ID="$MODEL_ID" BASE_URL="$BASE_URL" PRIORITY="$PRIORITY" ENABLED="$ENABLED" \
  bash -c 'source "'"$HERE"'/lib.sh"; factory_resolve; factory_psql \
    -v model_id="$MODEL_ID" -v base_url="$BASE_URL" -v prio="$PRIORITY" -v en="$ENABLED"' <<'SQL'
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled)
VALUES
  ('factory-implement', 'sonnet', :prio, 'llamacpp', :'model_id', :'base_url', 1, :en),
  ('factory-review',    'sonnet', :prio, 'llamacpp', :'model_id', :'base_url', 1, :en)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, max_concurrent = EXCLUDED.max_concurrent,
      enabled = EXCLUDED.enabled, updated_at = now();
SQL
  echo "gpt-oss candidate registered for $b (priority $PRIORITY, enabled=$ENABLED)"
done

echo ""
echo "Routing pruefen (Bonsai muss weiterhin priority 0 gewinnen):"
echo "  BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql' <<'Q'"
echo "  SELECT source, priority, model_id, base_url, enabled FROM tickets.provider_config"
echo "   WHERE source LIKE 'factory-%' ORDER BY source, priority;"
echo "  Q"
echo ""
echo "A/B fahren:  node scripts/factory/eval-replay.mjs --help"
echo "Umschalten (BEWUSST, aendert das Live-Routing): tickets.factory_model_slots"
