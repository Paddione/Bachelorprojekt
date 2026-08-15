import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// D1 — assert the additive, idempotent `brett_snapshots.is_template` migration
// exists in the shared schema (k3d/website-schema.yaml). Structure-only: we read
// the YAML text and check the SQL is present (no DB/cluster apply here).
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'k3d', 'website-schema.yaml');
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

test('brett_snapshots gains an additive is_template column (idempotent)', () => {
  assert.match(
    schema,
    /ALTER TABLE brett_snapshots\s+ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false/,
    'expected an additive `ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false`',
  );
});

test('brett_snapshots has a partial index on is_template', () => {
  assert.match(
    schema,
    /CREATE INDEX IF NOT EXISTS idx_brett_snapshots_template ON brett_snapshots\(is_template\) WHERE is_template/,
    'expected a partial index `idx_brett_snapshots_template … WHERE is_template`',
  );
});
