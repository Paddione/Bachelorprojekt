-- Registriert den Qwen-3.8-Primary dauerhaft im LLM-Proxy [T013141].
--
-- loadouts.json und .opencode/agent-models.jsonc allein reichen nicht: Der Proxy
-- routet nur zu Backends aus tickets.llm_proxy_backends. Fehlt diese Zeile nach
-- einem frischen Setup, meldet OpenCode "no healthy backend" und eine Anfrage an
-- den alten Projekt-Default kann stattdessen das exklusive Gemma-Loadout starten.
--
-- Idempotent und fuer die gemeinsame lokale Ticket-Datenbank bestimmt.
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight)
VALUES
  ('llamacpp-qwen38', 'llamacpp', 'http://127.0.0.1:8094/v1', NULL, true, 1, '[]'::jsonb,
   '{"qwen38-220k":"qwen38-220k"}'::jsonb, 1)
ON CONFLICT (name) DO UPDATE
  SET kind          = EXCLUDED.kind,
      base_url      = EXCLUDED.base_url,
      enabled       = true,
      priority      = EXCLUDED.priority,
      fixups        = EXCLUDED.fixups,
      model_aliases = EXCLUDED.model_aliases,
      max_inflight  = EXCLUDED.max_inflight,
      updated_at    = now();

COMMIT;

-- Danach den Proxy die Registry neu lesen lassen:
--   curl -sf -XPOST http://127.0.0.1:18235/admin/reload
