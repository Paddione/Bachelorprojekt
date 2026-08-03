-- 2026-08-03-retire-stale-model-ids.sql
-- Raeumt Modell-Bezeichner auf, die auf nicht mehr vorhandene lokale Modelle zeigen.
--
-- BEFUND (gemessen am 2026-08-03):
-- Von den acht Loadouts in scripts/llm/loadouts.json existieren die GGUF-Dateien nur noch
-- fuer vier: gptoss-context (8098), devstral-quality (8099), bge-embed-cpu, bge-rerank-cpu.
-- Die vier Gemma-Loadouts (gemma-factory, gemma-multiagent, gemma26-factory auf Port 8091,
-- gemma9-factory auf 8092) zeigen auf Dateien, die auf diesem Host nicht mehr liegen.
--
-- Der Bezeichner 'gemma26-factory' war trotzdem noch ueberall eingetragen: in allen drei
-- Phasen von factory_model_slots und in elf aktiven provider_config-Zeilen quer durch alle
-- Tiers. Der gesamte lokale Modellpfad der Factory zeigte damit auf ein Modell, das nicht
-- geladen werden kann — der llm-proxy faellt in diesem Fall auf die Remote-Kette zurueck,
-- die lokale Stufe war also faktisch tot, ohne dass es auffiel.
--
-- Zweiter Drift: tier 'cheap' und 'flash' standen auf 'deepseek-chat' (V3), waehrend 'haiku'
-- und 'sonnet' bereits auf deepseek-v4-flash/-v4-pro zeigten. deepseek-chat antwortet zwar
-- weiterhin (gegengeprueft), ist aber aus GET /models verschwunden und hat 128K statt 1M
-- Kontext. Vereinheitlicht auf V4.
--
-- Nicht angefasst: die Provider-Spalte der lmstudio-Zeilen. Sie zeigt seit der
-- Drift-Korrektur vom 2026-07-22 korrekt auf den llm-proxy (:18235); nur der Provider-Name
-- ist historisch. Das ist eine Benennungsfrage, keine Fehlfunktion — und ein Umbenennen
-- haette Auswirkungen auf die Routing-Logik, die hier nicht mitgeprueft werden koennen.
--
-- Idempotent (WHERE-gefiltert auf die alten Werte). Reversibel: Werte zurueckschreiben.
--
-- Apply:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-03-retire-stale-model-ids.sql'
--
-- HINWEIS zu korczewski: Das shared-db-Deployment in workspace-korczewski steht auf 0/0
-- (bewusst heruntergefahren, 65d alt). Diese Migration kann dort nicht laufen und muss
-- nachgezogen werden, falls die Marke je wieder hochgefahren wird.
BEGIN;

-- 1) factory_model_slots: alle Phasen auf das real vorhandene Modell
UPDATE tickets.factory_model_slots
   SET model_id = 'gptoss-context', updated_at = now()
 WHERE model_id = 'gemma26-factory';

-- 2) provider_config: derselbe Bezeichner quer durch alle Tiers
UPDATE tickets.provider_config
   SET model_id = 'gptoss-context', updated_at = now()
 WHERE model_id = 'gemma26-factory';

-- 3) provider_config: DeepSeek auf V4 vereinheitlichen (1M statt 128K Kontext)
UPDATE tickets.provider_config
   SET model_id = 'deepseek-v4-flash', updated_at = now()
 WHERE model_id = 'deepseek-chat';

-- 4) llm_proxy_backends: die Backends der fehlenden Gemma-Loadouts stilllegen.
--    Nicht loeschen — enabled=false ist reversibel und haelt die Historie fest.
--    Sobald ein Gemma-GGUF wieder vorliegt, genuegt enabled=true.
UPDATE tickets.llm_proxy_backends
   SET enabled = false, updated_at = now()
 WHERE name IN ('llamacpp-gemma', 'llamacpp-gemma9')
   AND enabled;

COMMIT;
