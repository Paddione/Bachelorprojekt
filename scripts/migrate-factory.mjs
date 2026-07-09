import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ALREADY_EXISTS_SQLSTATES = new Set(['42P07', '42710', '42701']);

function isPgError(e) {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof e.code === 'string'
  );
}

export async function runMigrations(pool, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS public.factory_schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    const migrationsDir = opts.migrationsDir || join(__dirname, 'migrations');
    if (!existsSync(migrationsDir)) {
      console.log('[factory-migrate] migrations dir missing — skipping');
      return;
    }

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query(
      'SELECT filename FROM public.factory_schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.filename));

    for (const f of files) {
      if (applied.has(f)) {
        console.log(`[factory-migrate] ${f} already applied — skipping`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, f), 'utf8');
      console.log(`[factory-migrate] applying ${f}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO public.factory_schema_migrations (filename) VALUES ($1)',
          [f],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if (isPgError(e) && ALREADY_EXISTS_SQLSTATES.has(e.code)) {
          console.log(
            `[factory-migrate] ${f} already applied (backfill: ${e.code}) — tracking and continuing`,
          );
          await client.query(
            'INSERT INTO public.factory_schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — cannot run factory migrations');
  }
  const pool = new Pool({ connectionString });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error('[factory-migrate] failed:', e.message);
    process.exit(1);
  });
}
