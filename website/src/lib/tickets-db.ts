// website/src/lib/tickets-db.ts
// Re-export compat layer — content split into tickets/tables/* + tickets/migrations
// (G-RH01 Batch 2, T001155). No API break: existing `import { initTicketsSchema }`
// continues to work via the re-export below.
import { pool, ensureSchemaOnce } from './db-pool';
import { MixedEmbeddingModelError } from './knowledge-db';
import type { EmbeddingModel } from './embeddings';
import { initProviderConfigSchema } from './schema/provider-config-schema';
import { applyTicketsCoreSchema } from './tickets/tables/tickets';
import { applyFactoryControlSchema } from './tickets/tables/factory-control';
import { applySystemtestLinkback } from './tickets/tables/systemtest-linkback';
import { applyLegacyMigrations } from './tickets/migrations';

export { MixedEmbeddingModelError };

/** The embedding model this environment writes/queries with. bge-m3 in prod
 *  (LLM_ENABLED=true), voyage-multilingual-2 in dev. Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}

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
