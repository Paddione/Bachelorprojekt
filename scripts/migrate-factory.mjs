#!/usr/bin/env node
import { runMigrations } from './migrate-db.mjs';
import pg from 'pg';
const { Pool } = pg;

console.warn('[migrate-factory] DEPRECATED: use scripts/migrate-db.mjs instead');

const args = process.argv.slice(2);
let customDir = null;
const dirIdx = args.indexOf('--dir');
if (dirIdx !== -1 && args[dirIdx + 1]) customDir = args[dirIdx + 1];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set — cannot run migrations');
  process.exit(1);
}

const pool = new Pool({ connectionString });
try {
  await runMigrations(pool, customDir);
} finally {
  await pool.end();
}
