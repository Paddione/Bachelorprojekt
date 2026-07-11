-- 2026-07-03-local-qwen35-seed.sql
-- Routes context-light orchestration sources to the local qwen3.5 LM-Studio endpoint at
-- priority 1 (context_window=60000, context_budget=180000) and demotes existing priority-1
-- rows to the next free priority for their (source, tier) (collision-safe against pre-existing
-- priority-2+ rows). Idempotent (ON CONFLICT DO UPDATE + provider<>'local-qwen35' demotion
-- guard). Depends on 2026-07-03-context-budget.sql.
--
-- Scope-corrected 2026-07-09 (T001681): factory-scout/factory-plan/lavish-artifact removed —
-- they call the harness agent() primitive, which has no baseUrl support; only ticket-triage
-- uses its own baseURL-aware SDK client (website/src/lib/ticket-triage.ts) and benefits from this row.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-local-qwen35-seed.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-local-qwen35-seed.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website
BEGIN;

-- Demote every existing priority-1 row of the four sources so local-qwen35 can take
-- priority 1. Placed at (current max priority for that source/tier + 1) rather than a
-- fixed literal 2 — ticket-triage/haiku already had a priority-2 row (local-cluster,
-- 2026-06-14-llm-availability-seed.sql), and a fixed 2 would collide with the
-- UNIQUE (source, tier, priority) constraint. `provider <> 'local-qwen35'` keeps this
-- idempotent: a second run must not re-demote the already-seeded local-qwen35 row.
WITH targets AS (
  SELECT id, source, tier
    FROM tickets.provider_config
   WHERE source IN ('ticket-triage')
     AND priority = 1
     AND provider <> 'local-qwen35'
),
new_prio AS (
  SELECT t.id,
         (SELECT COALESCE(MAX(pc2.priority), 1) + 1
            FROM tickets.provider_config pc2
           WHERE pc2.source = t.source AND pc2.tier = t.tier) AS priority
    FROM targets t
)
UPDATE tickets.provider_config pc
   SET priority = np.priority, updated_at = now()
  FROM new_prio np
 WHERE pc.id = np.id;

-- Priority-1 local-qwen35 rows. base_url is the mesh IP endpoint (no key required).
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, context_window, context_budget, enabled)
VALUES
  ('ticket-triage',   'haiku',  1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider       = EXCLUDED.provider,
      model_id       = EXCLUDED.model_id,
      base_url       = EXCLUDED.base_url,
      context_window = EXCLUDED.context_window,
      context_budget = EXCLUDED.context_budget,
      enabled        = EXCLUDED.enabled,
      updated_at     = now();

COMMIT;
