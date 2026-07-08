-- 2026-07-03-context-budget.sql
-- Additive token-budget columns for the provider routing semaphore (T001590).
-- Idempotent (ADD COLUMN IF NOT EXISTS). Mirror of provider-config-schema.ts.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-context-budget.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-context-budget.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website
BEGIN;
ALTER TABLE tickets.provider_config  ADD COLUMN IF NOT EXISTS context_window INTEGER;
ALTER TABLE tickets.provider_config  ADD COLUMN IF NOT EXISTS context_budget INTEGER;
ALTER TABLE tickets.provider_health  ADD COLUMN IF NOT EXISTS reserved_tokens INTEGER NOT NULL DEFAULT 0;
COMMIT;
