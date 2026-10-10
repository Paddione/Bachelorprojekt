-- 2026-10-10-llm-proxy-tei-desktop-embed.sql
-- Aktiviert tei-desktop (127.0.0.1:8085, lokales llama.cpp bge-m3-Q8_0)
-- als Embed-Erstglied der Registry-Kette.
--
-- User-Entscheidung 2026-10-10: lokales llama.cpp statt LM Studio / Cluster
-- (PK-L-1 und gpu-metal derzeit nicht erreichbar).
-- Aequivalenz-Gate bestanden: Kosinus ~0.9998 gegen gespeicherte
-- Corpus-Vektoren (Cluster-Build b10223, CPU) auf 3 Stichproben.
-- Rollen auf ["embed"] verengt: der Server faehrt --embeddings ohne --reranking.
--
-- Idempotent (ON CONFLICT DO UPDATE).
--
-- Apply (fleet shared-db, vom WSL-Desktop):
--   kubectl --context fleet -n workspace exec -i deploy/shared-db -c postgres -- \
--     psql -U website -d website -v ON_ERROR_STOP=1 -q < scripts/migrations/2026-10-10-llm-proxy-tei-desktop-embed.sql
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight, roles, loadout_slug)
VALUES
  ('tei-desktop', 'llamacpp', 'http://127.0.0.1:8085', NULL, true, 1, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb, NULL)
ON CONFLICT (name) DO UPDATE
  SET enabled    = true,
      roles      = EXCLUDED.roles,
      priority   = EXCLUDED.priority,
      updated_at = now();

COMMIT;
