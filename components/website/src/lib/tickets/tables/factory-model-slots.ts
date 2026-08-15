// website/src/lib/tickets/tables/factory-model-slots.ts
// DDL for tickets.factory_model_slots.
import type { Pool, PoolClient } from 'pg';

export async function applyFactoryModelSlotsSchema(c: Pool | PoolClient): Promise<void> {
  await c.query(`CREATE TABLE IF NOT EXISTS tickets.factory_model_slots (
    phase      TEXT PRIMARY KEY CHECK (phase IN ('scout','plan','implement','verify','deploy')),
    provider   TEXT NOT NULL,
    model_id   TEXT NOT NULL,
    base_url   TEXT,
    set_by     TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}
