#!/usr/bin/env node
/**
 * Migration: Create the homepage block document tables.
 *
 * Parity helper for scripts/migrate-content-versions.mjs. The website store
 * (website/src/lib/homepage-blocks-store.ts) also creates these tables lazily
 * via CREATE TABLE IF NOT EXISTS on first access, so this script is an
 * operator convenience / explicit-provisioning path (e.g. to pre-create the
 * tables before the first request). Both paths use IF NOT EXISTS and are
 * therefore idempotent and safe to run repeatedly.
 *
 * Accepts either:
 *   - POSTGRES_MIGRATION_URL: superuser connection (recommended for prod)
 *   - SESSIONS_DATABASE_URL:  website user connection (sufficient — owns these tables)
 *
 * Usage:
 *   node scripts/migrate-homepage-blocks.mjs            # dry-run (prints DDL)
 *   node scripts/migrate-homepage-blocks.mjs --apply    # execute
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS homepage_block_documents (
     brand      TEXT        PRIMARY KEY,
     document   JSONB       NOT NULL,
     version    INTEGER     NOT NULL DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,
  `CREATE TABLE IF NOT EXISTS homepage_block_versions (
     id         BIGSERIAL   PRIMARY KEY,
     brand      TEXT        NOT NULL,
     snapshot   JSONB       NOT NULL,
     editor     TEXT        NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,
  `CREATE INDEX IF NOT EXISTS homepage_block_versions_brand_idx
     ON homepage_block_versions (brand, created_at DESC);`,
];

const url = process.env.POSTGRES_MIGRATION_URL || process.env.SESSIONS_DATABASE_URL;
if (!url) {
  console.error('POSTGRES_MIGRATION_URL or SESSIONS_DATABASE_URL required');
  process.exit(2);
}

if (!APPLY) {
  console.log('DRY-RUN. DDL that would run:\n' + STATEMENTS.join('\n'));
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const stmt of STATEMENTS) {
    await client.query(stmt);
  }
  console.log('Applied homepage-blocks migration (all statements succeeded).');
} finally {
  await client.end();
}
