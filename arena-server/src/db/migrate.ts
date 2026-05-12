import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { log } from '../log';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS arena;
    CREATE TABLE IF NOT EXISTS arena._migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM arena._migrations WHERE filename = $1', [f],
    );
    if (rows.length) { log.info({ f }, 'migration already applied'); continue; }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    log.info({ f }, 'applying migration');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO arena._migrations (filename) VALUES ($1)', [f]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }
}