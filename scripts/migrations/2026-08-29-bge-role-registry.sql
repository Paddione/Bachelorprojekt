-- 2026-08-29-bge-role-registry.sql
-- Erweitert die Backend-Registry (tickets.llm_proxy_backends) um Rollen und
-- optionale Loadout-Slugs fuer die bge-Routen des llm-proxys [T900006].
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, ON CONFLICT DO UPDATE).
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-29-bge-role-registry.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-29-bge-role-registry.sql'
BEGIN;

ALTER TABLE tickets.llm_proxy_backends
  ADD COLUMN IF NOT EXISTS roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS loadout_slug text;

-- Bestandszeilen seeden: Reihenfolge Desktop -> Cluster -> Geraete
-- tei-desktop wird mit enabled=false geseedet (aktivierbar nach Aequivalenz-Gate)
INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight, roles, loadout_slug)
VALUES
  ('tei-desktop',      'llamacpp', 'http://127.0.0.1:8085',      NULL, false, 1,  '[]'::jsonb, '{}'::jsonb, 1, '["embed","rerank"]'::jsonb, NULL),
  ('cluster-embed',    'llamacpp', 'http://127.0.0.1:8081',      NULL, true,  10, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb,          NULL),
  ('cluster-rerank',   'llamacpp', 'http://127.0.0.1:8093',      NULL, true,  10, '[]'::jsonb, '{}'::jsonb, 1, '["rerank"]'::jsonb,         NULL),
  ('lmstudio',         'lmstudio', 'http://127.0.0.1:1234/v1',   NULL, true,  20, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb,          NULL),
  ('pk-tablet-rerank', 'llamacpp', 'http://192.168.100.12:8080', NULL, true,  20, '[]'::jsonb, '{}'::jsonb, 1, '["rerank"]'::jsonb,         NULL),
  ('bge-rerank-cpu',   'llamacpp', 'http://127.0.0.1:18235',     NULL, true,  30, '[]'::jsonb, '{}'::jsonb, 1, '["rerank"]'::jsonb,         'bge-rerank-cpu')
ON CONFLICT (name) DO UPDATE
  SET roles        = EXCLUDED.roles,
      loadout_slug = EXCLUDED.loadout_slug,
      priority     = EXCLUDED.priority,
      updated_at   = now();

COMMIT;