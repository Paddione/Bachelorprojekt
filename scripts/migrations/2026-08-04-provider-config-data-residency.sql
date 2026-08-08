-- T002657 — Datenresidenz als ausgesprochene Zusage, nicht als Annahme.
--
-- Coaching-Inhalte duerfen nur an Provider gehen, die sich als on-premises
-- deklarieren. Am 2026-08-04 zeigten 13 von 18 coaching.sessions auf
-- ki_config_id=82 (provider='deepseek', api.deepseek.com, Key gesetzt) —
-- die erste echte Session waere dorthin gegangen, waehrend das Projekt
-- "All data stays on-premises (DSGVO by design)" als Kernaussage fuehrt.
--
-- Warum eine neue Spalte und nicht eu_endpoint: eu_endpoint beschreibt den
-- RECHTSRAUM eines fremden Betreibers, nicht die BETREIBERSCHAFT. Ein
-- EU-gehosteter Fremdanbieter ist weiterhin ein Fremdanbieter. Die Spalte
-- bleibt unangetastet, sie wird fuer die Rechtsraum-Frage weiter gebraucht.
--
-- Der DEFAULT traegt die Absicht: Bestandszeilen werden 'external'. Wer
-- on-premises sein will, muss es aussprechen. Eine fehlende Deklaration ist
-- damit keine stillschweigende Zusage — ein vergessener Eintrag fuehrt zum
-- Fehlschlag, nicht zur Uebertragung.

BEGIN;

ALTER TABLE tickets.provider_config
  ADD COLUMN IF NOT EXISTS data_residency text NOT NULL DEFAULT 'external';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tickets.provider_config'::regclass
       AND conname  = 'provider_config_data_residency_check'
  ) THEN
    ALTER TABLE tickets.provider_config
      ADD CONSTRAINT provider_config_data_residency_check
      CHECK (data_residency IN ('on_premises','external'));
  END IF;
END $$;

-- Freigegeben werden die lokalen llm-proxy-Zugaenge. Ohne sie waere Coaching
-- nach dem Guard gar nicht mehr nutzbar.
--
-- ABWEICHUNG VOM PLAN, bewusst und gemessen (2026-08-08): der Plan nannte
-- 'local-cluster'. Diese Zeilen stehen jedoch auf enabled=false, und
-- getProviderByName filtert auf enabled=true — die Freigabe waere wirkungslos
-- geblieben und Coaching haette nach dem Guard KEINEN nutzbaren Provider mehr
-- gehabt. Tatsaechlich aktiv sind 'llamacpp' und 'lmstudio' auf
-- 127.0.0.1:18235, dem llm-proxy.
--
-- Dieselben zwei Arten fuehrt scripts/llm-proxy/discovery.mjs als
-- LOCAL_BACKEND_KINDS. Die Definition von "lokal" steht damit an beiden Enden
-- des Wegs auf derselben Grundlage statt auf zwei gepflegten Namenslisten.
--
-- Die DeepSeek-Zeilen werden NICHT umgewidmet — ihr Fehlschlag ist der
-- sichtbare Beleg, dass der Guard greift.
UPDATE tickets.provider_config
   SET data_residency = 'on_premises'
 WHERE provider IN ('llamacpp','lmstudio');

COMMIT;
