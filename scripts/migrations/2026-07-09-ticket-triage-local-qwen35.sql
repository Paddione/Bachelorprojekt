-- 2026-07-09-ticket-triage-local-qwen35.sql
-- Routes ticket-triage to the local LM-Studio qwen3.5 model at priority 1
-- (context_window=60000, context_budget=180000), demoting the existing
-- priority-1 row to the next free priority for (source, tier). Idempotent
-- (ON CONFLICT DO UPDATE + provider<>'local-qwen35' demotion guard, mirrors
-- 2026-07-03-local-qwen35-seed.sql).
--
-- Reproduces a change already applied live via kubectl exec + psql on
-- 2026-07-09 (T001680 follow-up conversation) — this file exists so a
-- cluster rebuild / disaster recovery reproduces the same state.
--
-- base_url is the K8s Service DNS for llm-gateway-lmstudio, which differs
-- per brand (separate namespace per brand) — unlike prior migrations in
-- this directory, this one is NOT brand-agnostic and requires the
-- `-v base_url=...` psql variable (supported by factory_psql, see
-- scripts/factory/lib.sh). Do NOT hardcode a wg-gpu IP here (a prior
-- migration did this for other sources and drifted — see
-- 2026-07-03-local-qwen35-seed.sql / docs/db-audit/2026-07-09-index-and-nplus1-audit.md §3a).
--
-- Apply to BOTH brands (separate per-brand DBs, different base_url each):
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql -v base_url="http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234/v1" < scripts/migrations/2026-07-09-ticket-triage-local-qwen35.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql -v base_url="http://llm-gateway-lmstudio.workspace-korczewski.svc.cluster.local:1234/v1" < scripts/migrations/2026-07-09-ticket-triage-local-qwen35.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website -v base_url='http://llm-gateway-lmstudio.workspace-dev.svc.cluster.local:1234/v1'
BEGIN;

-- Demote the current priority-1 row for ticket-triage/haiku to the next free
-- priority. `provider <> 'local-qwen35'` keeps this idempotent: a second run
-- must not re-demote the already-seeded local-qwen35 row.
WITH targets AS (
  SELECT id
    FROM tickets.provider_config
   WHERE source = 'ticket-triage' AND tier = 'haiku'
     AND priority = 1
     AND provider <> 'local-qwen35'
),
new_prio AS (
  SELECT t.id,
         (SELECT COALESCE(MAX(pc2.priority), 1) + 1
            FROM tickets.provider_config pc2
           WHERE pc2.source = 'ticket-triage' AND pc2.tier = 'haiku') AS priority
    FROM targets t
)
UPDATE tickets.provider_config pc
   SET priority = np.priority, updated_at = now()
  FROM new_prio np
 WHERE pc.id = np.id;

-- Priority-1 local-qwen35 row for ticket-triage. base_url is passed in via
-- the `base_url` psql variable (see invocation examples above).
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, context_window, context_budget, enabled)
VALUES
  ('ticket-triage', 'haiku', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', :'base_url', 60000, 180000, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider       = EXCLUDED.provider,
      model_id       = EXCLUDED.model_id,
      base_url       = EXCLUDED.base_url,
      context_window = EXCLUDED.context_window,
      context_budget = EXCLUDED.context_budget,
      enabled        = EXCLUDED.enabled,
      updated_at     = now();

COMMIT;
