-- 2026-07-21-provider-config-bonsai-only.sql
-- Disable all providers except ternary-bonsai-27b and seed Bonsai as the sole active
-- provider for every tier. Reversible: re-enable other providers by setting enabled=true.
-- Idempotent (ON CONFLICT DO UPDATE).
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-21-provider-config-bonsai-only.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-21-provider-config-bonsai-only.sql'
BEGIN;

-- 1. Disable every non-Bonsai provider (reversible — just set enabled=true later).
UPDATE tickets.provider_config
   SET enabled = false, updated_at = now()
 WHERE provider <> 'ternary-bonsai-27b';

-- 2. Seed a Bonsai wildcard row for each tier used in the codebase.
--    priority=0 wins over the now-disabled priority-1+ rows in ORDER BY priority ASC.
--    source='*' covers all callers; source-specific rows stay disabled above.
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, enabled)
VALUES
  ('*', 'haiku',    0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'sonnet',   0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'coaching', 0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'cheap',    0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'flash',    0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider   = EXCLUDED.provider,
      model_id   = EXCLUDED.model_id,
      base_url   = EXCLUDED.base_url,
      enabled    = true,
      updated_at = now();

-- 3. Point factory_model_slots to Bonsai (route-provider.sh checks this first for factory-* phases).
UPDATE tickets.factory_model_slots
   SET provider  = 'ternary-bonsai-27b',
       model_id  = 'ternary-bonsai-27b',
       base_url  = 'http://127.0.0.1:18235';

COMMIT;
