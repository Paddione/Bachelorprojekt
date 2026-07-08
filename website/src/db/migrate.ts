import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { logger } from '../lib/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Postgres SQLSTATEs that indicate a migration's target object already
 * exists (relation / duplicate object / column). When a migration fails
 * with one of these, it is treated as already-applied (backfill) rather
 * than a real failure — see openspec/changes/website-migration-runner.
 */
export const ALREADY_EXISTS_SQLSTATES = new Set(['42P07', '42710', '42701']);

function isPgError(e: unknown): e is { code: string; message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'string'
  );
}

export async function runMigrations(pool: Pool): Promise<void> {
  // A Pool hands out queries to whichever connection is free — BEGIN,
  // the migration body, and COMMIT/ROLLBACK could otherwise land on
  // different underlying connections and silently lose the transaction
  // boundary. Pin the whole run to a single dedicated client instead.
  const client = await pool.connect();
  try {
    // Bootstrap before tracking query (Henne-Ei): must exist before the
    // tracked-filenames SELECT below, even on a completely fresh DB.
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    const migrationsDir = join(__dirname, 'migrations');
    if (!existsSync(migrationsDir)) {
      logger.warn({ migrationsDir }, '[migrate] migrations dir missing — skipping');
      return;
    }

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.filename));

    for (const f of files) {
      if (applied.has(f)) {
        console.log(`[migrate] ${f} already applied — skipping`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, f), 'utf8');
      console.log(`[migrate] applying ${f}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if (isPgError(e) && ALREADY_EXISTS_SQLSTATES.has(e.code)) {
          console.log(
            `[migrate] ${f} already applied (backfill: ${e.code}) — tracking and continuing`,
          );
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [f],
          );
          continue;
        }
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`migration ${f} failed: ${message}`);
      }
    }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — cannot run migrations');
  }
  const pool = new Pool({ connectionString });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

// Only run when invoked directly (e.g. `tsx src/db/migrate.ts`), not when
// imported by tests.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    logger.error({ err: e }, '[migrate] failed');
    process.exit(1);
  });
}
