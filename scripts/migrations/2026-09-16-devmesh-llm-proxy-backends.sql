-- 2026-09-16-devmesh-llm-proxy-backends.sql
-- Backend-Registry des llm-proxys in der devmesh-shared-db [T900191, design.md D3].
-- Schema identisch zu fleet: 2026-07-22-llm-proxy-backends.sql,
-- 2026-07-23-llm-proxy-max-inflight.sql, 2026-08-29-bge-role-registry.sql.
-- Keine Loopback-URL: im Pod erreicht die Loopback-Adresse weder den Arbeitsplatz noch Cluster-Dienste.
--   Windows-GPU  -> llm-gateway-host:<port> (Ports aus devmesh/inventory.yaml gpu_endpoint.ports)
--   bge          -> Cluster-DNS der Services aus k3d/llm-gpu.yaml
-- Nicht geseedet: pk-tablet-rerank (Tablet, Tailnet-ACL erlaubt nur gpu-host),
--   bge-rerank-cpu (zeigte auf den Proxy selbst, Loadout-Mechanik entfernt),
--   opencode-zen (lokaler Port 5099 ist kein GPU-Dienst und kein Repo-Prozess; die ACL oeffnet nur GPU-Ports).
-- Idempotent. Anwenden: task devmesh:registry:migrate
BEGIN;

CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website;

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
ALTER TABLE tickets.llm_proxy_backends
  ADD COLUMN IF NOT EXISTS max_inflight integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS loadout_slug text;
ALTER TABLE tickets.llm_proxy_backends OWNER TO website;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight, roles, loadout_slug)
VALUES
  ('glimmer',          'llamacpp',      'http://llm-gateway-host:1919/v1', NULL, true, 1,  '[]'::jsonb, '{"glimmer": "Muse-Glimmer-30B"}'::jsonb, 1, '[]'::jsonb, NULL),
  ('llamacpp-gemma12', 'llamacpp',      'http://llm-gateway-host:8089/v1', NULL, true, 1,  '[]'::jsonb, '{"gemma12-vision": "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"}'::jsonb, 3, '[]'::jsonb, NULL),
  ('llamacpp-gemma4',  'llamacpp',      'http://llm-gateway-host:8090/v1', NULL, true, 1,  '[]'::jsonb, '{}'::jsonb, 1, '[]'::jsonb, NULL),
  ('llamacpp-qwen38',  'llamacpp',      'http://llm-gateway-host:8094/v1', NULL, true, 1,  '[]'::jsonb, '{"qwen38-220k": "qwen38-220k"}'::jsonb, 1, '[]'::jsonb, NULL),
  ('cluster-embed',    'llamacpp',      'http://llm-gateway-embed.workspace.svc.cluster.local:8081',  NULL, true, 10, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb,  NULL),
  ('cluster-rerank',   'llamacpp',      'http://llm-gateway-rerank.workspace.svc.cluster.local:8081', NULL, true, 10, '[]'::jsonb, '{}'::jsonb, 1, '["rerank"]'::jsonb, NULL),
  ('lmstudio',         'lmstudio',      'http://llm-gateway-host:1234/v1', NULL, true, 20, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb, NULL),
  ('deepseek',         'openai-remote', 'https://api.deepseek.com/v1', 'DEEPSEEK_API_KEY', true, 90, '[]'::jsonb, '{}'::jsonb, 1, '[]'::jsonb, NULL)
ON CONFLICT (name) DO UPDATE
  SET kind          = EXCLUDED.kind,
      base_url      = EXCLUDED.base_url,
      api_key_env   = EXCLUDED.api_key_env,
      enabled       = EXCLUDED.enabled,
      priority      = EXCLUDED.priority,
      model_aliases = EXCLUDED.model_aliases,
      max_inflight  = EXCLUDED.max_inflight,
      roles         = EXCLUDED.roles,
      loadout_slug  = EXCLUDED.loadout_slug,
      updated_at    = now();

-- Altbestand aus migrate-from-k3d (fleet-Zeilen mit Loopback-Zielen): alles abschalten,
-- was dieser Seed nicht fuehrt.
UPDATE tickets.llm_proxy_backends
   SET enabled = false, updated_at = now()
 WHERE enabled
   AND name NOT IN ('glimmer','llamacpp-gemma12','llamacpp-gemma4','llamacpp-qwen38',
                    'cluster-embed','cluster-rerank','lmstudio','deepseek');

COMMIT;