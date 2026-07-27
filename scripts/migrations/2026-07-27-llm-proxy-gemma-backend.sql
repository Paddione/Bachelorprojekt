-- 2026-07-27-llm-proxy-gemma-backend.sql
-- Schreibt den Gemma-4-12B-Cutover vom 2026-07-27 fest, der bis hierhin nur live in
-- der DB stand und einen Reset nicht ueberlebt haette.
--
-- WAS SICH GEAENDERT HAT: die Factory lief auf ternary-bonsai-27b (:8093). Dieser
-- Server laeuft nicht mehr; an seiner Stelle steht Gemma 4 12B QAT mit MTP-Draft-Head
-- auf :8091 (Startskript: scripts/llm/start-gemma-server.ps1).
--
-- REIHENFOLGE: setzt 2026-07-22-llm-proxy-backends.sql (Tabelle llm_proxy_backends)
-- und 2026-07-23-llm-proxy-max-inflight.sql (Spalte max_inflight) voraus. Letztere war
-- auf mentolder nie angewandt worden - ohne sie wirft der Registry-Poll in
-- scripts/llm-proxy/backends.mjs bei jedem Tick, der Proxy laeuft mit LEERER
-- Backend-Liste und beantwortet jedes Modell mit 404, ohne dass /health das zeigt.
--
-- Idempotent (ON CONFLICT DO UPDATE, WHERE NOT EXISTS, gezielte UPDATE-Praedikate).
-- Reversibel: llamacpp-gemma auf enabled=false, llamacpp-bonsai zurueck auf true.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-27-llm-proxy-gemma-backend.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-27-llm-proxy-gemma-backend.sql'
BEGIN;

-- 1) Backend-Registry: Gemma auf :8091 aufnehmen, Bonsai auf :8093 stilllegen.
--
-- Der Alias entkoppelt den Namen, den Clients anfragen ('gemma-4-12b'), vom
-- GGUF-Dateinamen, den llama.cpp unter /v1/models meldet. Ohne ihn muesste jede
-- provider_config-Zeile den vollen Dateinamen fuehren und beim naechsten
-- Quant-Wechsel nachgezogen werden.
--
-- WARUM DER ALIAS NICHT OPTIONAL IST: resolveModel() in scripts/llm-proxy/discovery.mjs
-- hat einen Last-Resort-Fallback auf das erste gesunde Backend mit irgendeinem Modell.
-- Ein unbekannter Modellname landet also NICHT im 404, sondern still bei einem
-- beliebigen Server. Explizite Aliase machen aus diesem Zufall eine Zusage.
INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight)
VALUES
  ('llamacpp-gemma', 'llamacpp', 'http://127.0.0.1:8091/v1', NULL, true, 1, '[]'::jsonb,
   '{"gemma-4-12b":"gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"}'::jsonb, 1)
ON CONFLICT (name) DO UPDATE
  SET kind          = EXCLUDED.kind,
      base_url      = EXCLUDED.base_url,
      enabled       = true,
      priority      = EXCLUDED.priority,
      fixups        = EXCLUDED.fixups,
      model_aliases = EXCLUDED.model_aliases,
      max_inflight  = EXCLUDED.max_inflight,
      updated_at    = now();

UPDATE tickets.llm_proxy_backends
   SET enabled = false, updated_at = now()
 WHERE name = 'llamacpp-bonsai' AND enabled;

-- 2) Routing: alles, was noch auf Bonsai zeigt, auf Gemma biegen.
-- Das Praedikat auf model_id macht den zweiten Lauf zum No-op und ueberschreibt
-- keine spaetere, bewusste Umstellung auf ein drittes Modell.
UPDATE tickets.factory_model_slots
   SET model_id = 'gemma-4-12b', provider = 'llamacpp',
       base_url = 'http://127.0.0.1:18235', set_by = 'migration-2026-07-27', updated_at = now()
 WHERE model_id = 'ternary-bonsai-27b';

UPDATE tickets.provider_config
   SET model_id = 'gemma-4-12b', provider = 'llamacpp',
       base_url = 'http://127.0.0.1:18235', updated_at = now()
 WHERE enabled AND model_id = 'ternary-bonsai-27b';

-- 3) Tier 'opus' aus der Registry statt aus dem Skript.
-- scripts/factory/route-provider.sh hatte fuer tier=opus ein hardcodiertes
-- ternary-bonsai-27b, das die DB komplett umging. Das Skript liest jetzt hier;
-- fehlt die Zeile, bricht es mit einer Fehlermeldung ab, statt still ein Modell
-- zu behaupten, das es nicht mehr gibt. Diese Zeile ist also PFLICHT, nicht Kosmetik.
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled, brand)
SELECT '*', 'opus', 0, 'llamacpp', 'gemma-4-12b', 'http://127.0.0.1:18235', 3, true, '*'
 WHERE NOT EXISTS (
   SELECT 1 FROM tickets.provider_config
    WHERE source = '*' AND tier = 'opus' AND provider = 'llamacpp'
 );

COMMIT;
