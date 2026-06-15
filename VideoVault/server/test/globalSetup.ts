import { execFileSync } from 'child_process';
import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const CONTAINER_NAME = 'videovault-test-db';
const TEST_DB_NAME = 'videovault_test';
const TEST_DB_USER = 'videovault_user';
const TEST_DB_PASS = 'videovault_test_pass';
const TEST_DB_PORT = 5433;
const PROJECT_ROOT = resolve(__dirname, '../..');

const TEST_DB_URL = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:${TEST_DB_PORT}/${TEST_DB_NAME}`;

let containerStartedByUs = false;

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/**
 * Wait for PostgreSQL to accept connections.
 */
async function waitForPostgres(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 1000 });
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`PostgreSQL did not become ready within ${timeoutMs}ms`);
}

async function startContainer(): Promise<void> {
  // Check if container already exists and is running
  try {
    const state = docker('inspect', '-f', '{{.State.Running}}', CONTAINER_NAME);
    if (state === 'true') {
      console.log(`  [test-db] Container ${CONTAINER_NAME} already running`);
      return;
    }
    // Container exists but is stopped — remove and recreate
    docker('rm', '-f', CONTAINER_NAME);
  } catch {
    // Container doesn't exist — that's fine
  }

  docker(
    'run', '-d',
    '--name', CONTAINER_NAME,
    '-e', `POSTGRES_USER=${TEST_DB_USER}`,
    '-e', `POSTGRES_PASSWORD=${TEST_DB_PASS}`,
    '-e', `POSTGRES_DB=${TEST_DB_NAME}`,
    '-p', `${TEST_DB_PORT}:5432`,
    'postgres:16-alpine',
  );
  containerStartedByUs = true;
  console.log(`  [test-db] Started container ${CONTAINER_NAME} on port ${TEST_DB_PORT}`);
}

async function runMigrations(): Promise<void> {
  const pool = new pg.Pool({ connectionString: TEST_DB_URL });
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    // Migration tracking table (mirrors server/migrate.ts)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = join(PROJECT_ROOT, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [test-db] Migration failed: ${file}`);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`  [test-db] Applied ${files.length} migrations`);
  } finally {
    await pool.end();
  }
}

function stopContainer(): void {
  if (!containerStartedByUs) return;
  try {
    docker('rm', '-f', CONTAINER_NAME);
    console.log(`  [test-db] Stopped and removed container ${CONTAINER_NAME}`);
  } catch {
    // Best-effort cleanup
  }
}

export default async function globalSetup(): Promise<() => void> {
  console.log('');
  await startContainer();
  await waitForPostgres(TEST_DB_URL);
  await runMigrations();

  process.env.DATABASE_URL = TEST_DB_URL;

  return () => {
    stopContainer();
  };
}
