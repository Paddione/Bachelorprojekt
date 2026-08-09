#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
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

export async function runFactoryMigrations(pool, migrationsDirOverride = null) {
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS public.factory_schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    const targetDir = migrationsDirOverride
      ? resolve(migrationsDirOverride)
      : join(__dirname, '..', 'migrations');

    if (!existsSync(targetDir)) {
      console.warn(`[migrate-factory] migrations dir missing at ${targetDir} — skipping`);
      return;
    }

    const files = readdirSync(targetDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query(
      'SELECT filename FROM public.factory_schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.filename));

    for (const f of files) {
      if (applied.has(f)) {
        console.log(`[migrate-factory] ${f}: already applied — skipping`);
        continue;
      }

      const sql = readFileSync(join(targetDir, f), 'utf8');
      console.log(`[migrate-factory] ${f}: applying`);
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
            `[migrate-factory] ${f}: already applied (backfill ${e.code}) — tracking`,
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
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/migrate-factory.mjs [options]

Options:
  --help, -h          Show this help message
  --dir <path>        Override migrations directory path

Environment Variables:
  DATABASE_URL        Postgres connection URL (required unless showing help)
`);
    process.exit(0);
  }

  let customDir = null;
  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    customDir = args[dirIdx + 1];
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot run migrations');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    await runFactoryMigrations(pool, customDir);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error('[migrate-factory] failed:', e);
    process.exit(1);
  });
}
