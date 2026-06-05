import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistry } from './validate.mjs';

const here = join(fileURLToPath(import.meta.url), '..');
const repoRoot = join(here, '..', '..');
const realCfg = join(repoRoot, 'docs', 'code-quality');
const fx = (name) => join(here, 'fixtures', name);

test('real registry is valid', () => {
  const res = validateRegistry(realCfg, repoRoot);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test('rejects an owner outside the six routing agents', () => {
  const res = validateRegistry(fx('bad-owner'), repoRoot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /owner_agent/.test(e) && /bogus/.test(e)));
});

test('rejects an identical duplicate path glob', () => {
  const res = validateRegistry(fx('dup-glob'), repoRoot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /duplicate path glob/.test(e)));
});

test('fails closed when a gates.yaml key consumed downstream is missing (Finding-4)', () => {
  // bad-gates has a valid registry but an s2.graphs entry without `tsconfig`.
  const res = validateRegistry(fx('bad-gates'), repoRoot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /s2\.graphs/.test(e) && /tsconfig/.test(e)));
});
