import { pool } from './db';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from './lib/logger';

/**
 * Lightweight migration runner for VideoVault.
 * Reads SQL files from the migrations/ directory in sorted order,
 * tracks applied migrations in a `schema_migrations` table,
 * and applies pending ones inside a transaction per migration.
 */
export async function runMigrations(): Promise<void> {
  if (!pool) return;

  const migrationsDir = join(process.cwd(), 'migrations');

  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get already-applied migrations
  const applied = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  const appliedSet = new Set(applied.rows.map((r: { filename: string }) => r.filename));

  // Read migration files in sorted order
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    logger.warn('No migrations directory found, skipping migrations');
    return;
  }

  const pending = files.filter(f => !appliedSet.has(f));

  if (pending.length === 0) {
    logger.info('No pending migrations');
    return;
  }

  logger.info(`Found ${pending.length} pending migration(s)`);

  for (const file of pending) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      logger.info(`Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed: ${file}`, { error: (err as Error).message });
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info('All migrations applied successfully');
}
