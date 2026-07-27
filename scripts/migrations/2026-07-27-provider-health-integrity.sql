-- 2026-07-27-provider-health-integrity.sql
-- Datenintegritaet fuer tickets.provider_health [T002281].
--
-- DREI DINGE:
--  1. claimed_at als Grundlage des TTL-Reapers (scripts/factory/reap-provider-slots.sh).
--  2. Bereinigung geleakter Zaehler und korrupter provider-Werte.
--  3. CHECK, der die korrupte Klasse zuhaelt.
--
-- WARUM DIE ZAEHLER LEAKEN: route-provider.sh claimt atomar (active_agents + 1) und
-- liefert slotId; freigegeben wird ueber scripts/factory/release-slot.sh. Dieses Skript
-- wird von KEINEM Produktionscode gerufen, nur von Tests. Was nach Freigabe aussieht
-- (ticket.sh release-slot --id …) ist ein gleichnamiges, anderes Kommando fuer den
-- Ticket-Pipeline-Slot. Von den zwei echten Router-Aufrufern gibt nur
-- scout-llm-fallback.sh frei; auto-triage.sh las slotId nicht einmal aus. Gemessen
-- 2026-07-27: deepseek=3 (= max_concurrent, damit als Fallback dauerhaft tot),
-- lmstudio=8, ternary-bonsai-27b=3.
--
-- WARUM DIE PROVIDER-WERTE KORRUPT SIND: zwei Zeilen tragen eine ganze Ergebniszeile als
-- Namen, z. B. 'anthropic\tclaude-sonnet-4-6\t\t3'. Sie enthalten LITERALE \t-Sequenzen
-- (keine echten Tabs - sonst zeigte psql Leerraum) und haben VIER Felder, waehrend die
-- heutige Kandidaten-Query SECHS liefert (seit T001590). Also Altlast einer abgeloesten
-- Codeversion. Mit active_agents=0 folgenlos, aber der CHECK haelt die Klasse zu -
-- unabhaengig davon, welcher Schreibpfad sie erzeugt hat.
--
-- Idempotent (IF NOT EXISTS, pg_constraint-Guard, praedikatgebundene UPDATEs).
-- Reversibel: DROP CONSTRAINT provider_health_provider_clean, DROP COLUMN claimed_at.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-27-provider-health-integrity.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-27-provider-health-integrity.sql'
BEGIN;

-- 1) claimed_at: Zeitstempel des aktiven Claims. NULL = kein aktiver Claim.
ALTER TABLE tickets.provider_health
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN tickets.provider_health.claimed_at IS
  'Zeitpunkt des juengsten Slot-Claims durch route-provider.sh. NULL = kein aktiver Claim. Grundlage des TTL-Reapers (scripts/factory/reap-provider-slots.sh); ohne ihn bleibt ein vergessener Release unbemerkt, bis der Provider auf max_concurrent steht.';

-- 2a) Korrupte Zeilen entfernen. Das Praedikat trifft Backslash, Tab und jeden
-- Whitespace - ein legitimer Provider-Name enthaelt nichts davon.
DELETE FROM tickets.provider_health
 WHERE provider ~ '[\\[:space:]]';

-- 2b) Geleakte Zaehler zuruecksetzen. Das ist die Altlast; die Wiederkehr verhindern
-- der trap in auto-triage.sh und der TTL-Reaper, nicht dieses UPDATE.
UPDATE tickets.provider_health
   SET active_agents = 0, reserved_tokens = 0, claimed_at = NULL, updated_at = now()
 WHERE active_agents > 0 OR reserved_tokens > 0;

-- 2c) Test-Muell aus der produktiven Routing-Tabelle. FA-SF-70 rief
-- 'provider-config.sh set --source x --tier opus --provider anthropic --model m'
-- gegen die echte DB auf. Folgenlos, weil source='x' nie matcht - aber ein Test,
-- der in die produktive Routing-Tabelle schreibt, ist eine Zeitbombe. Der Test
-- wird im selben Ticket auf einen Modus ohne DB-Zugriff umgestellt.
DELETE FROM tickets.provider_config
 WHERE source = 'x' AND tier = 'opus' AND provider = 'anthropic' AND model_id = 'm';

-- 3) CHECK gegen die korrupte Klasse. pg_constraint-Guard statt IF NOT EXISTS,
-- das ADD CONSTRAINT nicht kennt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_health_provider_clean'
       AND conrelid = 'tickets.provider_health'::regclass
  ) THEN
    ALTER TABLE tickets.provider_health
      ADD CONSTRAINT provider_health_provider_clean
      CHECK (provider !~ '[\\[:space:]]');
  END IF;
END
$$;

COMMIT;
