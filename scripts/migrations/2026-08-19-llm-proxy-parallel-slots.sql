-- 2026-08-19-llm-proxy-parallel-slots.sql
-- Echte Parallelitaet auf dem lokalen GPU-Backend [T012414].
--
-- ZWEI GETRENNTE BEFUNDE, die zusammen dafuer sorgten, dass mehrere Slots nichts
-- brachten:
--
-- 1) llamacpp-gemma (:8091) stand auf max_inflight = 1, obwohl der Server dort
--    laengst mit '-np 3' laeuft. Der Proxy serialisiert pro Backend in einem
--    Semaphor (scripts/llm-proxy/slot-queue.mjs); zwei der drei llama.cpp-Slots
--    lagen dauerhaft brach. Die Serialisierung war 2026-07-23 als konservativer
--    Default eingezogen worden ("byte-identisch zur bisherigen Promise-Kette"),
--    nicht als Aussage ueber die Kapazitaet.
--
-- 2) Fuer gemma12-vision (:8089) gab es ueberhaupt KEINE Backend-Zeile, obwohl
--    .opencode/agent-models.jsonc sowohl einen Subagenten 'gemma12' als auch
--    einen Primary 'gemma12-primary' auf llamacpp-local/gemma12-vision zeigen
--    laesst. Beide liefen damit ins Leere: resolveModel() faellt zwar auf ein
--    beliebiges gesundes Backend zurueck, aber ein Modell, das kein Backend
--    fuehrt, erreicht seinen Server nie.
--
-- MESSGRUNDLAGE fuer max_inflight = 3, nicht geraten:
--   scripts/llm/measurements/2026-08-19-gemma12-slots.md
--   gemma12 mit '-np 3 -kvu': 307-489 tok/s gesamt gegen 255 bei einem Slot,
--   MTP-Annahme 92-95 %, Kontext bleibt bei 262144 je Slot (n_ctx_slot).
--   '-np 4' ist SCHLECHTER als 3 (319 tok/s), '-np 6' laedt gar nicht erst.
--   Deshalb genau 3 — mehr ist nachweislich kein Gewinn.
--
-- Die max_tokens-Deckelung (Kontext-Budget in server.mjs) bleibt unveraendert;
-- sie haengt am Modellkontext, nicht am Semaphor.
--
-- Idempotent (ON CONFLICT DO UPDATE, gezielte UPDATE-Praedikate).
-- Reversibel: max_inflight zurueck auf 1 setzen, llamacpp-gemma12 auf
-- enabled = false.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql'
BEGIN;

-- 1) Das 26B-Backend darf drei gleichzeitige Anfragen fuehren. Der Server dort
--    laeuft bereits mit '-np 3 -kvu'; geaendert wird nur der Proxy-Semaphor.
UPDATE tickets.llm_proxy_backends
   SET max_inflight = 3, updated_at = now()
 WHERE name = 'llamacpp-gemma' AND max_inflight < 3;

-- 2) gemma12-vision bekommt eine eigene Backend-Zeile auf :8089.
--
--    Gleiche Prioritaet wie llamacpp-gemma ist beabsichtigt und ungefaehrlich:
--    beide Loadouts liegen in exclusiveGroup 'chat-gpu', es laeuft also immer
--    hoechstens eines. Das jeweils andere Backend meldet sich als unhealthy und
--    wird von der Discovery uebersprungen.
--
--    Der Alias entkoppelt den angefragten Namen vom GGUF-Dateinamen, den
--    llama.cpp unter /v1/models meldet — sonst muesste jede Client-Config den
--    Dateinamen fuehren und bei jedem Quant-Wechsel nachgezogen werden.
INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight)
VALUES
  ('llamacpp-gemma12', 'llamacpp', 'http://127.0.0.1:8089/v1', NULL, true, 1, '[]'::jsonb,
   '{"gemma12-vision":"gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"}'::jsonb, 3)
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

-- Nachpruefung (erwartet: beide Zeilen enabled=t mit max_inflight=3):
--   SELECT name, base_url, enabled, priority, max_inflight
--     FROM tickets.llm_proxy_backends
--    WHERE name IN ('llamacpp-gemma','llamacpp-gemma12');
--
-- Danach den Proxy die Registry neu lesen lassen:
--   curl -sf -XPOST http://127.0.0.1:18235/admin/reload
