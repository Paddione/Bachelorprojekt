-- 2026-08-04-llm-proxy-gemma-qwen-families.sql
-- Registriert die beiden neu verfuegbaren Chat-Familien als llm-proxy-Backends.
--
-- Hintergrund: Seit der Retire-Migration (2026-08-03-retire-stale-model-ids.sql)
-- waren die einzigen Chat-Loadouts mit Gewichten gptoss-context (8098) und
-- devstral-quality (8099). Inzwischen liegen wieder zwei GGUFs auf der Platte:
--   gemma4-base/gemma-4-12b-it-Q4_K_M.gguf        (7,1 GB, Loadout gemma4, Port 8090)
--   qwen3coder30/Qwen3-Coder-30B-A3B-...-Q4_K_XL.gguf (17,6 GB, Loadout qwen3-coder-30b, Port 8094)
-- Damit koennen die opencode-Subagenten nach Familienname dispatchbar sein
-- (gemma, qwen, gptoss, devstral). Ohne Backend-Zeilen routet der Proxy diese
-- Modell-IDs nicht (unknown_model).
--
-- Prioritaet 1 wie die bestehenden llamacpp-Backends. model_aliases bleibt leer:
-- llama-server meldet sich unter dem Loadout-Alias (gemma4 bzw.
-- qwen3-coder-30b), der Proxy uebernimmt diesen Namen direkt.
--
-- Idempotent (ON CONFLICT DO UPDATE). Reversibel: enabled=false setzen.
--
-- Apply:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-04-llm-proxy-gemma-qwen-families.sql'
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases)
VALUES
  ('llamacpp-gemma4', 'llamacpp', 'http://127.0.0.1:8090/v1', NULL, true, 1, '[]'::jsonb, '{}'::jsonb),
  ('llamacpp-qwen',   'llamacpp', 'http://127.0.0.1:8094/v1', NULL, true, 1, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (name) DO UPDATE
  SET kind        = EXCLUDED.kind,
      base_url    = EXCLUDED.base_url,
      api_key_env = EXCLUDED.api_key_env,
      enabled     = EXCLUDED.enabled,
      priority    = EXCLUDED.priority,
      fixups      = EXCLUDED.fixups,
      updated_at  = now();

COMMIT;
