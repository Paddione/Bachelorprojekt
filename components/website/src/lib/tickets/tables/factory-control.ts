// components/website/src/lib/tickets/tables/factory-control.ts
// DDL for tickets.factory_control, factory_phase_events, ticket_injections.
// Extracted from tickets-db.ts (G-RH01 Batch 2 — T001155).
import type { Pool, PoolClient } from 'pg';

export async function applyFactoryControlSchema(pool: Pool | PoolClient): Promise<void> {
  // Phase 3 Software Factory: factory_control is the runtime control plane —
  // global kill-switch, per-brand daily-deploy cap counter, dry-run markers.
  // brand NULL = global. Read fresh per dispatcher tick, fail-closed on error.
  // [T000413]
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.factory_control (
      id         BIGSERIAL PRIMARY KEY,
      key        TEXT NOT NULL,
      brand      TEXT,
      value      TEXT NOT NULL,
      set_by     TEXT,
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE NULLS NOT DISTINCT (key, brand)
    )
  `);

  // Idempotente Migration für den Live-Bestand
  await pool.query(`
    -- 2a) Surrogate-PK nachrüsten (Spalte + PK je nur wenn fehlend)
    ALTER TABLE tickets.factory_control ADD COLUMN IF NOT EXISTS id BIGSERIAL;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tickets.factory_control'::regclass AND conname = 'factory_control_pkey') THEN
        ALTER TABLE tickets.factory_control ADD CONSTRAINT factory_control_pkey PRIMARY KEY (id);
      END IF;
    END $$;

    -- 2b) Duplikate kollabieren: neueste updated_at-Zeile je (key, brand) behalten
    DELETE FROM tickets.factory_control a
      USING tickets.factory_control b
      WHERE a.key IS NOT DISTINCT FROM b.key
        AND a.brand IS NOT DISTINCT FROM b.brand
        AND a.ctid < b.ctid;

    -- 2c) UNIQUE auf NULLS NOT DISTINCT upgraden (PG16)
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tickets.factory_control'::regclass AND conname = 'factory_control_key_brand_key'
                 AND NOT pg_get_constraintdef(oid) ILIKE '%NULLS NOT DISTINCT%') THEN
        ALTER TABLE tickets.factory_control DROP CONSTRAINT factory_control_key_brand_key;
      END IF;
    END $$;
    ALTER TABLE tickets.factory_control DROP CONSTRAINT IF EXISTS factory_control_key_brand_key;
    ALTER TABLE tickets.factory_control ADD CONSTRAINT factory_control_key_brand_key UNIQUE NULLS NOT DISTINCT (key, brand);
  `);
  // Software Factory Live-Floor (T-FACTORY-FLOOR): append-only phase telemetry; latest row per ticket = current phase/state. Emitted best-effort by `ticket.sh phase`.
  await pool.query(`CREATE TABLE IF NOT EXISTS tickets.factory_phase_events (id BIGSERIAL PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE, phase TEXT NOT NULL CHECK (phase IN ('scout','design','plan','implement','verify','deploy')), state TEXT NOT NULL CHECK (state IN ('entered','done','blocked')), detail TEXT, driver TEXT NOT NULL DEFAULT 'factory' CHECK (driver IN ('factory','devflow')), at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS factory_phase_events_ticket_at_idx ON tickets.factory_phase_events (ticket_id, at DESC)`);
  // Factory Injection (factory-injection): operator notes/context/assets fed back into a
  // running or next pipeline at the next phase boundary. consumed_at NULL = still open.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_injections (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id    UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      phase        TEXT CHECK (phase IN ('scout','design','plan','implement','verify','deploy')),
      kind         TEXT NOT NULL CHECK (kind IN ('context','note','asset')),
      title        TEXT,
      content      TEXT,
      target_files TEXT[],
      data_url     TEXT,
      nc_path      TEXT,
      filename     TEXT,
      mime_type    TEXT,
      injected_by  TEXT NOT NULL DEFAULT 'admin',
      injected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      consumed_at  TIMESTAMPTZ,
      CHECK (kind <> 'asset' OR data_url IS NOT NULL OR nc_path IS NOT NULL)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_injections_ticket_phase_idx ON tickets.ticket_injections (ticket_id, phase)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_injections_open_idx ON tickets.ticket_injections (ticket_id) WHERE consumed_at IS NULL`);
}
