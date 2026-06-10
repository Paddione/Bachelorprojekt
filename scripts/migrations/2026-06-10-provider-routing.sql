-- 2026-06-10-provider-routing.sql
-- Central agent→provider routing + circuit-breaker (T-provider-routing).
-- Idempotent. Authoritative idempotent DDL lives in website/src/lib/tickets-db.ts
-- initTicketsSchema(); this file mirrors it for manual bring-up via factory_psql:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-10-provider-routing.sql'
-- Apply to BOTH brands (workspace AND workspace-korczewski) — separate per-brand DBs.
BEGIN;

CREATE TABLE IF NOT EXISTS tickets.provider_config (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,
  tier           TEXT NOT NULL CHECK (tier IN ('sonnet','haiku')),
  priority       INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model_id       TEXT NOT NULL,
  base_url       TEXT,
  max_concurrent INTEGER NOT NULL DEFAULT 3,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, tier, priority)
);

CREATE TABLE IF NOT EXISTS tickets.provider_health (
  provider       TEXT PRIMARY KEY,
  failure_count  INTEGER NOT NULL DEFAULT 0,
  last_failure   TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  active_agents  INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
VALUES
  ('*', 'sonnet', 99, 'anthropic', 'claude-sonnet-4-6', NULL),
  ('*', 'haiku',  99, 'anthropic', 'claude-haiku-4-5',  NULL)
ON CONFLICT (source, tier, priority) DO NOTHING;

COMMIT;
