-- 2026-08-10-brain-ingest-port.sql
-- Zieht die base_url des Backends llamacpp-bonsai von Port 8093 auf 8100.
--
-- Hintergrund: 8093 wurde von zwei Subsystemen beansprucht. Historisch war es der
-- "Bonsai"-llama-server auf dem Windows-GPU-Host; seit T002551 legt
-- scripts/bge-mcp/bge-forward-rerank.service dort den kubectl-Forward auf
-- svc/llm-gateway-rerank. Folge: scripts/brain-ingest.sh schickte Chat-Completions an
-- einen Reranker und bekam HTTP 500 "the current context does not logits computation".
-- Derselbe Fehler traf schon einmal einen Factory-Provider — siehe den Kommentar in
-- scripts/factory/provider-register-local.sh:7-8.
--
-- 8100 und nicht 8097: auf 8097 registriert scripts/factory/provider-register-gptoss.sh
-- einen Provider. Der Block 8089-8099 ist bis auf 8097 durch Loadouts belegt.
--
-- enabled BLEIBT false. Der llm-proxy meldet bereits dauerhaft ready=false, weil sechs
-- priority=1-Backends derselben exclusiveGroup nie gleichzeitig healthy sein koennen
-- (T003202). Ein weiteres dauer-degradiertes Backend wuerde das Signal nur zusaetzlich
-- verwaessern. brain-ingest.sh spricht den Port ohnehin direkt an und braucht den Proxy
-- nicht. Aktivieren ist eine eigene Entscheidung, sobald T003202 geklaert ist.
--
-- Idempotent (ON CONFLICT DO UPDATE). Reversibel: base_url zurueck auf 8093 setzen.
--
-- Apply (beide Brands — mentolder und korczewski haben getrennte Datenbanken):
--   BRAND=mentolder   bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-brain-ingest-port.sql'
--   BRAND=korczewski  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-brain-ingest-port.sql'
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases)
VALUES
  ('llamacpp-bonsai', 'llamacpp', 'http://127.0.0.1:8100/v1', NULL, false, 1, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (name) DO UPDATE
  SET kind        = EXCLUDED.kind,
      base_url    = EXCLUDED.base_url,
      api_key_env = EXCLUDED.api_key_env,
      enabled     = EXCLUDED.enabled,
      priority    = EXCLUDED.priority,
      fixups      = EXCLUDED.fixups,
      updated_at  = now();

COMMIT;
