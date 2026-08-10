-- 2026-08-10-disable-gptoss-devstral.sql
-- Schaltet die Proxy-Backends zu den beiden abgeschalteten GPU-Loadouts aus (T003204).
--
-- Gegenstueck zu "enabled": false in scripts/llm/loadouts.json. Beide Orte muessen
-- zusammenpassen: loadouts.json verhindert, dass der Proxy die Units STARTET; diese
-- Registry-Zeile verhindert, dass er Anfragen dorthin ROUTET. Ohne den zweiten Teil
-- bliebe das Backend in der Auswahl und lieferte Verbindungsfehler statt einer
-- sauberen Umleitung auf ein aktives Loadout.
--
--   llamacpp-gptoss   -> :8098  = Loadout gptoss-context   (Operator-Entscheidung)
--   llamacpp-devstral -> :8099  = Loadout devstral-quality (in allen Dimensionen dominiert)
--
-- NICHT betroffen: das Loadout brain-ingest auf :8100. Es faehrt dieselbe Modelldatei
-- wie gptoss-context (gptoss20/gpt-oss-20b-UD-Q4_K_XL.gguf) und ist deshalb leicht zu
-- verwechseln — es hat aber gar keinen Eintrag in dieser Registry und bleibt aktiv.
--
-- Idempotent: UPDATE … WHERE name IN (…). Ein zweiter Lauf ist unschaedlich, und ein
-- UPDATE auf null Zeilen ist KEIN Fehler und darf keiner sein — die Migration prueft
-- deshalb bewusst nicht, ob die Zeilen existieren.
--
-- Reversibel: dieselbe Anweisung mit enabled = true.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-disable-gptoss-devstral.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-disable-gptoss-devstral.sql'
BEGIN;

UPDATE tickets.llm_proxy_backends
   SET enabled    = false,
       updated_at = now()
 WHERE name IN ('llamacpp-gptoss', 'llamacpp-devstral');

COMMIT;
