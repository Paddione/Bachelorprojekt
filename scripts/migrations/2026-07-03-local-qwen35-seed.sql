-- 2026-07-03-local-qwen35-seed.sql
-- Routes context-light orchestration sources to the local qwen3.5 LM-Studio endpoint at
-- priority 1 (context_window=60000, context_budget=180000) and demotes existing rows to
-- priority 2. Idempotent (ON CONFLICT DO UPDATE). Depends on 2026-07-03-context-budget.sql.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-local-qwen35-seed.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-local-qwen35-seed.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website
BEGIN;

-- Demote every existing enabled row of the four sources to priority 2 (frees priority 1).
UPDATE tickets.provider_config
  SET priority = 2, updated_at = now()
  WHERE source IN ('factory-scout','factory-plan','ticket-triage','lavish-artifact')
    AND priority = 1;

-- Priority-1 local-qwen35 rows. base_url is the mesh IP endpoint (no key required).
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, context_window, context_budget, enabled)
VALUES
  ('factory-scout',   'sonnet', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true),
  ('factory-plan',    'sonnet', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true),
  ('ticket-triage',   'haiku',  1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true),
  ('lavish-artifact', 'sonnet', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider       = EXCLUDED.provider,
      model_id       = EXCLUDED.model_id,
      base_url       = EXCLUDED.base_url,
      context_window = EXCLUDED.context_window,
      context_budget = EXCLUDED.context_budget,
      enabled        = EXCLUDED.enabled,
      updated_at     = now();

COMMIT;
