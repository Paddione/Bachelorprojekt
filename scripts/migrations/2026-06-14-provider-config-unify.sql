-- 2026-06-14-provider-config-unify.sql
-- Vereinheitlichte KI-API-Konfiguration: erweitert tickets.provider_config um `brand` +
-- Coaching-Generierungs-Parameter, damit Coaching physisch ins zentrale Routing-Modell
-- fusioniert werden kann.
-- Idempotent. Autoritative DDL lebt in website/src/lib/schema/provider-config-schema.ts
-- (initProviderConfigSchema); diese Datei spiegelt sie für manuellen bring-up via factory_psql:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-provider-config-unify.sql'
-- Auf BEIDE Brands anwenden (workspace UND workspace-korczewski) — getrennte per-brand DBs.
-- Die DATEN-Migration (coaching.ki_config -> provider_config + FK-Remap) liegt in
-- 2026-06-14-coaching-data-migrate.sql.
BEGIN;

ALTER TABLE tickets.provider_config
  ADD COLUMN IF NOT EXISTS brand             TEXT NOT NULL DEFAULT '*',
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN,
  ADD COLUMN IF NOT EXISTS display_name      TEXT,
  ADD COLUMN IF NOT EXISTS api_key           TEXT,
  ADD COLUMN IF NOT EXISTS api_endpoint      TEXT,
  ADD COLUMN IF NOT EXISTS temperature       NUMERIC,
  ADD COLUMN IF NOT EXISTS max_tokens        INTEGER,
  ADD COLUMN IF NOT EXISTS top_p             NUMERIC,
  ADD COLUMN IF NOT EXISTS top_k             INTEGER,
  ADD COLUMN IF NOT EXISTS system_prompt     TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS thinking_mode     BOOLEAN,
  ADD COLUMN IF NOT EXISTS presence_penalty  NUMERIC,
  ADD COLUMN IF NOT EXISTS frequency_penalty NUMERIC,
  ADD COLUMN IF NOT EXISTS safe_prompt       BOOLEAN,
  ADD COLUMN IF NOT EXISTS random_seed       INTEGER,
  ADD COLUMN IF NOT EXISTS organization_id   TEXT,
  ADD COLUMN IF NOT EXISTS eu_endpoint       BOOLEAN,
  ADD COLUMN IF NOT EXISTS enabled_fields    JSONB;

-- tier='coaching' erlauben: alte DB-CHECK (tier IN ('sonnet','haiku')) entfernen.
-- tier wird app-seitig validiert (ki-services Registry + /api/admin/ki/providers).
ALTER TABLE tickets.provider_config DROP CONSTRAINT IF EXISTS provider_config_tier_check;

-- Brand-scoped Coaching-Eindeutigkeit: ein Eintrag pro (brand, provider) für Coaching.
CREATE UNIQUE INDEX IF NOT EXISTS provider_config_coaching_brand_provider
  ON tickets.provider_config (brand, provider) WHERE source = 'coaching';
CREATE INDEX IF NOT EXISTS provider_config_coaching_active
  ON tickets.provider_config (brand, source, is_active);

COMMIT;
