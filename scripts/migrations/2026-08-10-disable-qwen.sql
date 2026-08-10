-- 2026-08-10-disable-qwen.sql
-- Schaltet das Proxy-Backend zum abgeschalteten GPU-Loadout qwen3-coder-30b aus (T003204).
--
-- Gegenstueck zu "enabled": false in scripts/llm/loadouts.json. Beide Orte muessen
-- zusammenpassen: loadouts.json verhindert, dass der Proxy die Unit STARTET; diese
-- Registry-Zeile verhindert, dass er Anfragen dorthin ROUTET. Ohne den zweiten Teil
-- bliebe das Backend in der Auswahl und lieferte Verbindungsfehler statt einer
-- sauberen Umleitung auf ein aktives Loadout.
--
--   llamacpp-qwen -> :8094 = Loadout qwen3-coder-30b (T003204: gleicher VRAM wie
--   gemma26-factory bei aggressiverer Quantisierung UD-IQ3_XXS, weniger Kontext
--   96.000 vs 161.024, gemessen nur 47,9 tok/s unter Konkurrenz, einziger Anspruch
--   'agentische Tiefe' ohne Messung -> bleibt inaktiv, wird NICHT reaktiviert)
--
-- Idempotent: UPDATE … WHERE name = 'llamacpp-qwen'. Ein zweiter Lauf ist
-- unschaedlich, und ein UPDATE auf null Zeilen ist KEIN Fehler.
--
-- Reversibel: dieselbe Anweisung mit enabled = true.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-disable-qwen.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-disable-qwen.sql'
BEGIN;

UPDATE tickets.llm_proxy_backends
   SET enabled    = false,
       updated_at = now()
 WHERE name = 'llamacpp-qwen';

COMMIT;
