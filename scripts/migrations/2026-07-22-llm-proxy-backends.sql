-- 2026-07-22-llm-proxy-backends.sql
-- Backend-Registry für den repo-verwalteten LLM-Proxy (Port 18235) + Drift-Korrektur der
-- provider_config/factory_model_slots-Zeilen, die den Fixup-Proxy umgehen (direkt :8093/:1234).
-- Idempotent (CREATE … IF NOT EXISTS, ON CONFLICT DO UPDATE). Reversibel: enabled=false setzen.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-llm-proxy-backends.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-llm-proxy-backends.sql'
BEGIN;

CREATE TABLE IF NOT EXISTS tickets.llm_proxy_backends (
  id            serial PRIMARY KEY,
  name          text UNIQUE NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('llamacpp','lmstudio','openai-remote')),
  base_url      text NOT NULL,
  api_key_env   text,
  enabled       boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 100,
  fixups        jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_aliases jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases)
VALUES
  ('llamacpp-bonsai', 'llamacpp',      'http://127.0.0.1:8093/v1',   NULL,               true,  1,  '["bonsai-system-role-fixup"]'::jsonb, '{}'::jsonb),
  ('lmstudio',        'lmstudio',      'http://127.0.0.1:1234/v1',   NULL,               true,  2,  '[]'::jsonb,                           '{}'::jsonb),
  ('deepseek',        'openai-remote', 'https://api.deepseek.com/v1',   'DEEPSEEK_API_KEY', true,  90, '[]'::jsonb,                           '{}'::jsonb),
  ('opencode-zen',    'openai-remote', 'http://127.0.0.1:5099/v1',    'OPENCODE_API_KEY', true,  91, '[]'::jsonb,                           '{}'::jsonb)
ON CONFLICT (name) DO UPDATE
  SET kind          = EXCLUDED.kind,
      base_url      = EXCLUDED.base_url,
      api_key_env   = EXCLUDED.api_key_env,
      priority      = EXCLUDED.priority,
      fixups        = EXCLUDED.fixups,
      updated_at    = now();

-- Drift-Korrektur: enabled-Zeilen, die einen lokalen Backend-Port direkt ansprechen und damit
-- den Fixup-Proxy umgehen, auf den Proxy-Port 18235 biegen. Remote-URLs bleiben unberührt.
UPDATE tickets.provider_config
   SET base_url = 'http://127.0.0.1:18235', updated_at = now()
 WHERE enabled AND base_url LIKE 'http://127.0.0.1:%'
   AND base_url <> 'http://127.0.0.1:18235';

UPDATE tickets.factory_model_slots
   SET base_url = 'http://127.0.0.1:18235'
 WHERE base_url LIKE 'http://127.0.0.1:%'
   AND base_url <> 'http://127.0.0.1:18235';

COMMIT;
