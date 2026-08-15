import './env';
import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';

// Lazily create a Pool only when DATABASE_URL is present
const connectionString = process.env.DATABASE_URL;

function buildPoolConfig(cs: string) {
  const url = new URL(cs);
  const params = url.searchParams;
  const sslParam = params.get('ssl');
  const sslModeParam = params.get('sslmode');

  const envSsl = (process.env.PGSSL || '').toLowerCase();
  const envSslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const envReject = (process.env.PGSSLREJECTUNAUTHORIZED || '').toLowerCase();

  const wantSsl = (
    sslParam === 'true' ||
    sslModeParam === 'require' ||
    envSsl === 'true' ||
    envSslMode === 'require'
  );

  const rejectUnauthorized = envReject === 'true';

  return wantSsl
    ? { connectionString: cs, ssl: rejectUnauthorized ? { rejectUnauthorized: true } : { rejectUnauthorized: false } }
    : { connectionString: cs };
}

export const pool = connectionString
  ? new Pool(buildPoolConfig(connectionString))
  : undefined;

// Prevent unhandled 'error' events from crashing the process.
// Idle clients in the pool can lose connections (e.g., DB recovery after TRUNCATE).
if (pool) {
  pool.on('error', (err) => {
    console.error('[pg-pool] Unexpected pool error (non-fatal):', err.message);
  });
}

export const db = pool ? drizzle(pool) : undefined;

export async function ensureDbReady(): Promise<void> {
  if (!pool) return;
  // Simple connectivity check
  await pool.query('SELECT 1');
  // Ensure required extensions
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (_e) {
    // ignore if not permitted; id defaults requiring gen_random_uuid() may fail otherwise
  }
}
