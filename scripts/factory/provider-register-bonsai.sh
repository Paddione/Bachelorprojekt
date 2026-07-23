#!/usr/bin/env bash
# scripts/factory/provider-register-bonsai.sh — register the Bonsai llama.cpp
# server (:8093, single slot) for implement + review. Idempotent (ON CONFLICT).
#   bash scripts/factory/provider-register-bonsai.sh            # both brands
# 2026-07-23 Redesign: server runs -np 1 (start-bonsai-parallel.ps1) - no more
# concurrent slots on the model itself. Concurrent Factory/orchestrator
# dispatches now serialize in scripts/llm-proxy's FIFO queue instead, so
# max_concurrent=1 here reflects reality (was 3, from the old 3-worker +
# 1-orchestrator slot-budget design that no longer exists). Scout/Plan keep
# their current routing; route-provider.sh prefers factory_model_slots
# (phase-pin) over provider_config, so no code change there is needed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for b in mentolder korczewski; do
  BRAND="$b" bash -c 'source "'"$HERE"'/lib.sh"; factory_resolve; factory_psql' <<'SQL'
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled)
VALUES
  ('factory-implement', 'sonnet', 0, 'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 1, true),
  ('factory-review',    'sonnet', 0, 'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 1, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, max_concurrent = EXCLUDED.max_concurrent,
      enabled = true, updated_at = now();

INSERT INTO tickets.factory_model_slots (phase, provider, model_id, base_url, set_by)
VALUES
  ('implement', 'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 'provider-register-bonsai'),
  ('verify',    'llamacpp', 'ternary-bonsai-27b', 'http://127.0.0.1:8093/v1', 'provider-register-bonsai')
ON CONFLICT (phase) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, set_by = EXCLUDED.set_by, updated_at = now();
SQL
  echo "bonsai provider registered for $b"
done
