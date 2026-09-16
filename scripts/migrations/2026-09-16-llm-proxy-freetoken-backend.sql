-- 2026-09-16-llm-proxy-freetoken-backend.sql
-- Traegt das windows-native FreeToken-Backend in die Proxy-Registry ein (T900189).
--
-- Kehrt die Backend-Seite von T900163 um. Neu ist der Weg, nicht nur die Engine:
-- frueher zeigte der OpenCode-Provider DIREKT auf :1919 und lief damit am
-- mitschneidenden Proxy vorbei -- tickets.llm_proxy_request_log enthielt deshalb
-- keine einzige FreeToken-Zeile (Beobachtungsluecke, docs/runbooks/freetoken-native.md).
-- Jetzt laeuft der Verkehr ueber :18235 und wird protokolliert.
--
-- kind='freetoken' ist NICHT kosmetisch: discovery.mjs fuehrt eine Positivliste
-- lokaler Backend-Arten, und ein unbekanntes kind gilt dort als nicht-lokal.
-- Als 'openai-remote' eingetragen wuerde ein Request mit `x-llm-local-only: 1`
-- mit no_local_backend scheitern, obwohl die Engine auf demselben Host laeuft.
--
-- max_inflight=1 ist die Engine-Eigenschaft, keine Vorsichtsmassnahme:
-- ft serve laeuft mit --max-running-requests 1, weitere Requests warten in der
-- Proxy-Queue statt im Engine-Speicher.
--
-- llamacpp-qwen38 (:8094) bleibt als deaktivierte Zeile stehen, nicht geloescht:
-- FreeToken 0.1.2 ist eine Beta auf einer einzelnen 16-GB-Karte, und der Rueckweg
-- soll ein UPDATE sein. Die Zeile war ausserdem enabled, obwohl der Port tot ist
-- -- der Proxy routete ins Leere.
--
-- Idempotent: INSERT ... ON CONFLICT (name) DO UPDATE.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-09-16-llm-proxy-freetoken-backend.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-09-16-llm-proxy-freetoken-backend.sql'
BEGIN;

-- Der CHECK-Constraint ist der eigentliche Enum der Spalte (die Spalte selbst ist
-- text). Ohne diese Erweiterung scheitert das INSERT unten mit
-- llm_proxy_backends_kind_check -- gemessen 2026-09-16.
ALTER TABLE tickets.llm_proxy_backends
  DROP CONSTRAINT IF EXISTS llm_proxy_backends_kind_check;
ALTER TABLE tickets.llm_proxy_backends
  ADD CONSTRAINT llm_proxy_backends_kind_check
  CHECK (kind = ANY (ARRAY['llamacpp'::text, 'lmstudio'::text, 'openai-remote'::text, 'freetoken'::text]));

INSERT INTO tickets.llm_proxy_backends
       (name, kind, base_url, enabled, priority, fixups, model_aliases, max_inflight, roles)
VALUES ('freetoken-local', 'freetoken', 'http://127.0.0.1:1919/v1', true, 0,
        '["freetoken-thinking"]'::jsonb, '{}'::jsonb, 1, '[]'::jsonb)
ON CONFLICT (name) DO UPDATE
   SET kind         = EXCLUDED.kind,
       base_url     = EXCLUDED.base_url,
       enabled      = EXCLUDED.enabled,
       priority     = EXCLUDED.priority,
       fixups       = EXCLUDED.fixups,
       max_inflight = EXCLUDED.max_inflight,
       updated_at   = now();

UPDATE tickets.llm_proxy_backends
   SET enabled    = false,
       updated_at = now()
 WHERE name = 'llamacpp-qwen38';

COMMIT;
