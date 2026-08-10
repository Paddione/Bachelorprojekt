#!/usr/bin/env bash
# scripts/factory/provider-register-local.sh — registriert das lokale Chat-Modell
# fuer implement + review. Idempotent (ON CONFLICT).
#   bash scripts/factory/provider-register-local.sh            # beide Brands
#
# [T002582] Hiess bis 2026-08-02 provider-register-bonsai.sh und schrieb
# 'ternary-bonsai-27b' mit base_url http://127.0.0.1:8093/v1. Beides war zu dem
# Zeitpunkt falsch: Port 8093 serviert seit T002551 den bge-Reranker, ein
# Registrierungslauf haette Implement/Review also auf ein Reranking-Modell
# geleitet. Zugleich verlangt openspec/specs/software-factory.md ausdruecklich
# das Gateway und "never a backend port directly" — das Skript verletzte seine
# eigene SSOT, und der in openspec/specs/local-llm-proxy.md zugesagte Lint, der
# genau das haette abfangen sollen, war nie implementiert (jetzt:
# tests/spec/local-llm-proxy/gateway-consumer-lint.bats).
#
# Der Modellname ist bewusst kein Literal mehr: FACTORY_MODEL_ID ueberschreibt
# ihn, damit ein Modellwechsel keine Quelltextaenderung erzwingt.
#
# 2026-07-23 Redesign (unveraendert gueltig): der Server laeuft mit einem Slot —
# gleichzeitige Factory-/Orchestrator-Dispatches serialisieren in der FIFO-Queue
# von scripts/llm-proxy, daher max_concurrent=1. Scout/Plan behalten ihr
# Routing; route-provider.sh bevorzugt factory_model_slots (Phasen-Pin) vor
# provider_config, eine Codeaenderung dort ist nicht noetig.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODEL_ID="${FACTORY_MODEL_ID:-gemma26-throughput}"
# Immer das vereinheitlichte Gateway, nie ein Backend-Port. Welches Backend
# dahinter haengt, entscheidet die Registry tickets.llm_proxy_backends.
# [T003492] OHNE '/v1' — die Konsumenten haengen '/v1/chat/completions' selbst an
# (openspec/specs/software-factory.md: base_url adressiert die Wurzel, "that the
# callers append /v1/chat/completions to"). Mit '/v1' entstand '.../v1/v1/chat/
# completions' → HTTP 404, und weil curl ohne --fail laeuft, meldete auto-triage
# das als "no content in <provider> response" statt als Transportfehler.
GATEWAY_URL="${FACTORY_GATEWAY_URL:-http://127.0.0.1:18235}"

for b in mentolder korczewski; do
  BRAND="$b" MODEL_ID="$MODEL_ID" GATEWAY_URL="$GATEWAY_URL" \
  bash -c 'source "'"$HERE"'/lib.sh"; factory_resolve; factory_psql \
    -v model_id="$MODEL_ID" -v base_url="$GATEWAY_URL"' <<'SQL'
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled)
VALUES
  ('factory-implement', 'sonnet', 0, 'llamacpp', :'model_id', :'base_url', 1, true),
  ('factory-review',    'sonnet', 0, 'llamacpp', :'model_id', :'base_url', 1, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, max_concurrent = EXCLUDED.max_concurrent,
      enabled = true, updated_at = now();

INSERT INTO tickets.factory_model_slots (phase, provider, model_id, base_url, set_by)
VALUES
  ('implement', 'llamacpp', :'model_id', :'base_url', 'provider-register-local'),
  ('verify',    'llamacpp', :'model_id', :'base_url', 'provider-register-local')
ON CONFLICT (phase) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, set_by = EXCLUDED.set_by, updated_at = now();
SQL
  echo "local provider registered for $b — model=$MODEL_ID url=$GATEWAY_URL"
done
