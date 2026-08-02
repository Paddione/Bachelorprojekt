-- tickets.cockpit_audit — Audit-Log der Cockpit-Schreibaktionen (T002463 / K4).
-- Idempotent: ein Wiederholungslauf ist folgenlos.
--
-- Guarded mit to_regnamespace(): dieses Migrationsverzeichnis wird von jedem
-- Marken-db:migrate-Lauf gelesen. Fehlt das tickets-Schema in einer Datenbank,
-- wuerde nacktes DDL dort den gesamten Migrationslauf abbrechen.
DO $$
BEGIN
  IF to_regnamespace('tickets') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS tickets.cockpit_audit (
      id          bigserial PRIMARY KEY,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      actor       text        NOT NULL,
      action      text        NOT NULL,
      target      text        NOT NULL,
      outcome     text        NOT NULL CHECK (outcome IN ('success','failure')),
      brand       text        NOT NULL,
      detail      jsonb
    );
    CREATE INDEX IF NOT EXISTS cockpit_audit_occurred_at_idx
      ON tickets.cockpit_audit (occurred_at DESC);
  END IF;
END
$$;
