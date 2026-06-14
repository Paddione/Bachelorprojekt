-- 2026-06-14-llm-availability-seed.sql
-- Seeds DeepSeek + local-cluster as preferred providers for assistant-chat and
-- ticket-triage, demoting wildcard Anthropic rows to priority 99 (last resort).
-- Idempotent (ON CONFLICT DO UPDATE / DO NOTHING).
--
-- Apply to BOTH brands (workspace AND workspace-korczewski) — separate per-brand DBs:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-llm-availability-seed.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-llm-availability-seed.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website

BEGIN;

-- ── assistant-chat: DeepSeek priority 1, local-cluster priority 2 ─────────────
INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url, enabled)
VALUES
  ('assistant-chat', 'sonnet', 1, 'deepseek',      'deepseek-chat', 'https://api.deepseek.com/v1', true),
  ('assistant-chat', 'sonnet', 2, 'local-cluster', 'mistral',       NULL,                          false)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider   = EXCLUDED.provider,
      model_id   = EXCLUDED.model_id,
      base_url   = EXCLUDED.base_url,
      enabled    = EXCLUDED.enabled,
      updated_at = now();

-- local-cluster rows are seeded as enabled=false (base_url=NULL would produce 401s).
-- Activate via /admin/ki-konfiguration UI after setting the cluster chat URL:
-- UPDATE tickets.provider_config
--   SET base_url = 'http://llm-gateway-chat.workspace.svc.cluster.local:11434/v1', enabled = true
--   WHERE provider = 'local-cluster';

-- ── ticket-triage: DeepSeek priority 1, local-cluster priority 2 ─────────────
INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url, enabled)
VALUES
  ('ticket-triage', 'haiku', 1, 'deepseek',      'deepseek-chat', 'https://api.deepseek.com/v1', true),
  ('ticket-triage', 'haiku', 2, 'local-cluster', 'mistral',       NULL,                          false)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider   = EXCLUDED.provider,
      model_id   = EXCLUDED.model_id,
      base_url   = EXCLUDED.base_url,
      enabled    = EXCLUDED.enabled,
      updated_at = now();

-- ── Demote wildcard Anthropic rows to priority 99 (already there from initProviderConfigSchema,
--    but make explicit in case they were re-seeded at a different priority) ────
UPDATE tickets.provider_config
  SET priority = 99, updated_at = now()
  WHERE source = '*' AND provider = 'anthropic'
    AND priority <> 99;

-- Note: the wildcard rows (*,sonnet,99,anthropic) and (*,haiku,99,anthropic) are inserted by
-- initProviderConfigSchema on startup (DO NOTHING on conflict). No further action needed.

COMMIT;
