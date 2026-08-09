-- 2026-08-09-enable-gemma-backend-proxy-T002640.sql
-- Schaltet das llamacpp-gemma Backend (:8091) im llm-proxy nach Abschluss des
-- Base-vs-Tuned-Gates scharf (T002640).
--
-- model_aliases wird von der veralteten 12B-Datei auf den aktiven Modell-Alias
-- gemma26-factory (Port 8091, Gemma 4 26B A4B UD-IQ4_XS) korrigiert.
--
-- Idempotent & Reversibel.
--
-- Apply:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-09-enable-gemma-backend-proxy-T002640.sql'
BEGIN;

UPDATE tickets.llm_proxy_backends
   SET enabled       = true,
       model_aliases = '{"gemma-4-12b": "gemma26-factory", "gemma-4-26b": "gemma26-factory"}'::jsonb,
       updated_at    = now()
 WHERE name = 'llamacpp-gemma';

COMMIT;
