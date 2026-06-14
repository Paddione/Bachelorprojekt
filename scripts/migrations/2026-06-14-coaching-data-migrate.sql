-- 2026-06-14-coaching-data-migrate.sql
-- DATEN-Migration: coaching.ki_config -> tickets.provider_config (source='coaching') +
-- Remap der FK coaching.sessions.ki_config_id auf die neuen provider_config-IDs.
--
-- Reihenfolge: NACH 2026-06-14-provider-config-unify.sql, VOR Nutzung der neuen Coaching-UI.
-- Auf BEIDE Brand-DBs anwenden (workspace UND workspace-korczewski).
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-coaching-data-migrate.sql'
-- Idempotent. Logik-Spiegel (getestet via pg-mem): website/src/lib/schema/coaching-migrate.ts.
-- coaching.ki_config wird NICHT gedroppt (Rollback-Sicherheit; Drop erst Phase 2).
BEGIN;

-- 1) Kopiere Legacy-Coaching-Provider in den vereinheitlichten Store (priority = alte id).
INSERT INTO tickets.provider_config
  (brand, source, tier, priority, provider, model_id, base_url, enabled, is_active,
   display_name, api_key, api_endpoint, temperature, max_tokens, top_p, top_k,
   system_prompt, notes, thinking_mode, presence_penalty, frequency_penalty,
   safe_prompt, random_seed, organization_id, eu_endpoint, enabled_fields)
SELECT
  k.brand, 'coaching', 'coaching', k.id, k.provider, COALESCE(k.model_name, ''),
  k.api_endpoint, true, COALESCE(k.is_active, false), COALESCE(k.display_name, k.provider),
  k.api_key, k.api_endpoint, k.temperature, k.max_tokens, k.top_p, k.top_k,
  k.system_prompt, k.notes, COALESCE(k.thinking_mode, false), k.presence_penalty,
  k.frequency_penalty, COALESCE(k.safe_prompt, false), k.random_seed, k.organization_id,
  COALESCE(k.eu_endpoint, false), k.enabled_fields
FROM coaching.ki_config k
WHERE NOT EXISTS (
  SELECT 1 FROM tickets.provider_config p
  WHERE p.source = 'coaching' AND p.brand = k.brand AND p.provider = k.provider
);

-- 2) Persistentes Mapping alte ki_config.id -> neue provider_config.id.
CREATE TABLE IF NOT EXISTS coaching.ki_config_id_map (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO coaching.ki_config_id_map (old_id, new_id)
SELECT k.id, p.id
FROM coaching.ki_config k
JOIN tickets.provider_config p
  ON p.source = 'coaching' AND p.brand = k.brand AND p.provider = k.provider
ON CONFLICT (old_id) DO NOTHING;

-- 3) FK lösen (falls vorhanden) und Sessions remappen (overlap-sicher idempotent:
--    bereits auf eine new_id zeigende Sessions werden übersprungen).
ALTER TABLE coaching.sessions DROP CONSTRAINT IF EXISTS coaching_sessions_ki_config_id_fkey;
UPDATE coaching.sessions s
SET ki_config_id = m.new_id
FROM coaching.ki_config_id_map m
WHERE s.ki_config_id = m.old_id
  AND NOT EXISTS (SELECT 1 FROM coaching.ki_config_id_map m2 WHERE m2.new_id = s.ki_config_id);

COMMIT;
