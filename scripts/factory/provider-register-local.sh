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
# max_concurrent=1: llama.cpp serviert genau einen Request gleichzeitig
# (--max-running-requests 1, statischer 200k-KV-Pool). Seit T013302 laeuft das
# Routing ausschliesslich ueber provider_config, der fruehere Phasen-Pin ist
# entfallen.
#
# [T900208] Bis 2026-09-17 zeigte die base_url auf das Gateway (llm-proxy
# :18235, Backend-Registry tickets.llm_proxy_backends) und der Modellname kam
# optional aus dessen /admin/factory-Pin. Der Proxy ist seit 2026-09-03
# stillgelegt (ADR-007); beides ist entfallen. Die Registrierung zeigt jetzt
# direkt auf llama.cpp :1919 — das einzige lokale Generierungs-Backend.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"

# T014028: lokaler Default ist llama.cpp (Modell-ID, kein Loadout-Slug —
# dieselbe Konvention wie route-provider.sh, damit der Default-Konsistenzguard
# in tests/spec/software-factory/factory-model-id-default.bats gruen bleibt).
MODEL_ID="${FACTORY_MODEL_ID:-Qwen3.8-27B-gsq}"
# Dieselbe Adresse und derselbe Override wie route-provider.sh (FACTORY_LOCAL_URL).
# [T003492] OHNE '/v1' — die Konsumenten haengen '/v1/chat/completions' selbst an
# (openspec/specs/software-factory.md: base_url adressiert die Wurzel, "that the
# callers append /v1/chat/completions to"). Mit '/v1' entstand '.../v1/v1/chat/
# completions' → HTTP 404, und weil curl ohne --fail laeuft, meldete auto-triage
# das als "no content in <provider> response" statt als Transportfehler.
LOCAL_URL="${FACTORY_LOCAL_URL:-http://127.0.0.1:1919}"

for b in mentolder korczewski; do
  BRAND="$b" MODEL_ID="$MODEL_ID" LOCAL_URL="$LOCAL_URL" \
  bash -c 'source "'"$HERE"'/lib.sh"; factory_resolve; factory_psql \
    -v model_id="$MODEL_ID" -v base_url="$LOCAL_URL"' <<'SQL'
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled)
VALUES
  ('factory-implement', 'sonnet', 0, 'llamacpp', :'model_id', :'base_url', 1, true),
  ('factory-review',    'sonnet', 0, 'llamacpp', :'model_id', :'base_url', 1, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, max_concurrent = EXCLUDED.max_concurrent,
      enabled = true, updated_at = now();
SQL
  echo "local provider registered for $b — model=$MODEL_ID url=$LOCAL_URL"
done
