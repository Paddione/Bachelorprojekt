// components/website/src/lib/tickets/tables/factory-control.ts
// DDL for tickets.factory_phase_events and tickets.ticket_injections.
// Extracted from tickets-db.ts (G-RH01 Batch 2 — T001155).
//
// T900399 (Software-Factory-Decommission): the DDL for `tickets.factory_control`
// (kill-switch, per-brand daily cap, dry-run markers) was REMOVED here. The table
// is dropped by scripts/migrations/2026-09-26-factory-decommission.sql; recreating
// it from the website schema init would have undone that migration. The file and
// function names are kept to avoid an import ripple — they now cover only the
// phase-event and injection tables.
import type { Pool, PoolClient } from 'pg';

export async function applyFactoryControlSchema(pool: Pool | PoolClient): Promise<void> {
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
