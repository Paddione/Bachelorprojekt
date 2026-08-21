-- 2026-08-21-disable-dead-llm-proxy-backends.sql
-- Schaltet inaktive/tote Proxy-Backends ab (T013003, G-LLM05).
--
-- llamacpp-gemma (:8091) war das Loadout gemma26-factory.
-- Seit T012414 laufen alle lokalen Agenten auf gemma12-vision (:8089).
--
-- Idempotent: UPDATE … WHERE name IN (…).
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-21-disable-dead-llm-proxy-backends.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-21-disable-dead-llm-proxy-backends.sql'
BEGIN;

UPDATE tickets.llm_proxy_backends
   SET enabled    = false,
       updated_at = now()
 WHERE name IN ('llamacpp-gemma');

COMMIT;
