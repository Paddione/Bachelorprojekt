-- Cockpit NOTIFY-Trigger: senden pg_notify auf Kanal 'cockpit_events'
-- bei Aenderungen an den Cockpit-relevanten Tabellen.
-- Idempotent: ein Wiederholungslauf ist folgenlos.
--
-- Guarded mit to_regnamespace(): dieses Migrationsverzeichnis wird von jedem
-- Marken-db:migrate-Lauf gelesen. Fehlt das tickets-Schema in einer Datenbank,
-- wuerde nacktes DDL dort den gesamten Migrationslauf abbrechen.
DO $$
BEGIN
  IF to_regnamespace('tickets') IS NOT NULL THEN

    -- Triggerfunktion: schlanke Nutzlast, nur Kennfelder.
    -- pg_notify bricht ueber 8000 Byte hart ab; der Empfaenger
    -- liest die massgebliche Zeile selbst nach.
    CREATE OR REPLACE FUNCTION tickets.cockpit_notify() RETURNS trigger AS $fn$
    BEGIN
      PERFORM pg_notify('cockpit_events', json_build_object(
        'domain', TG_ARGV[0],
        'op',     TG_OP,
        'at',     extract(epoch from now())
      )::text);
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    -- factory_phase_events → Domäne 'factory'
    DROP TRIGGER IF EXISTS cockpit_notify_factory ON tickets.factory_phase_events;
    CREATE TRIGGER cockpit_notify_factory
      AFTER INSERT OR UPDATE ON tickets.factory_phase_events
      FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('factory');

    -- cockpit_audit → Domäne 'audit'
    DROP TRIGGER IF EXISTS cockpit_notify_audit ON tickets.cockpit_audit;
    CREATE TRIGGER cockpit_notify_audit
      AFTER INSERT OR UPDATE ON tickets.cockpit_audit
      FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('audit');

    -- tickets (Statuswechsel) → Domäne 'tickets'
    -- Nur bei Statusaenderung (UPDATE), nicht bei jeder Feldaktualisierung.
    -- INSERT: neuer Eintrag zaehlt immer als Statusereignis.
    -- UPDATE mit WHEN kann nicht mit INSERT kombiniert werden, weil
    -- INSERT kein OLD hat — daher zwei getrennte Trigger.
    DROP TRIGGER IF EXISTS cockpit_notify_tickets_ins ON tickets.tickets;
    CREATE TRIGGER cockpit_notify_tickets_ins
      AFTER INSERT ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('tickets');

    DROP TRIGGER IF EXISTS cockpit_notify_tickets_upd ON tickets.tickets;
    CREATE TRIGGER cockpit_notify_tickets_upd
      AFTER UPDATE ON tickets.tickets
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION tickets.cockpit_notify('tickets');

  END IF;
END
$$;
