-- 2026-08-19-factory-model-gemma12.sql
-- Loest gemma26-factory als Factory-Modell durch gemma12-vision ab [T012414].
--
-- WARUM: gemma12-vision liefert mit drei Slots und geteiltem KV mehr
-- Gesamtdurchsatz als das 26B und behaelt dabei den vollen Kontext je Slot.
-- Belegt in scripts/llm/measurements/2026-08-19-gemma12-slots.md und am realen
-- Pfad ueber den Proxy (drei gleichzeitige Anfragen in 2563 ms statt ~6339 ms
-- seriell, inflight-Spitze 3).
--
-- VORAUSSETZUNG, die vorher geprueft wurde statt angenommen: das 26B fuhr ein
-- eigenes Tool-Template (scripts/llm/templates/gemma4-26b-tools.jinja) plus
-- '--tools'. Fuer das 12B gibt es kein solches Template. Ohne Tool-Calls waere
-- die Ablösung wertlos — die Factory dispatcht Subagenten, die Dateien
-- schreiben und Kommandos ausfuehren. Der Loadout-Start des Proxy prueft das
-- selbst und meldete fuer gemma12-vision 'toolCallOk: true'; das eingebaute
-- Chat-Template des GGUF reicht also. Der '--tools'-Schalter von llama-server
-- wird nicht gebraucht: opencode bringt seine Werkzeuge ueber die API mit, und
-- llama.cpp kennt fuer die eingebauten weder Sandbox noch
-- Wurzelverzeichnis-Beschraenkung (siehe Kommentar in scripts/llm-proxy/loadouts.mjs).
--
-- WAS SICH NICHT AENDERT: base_url (:18235, der Proxy) und max_concurrent.
-- Cloud-Zeilen (https://) bleiben unberuehrt — sie sind kein lokales Routing.
--
-- Idempotent (Praedikat auf model_id). Reversibel: dieselbe UPDATE mit
-- vertauschten Werten.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-19-factory-model-gemma12.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-19-factory-model-gemma12.sql'
BEGIN;

-- Nur die LOKALEN Zeilen umbiegen. Das Praedikat auf model_id macht den
-- zweiten Lauf zum No-op und ueberschreibt keine spaetere, bewusste
-- Umstellung auf ein drittes Modell.
UPDATE tickets.provider_config
   SET model_id = 'gemma12-vision', updated_at = now()
 WHERE model_id = 'gemma26-factory'
   AND (base_url IS NULL OR base_url NOT LIKE 'https://%');

-- Ein etwaiger Phase-Pin in factory_model_slots ist Kandidat #0 vor
-- provider_config (route-provider.sh) und wuerde die Umstellung sonst
-- aushebeln. Die Tabelle ist auf beiden Brands derzeit leer; das UPDATE ist
-- die Absicherung fuer den Fall, dass jemand einen Pin gesetzt hat.
UPDATE tickets.factory_model_slots
   SET model_id = 'gemma12-vision', updated_at = now()
 WHERE model_id = 'gemma26-factory'
   AND (base_url IS NULL OR base_url NOT LIKE 'https://%');

COMMIT;

-- Nachpruefung (erwartet: keine lokale Zeile mehr auf gemma26-factory):
--   SELECT source, tier, model_id, base_url FROM tickets.provider_config
--    WHERE enabled AND (base_url IS NULL OR base_url NOT LIKE 'https://%')
--    ORDER BY tier, priority;
--
-- Danach:
--   bash scripts/llm/routing-check.sh     # muss schweigen
