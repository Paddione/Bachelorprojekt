import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { log } from '../log';

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS studio;
    CREATE TABLE IF NOT EXISTS studio._migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const migrationsDir = join(__dirname, 'migrations');
  if (!existsSync(migrationsDir)) {
    log.warn({ migrationsDir }, 'migrations dir missing — skipping');
    return;
  }
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM studio._migrations WHERE filename = $1', [f],
    );
    if (rows.length) { log.info({ f }, 'migration already applied'); continue; }
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    log.info({ f }, 'applying migration');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO studio._migrations (filename) VALUES ($1)', [f]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }
}
