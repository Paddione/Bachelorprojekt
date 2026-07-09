// website/src/lib/tickets-schema.ts
// Schema-Initialisierung + Helper für das `tickets`-PostgreSQL-Schema.
// Ausgelagert aus tickets-db.ts (G-CQ07, Zyklus #1), um den statischen
// Import-Zyklus zwischen tickets-db.ts und website-db.ts aufzubrechen.
import { pool, ensureSchemaOnce } from './db-pool';
import { MixedEmbeddingModelError } from './knowledge-db';
import { initProviderConfigSchema } from './schema/provider-config-schema';
import { applyTicketsCoreSchema } from './tickets/tables/tickets';
import { applyFactoryControlSchema } from './tickets/tables/factory-control';
import { applyFactoryModelSlotsSchema } from './tickets/tables/factory-model-slots';
import { applySystemtestLinkback } from './tickets/tables/systemtest-linkback';
import { applyLegacyMigrations } from './tickets/migrations';

export { MixedEmbeddingModelError };

let schemaReady = false;

// WARNING: If you manually create or alter tables in production, you MUST run
// it as the `website` role, or run `ALTER TABLE ... OWNER TO website;`.
// Otherwise, this schema init will fail on `CREATE INDEX IF NOT EXISTS` due
// to permission denied. See Ticket T000028.
export async function initTicketsSchema(): Promise<void> {
  if (schemaReady) return;
  return ensureSchemaOnce('tickets', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SELECT pg_advisory_lock(hashtext('init:tickets'))`);
      try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website`);
        await applyTicketsCoreSchema(pool);
        await applyFactoryControlSchema(pool);
        await applyFactoryModelSlotsSchema(pool);
        await applySystemtestLinkback(pool);
        await applyLegacyMigrations(pool);
        await initProviderConfigSchema(client);
        schemaReady = true;
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('init:tickets'))`);
      }
    } finally {
      client.release();
    }
  });
}

/** Dark-launch gate. Returns true only when an ENABLED flag row exists for
 *  (brand,key). Fails CLOSED (false) on any DB error so a flag-table outage
 *  can never accidentally turn a gated feature on. [T000413] */
export async function isFeatureEnabled(brand: string, key: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT enabled FROM tickets.feature_flags WHERE brand = $1 AND key = $2 LIMIT 1`,
      [brand, key],
    );
    return rows.length > 0 && rows[0].enabled === true;
  } catch {
    return false;
  }
}
