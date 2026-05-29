#!/usr/bin/env node
/**
 * Migration: Create content_versions table + add version columns.
 *
 * IMPORTANT: Alter table statements require postgres superuser access.
 * The migration accepts either:
 *   - POSTGRES_MIGRATION_URL: Full superuser connection (recommended for prod)
 *   - SESSIONS_DATABASE_URL: Website user connection (creates table, warns on ALTER)
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DDL = `
CREATE TABLE IF NOT EXISTS content_versions (
  id           BIGSERIAL PRIMARY KEY,
  brand        TEXT        NOT NULL,
  content_key  TEXT        NOT NULL,
  content_type TEXT        NOT NULL,
  snapshot     JSONB       NOT NULL,
  editor       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_versions_key_idx
  ON content_versions (brand, content_key, created_at DESC);
ALTER TABLE site_settings    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
ALTER TABLE legal_pages      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
ALTER TABLE service_config   ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
ALTER TABLE leistungen_config ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
`;

// Use POSTGRES_MIGRATION_URL if available (for superuser), otherwise fallback to SESSIONS_DATABASE_URL
const url = process.env.POSTGRES_MIGRATION_URL || process.env.SESSIONS_DATABASE_URL;
if (!url) { console.error('POSTGRES_MIGRATION_URL or SESSIONS_DATABASE_URL required'); process.exit(2); }
const client = new pg.Client({ connectionString: url });
await client.connect();
if (!APPLY) {
  console.log('DRY-RUN. DDL that would run:\n' + DDL);
} else {
  // Execute each statement separately to handle permission errors gracefully
  const statements = [
    'CREATE TABLE IF NOT EXISTS content_versions (id BIGSERIAL PRIMARY KEY, brand TEXT NOT NULL, content_key TEXT NOT NULL, content_type TEXT NOT NULL, snapshot JSONB NOT NULL, editor TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());',
    'CREATE INDEX IF NOT EXISTS content_versions_key_idx ON content_versions (brand, content_key, created_at DESC);',
    'ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;',
    'ALTER TABLE legal_pages ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;',
    'ALTER TABLE service_config ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;',
    'ALTER TABLE leistungen_config ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;'
  ];

  let alterTableFailed = false;
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (err) {
      if (err.code === '42501') { // Permission denied
        alterTableFailed = true;
        console.warn(`WARNING: Permission denied (requires superuser access):\n  ${stmt.substring(0, 80)}...`);
      } else {
        throw err;
      }
    }
  }
  if (alterTableFailed) {
    console.log('Partial migration: content_versions table created, but version columns need superuser.');
    console.log('To complete: set POSTGRES_MIGRATION_URL=postgresql://postgres:<pw>@host/website and re-run with --apply');
    process.exit(0);
  }
  console.log('Applied content-versions migration (all statements succeeded).');
}
await client.end();
