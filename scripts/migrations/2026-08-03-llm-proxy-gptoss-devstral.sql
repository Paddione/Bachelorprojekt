-- 2026-08-03-llm-proxy-gptoss-devstral.sql
-- Registriert die beiden neu beschafften Chat-Loadouts als llm-proxy-Backends.
--
-- Hintergrund: Alle sechs Chat-Loadouts in scripts/llm/loadouts.json zeigten auf GGUF-Dateien,
-- die auf diesem Host nicht (mehr) existierten. Nachgeladen wurden gpt-oss-20b-Q8_0 (12,11 GB,
-- Loadout gptoss-context, Port 8098) und Devstral-Small-2-24B-Instruct-2512-IQ4_XS (12,78 GB,
-- Loadout devstral-quality, Port 8099). Die Backend-Registry kannte bisher nur die Gemma-Ports
-- 8091/8092, deren Gewichte weiterhin fehlen — der Proxy konnte die neuen Modelle daher nicht
-- routen, obwohl llama-server sie bereits bediente.
--
-- Priorität 1 wie die bestehenden llamacpp-Backends: lokale Modelle vor deepseek (2) und
-- opencode-zen (91). Alle vier Chat-Loadouts teilen sich exclusiveGroup "chat-gpu" — auf einer
-- 16-GB-Karte läuft ohnehin immer nur eines; die Priorität entscheidet nur die Probe-Reihenfolge.
--
-- model_aliases bleibt leer: llama-server meldet sich unter dem Loadout-Alias (gptoss-context
-- bzw. devstral-quality), der Proxy übernimmt diesen Namen direkt. Ein Alias-Mapping wäre nur
-- nötig, um einen abweichenden Namen nach außen zu tragen (so wie bei llamacpp-gemma).
--
-- Idempotent (ON CONFLICT DO UPDATE). Reversibel: enabled=false setzen.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-03-llm-proxy-gptoss-devstral.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-03-llm-proxy-gptoss-devstral.sql'
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases)
VALUES
  ('llamacpp-gptoss',   'llamacpp', 'http://127.0.0.1:8098/v1', NULL, true, 1, '[]'::jsonb, '{}'::jsonb),
  ('llamacpp-devstral', 'llamacpp', 'http://127.0.0.1:8099/v1', NULL, true, 1, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (name) DO UPDATE
  SET kind        = EXCLUDED.kind,
      base_url    = EXCLUDED.base_url,
      api_key_env = EXCLUDED.api_key_env,
      enabled     = EXCLUDED.enabled,
      priority    = EXCLUDED.priority,
      fixups      = EXCLUDED.fixups,
      updated_at  = now();

COMMIT;
