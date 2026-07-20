// brett/test/templates-brand-env.test.ts — T002006: admin.ts resolves brand from
// BRETT_BRAND (consistent with resolveBrand in auth.ts), not exclusively BRAND.
// Source-based check (analog facelift-tokens.test.ts) — avoids booting the full
// express app / db pool just to assert an env-var read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADMIN_ROUTES_PATH = resolve(import.meta.dirname, '../src/server/routes/admin.ts');

test('GET /api/templates reads process.env.BRETT_BRAND', () => {
  const src = readFileSync(ADMIN_ROUTES_PATH, 'utf8');
  assert.match(src, /process\.env\.BRETT_BRAND/);
});

test('GET /api/templates still falls back to process.env.BRAND then a default', () => {
  const src = readFileSync(ADMIN_ROUTES_PATH, 'utf8');
  const line = src.split('\n').find((l) => l.includes('BRETT_BRAND'));
  assert.ok(line, 'expected a line referencing BRETT_BRAND');
  assert.match(line!, /process\.env\.BRAND/);
  assert.match(line!, /'mentolder'/);
});
