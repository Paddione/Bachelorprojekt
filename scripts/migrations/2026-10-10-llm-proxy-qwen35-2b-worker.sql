-- 2026-10-10-llm-proxy-qwen35-2b-worker.sql
-- Haengt den frischen Qwen3.5-2B-BP-Quant (Q4_K_M, :8096, GPU0) als
-- Chat-Backend in die llm-proxy-Registry [User-Entscheidung 2026-10-10].
-- Serviert Modell-ID "qwen35-2b-worker" (llama-server --alias).
--
-- Idempotent (ON CONFLICT DO UPDATE).
--
-- Apply (fleet shared-db, vom WSL-Desktop):
--   kubectl --context fleet -n workspace exec -i deploy/shared-db -c postgres -- \
--     psql -U website -d website -v ON_ERROR_STOP=1 -q < scripts/migrations/2026-10-10-llm-proxy-qwen35-2b-worker.sql
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight, roles, loadout_slug)
VALUES
  ('qwen35-2b-worker', 'llamacpp', 'http://127.0.0.1:8096/v1', NULL, true, 1, '[]'::jsonb, '{}'::jsonb, 1, '[]'::jsonb, 'qwen35-2b-worker')
ON CONFLICT (name) DO UPDATE
  SET enabled      = true,
      base_url     = EXCLUDED.base_url,
      priority     = EXCLUDED.priority,
      loadout_slug = EXCLUDED.loadout_slug,
      updated_at   = now();

COMMIT;
