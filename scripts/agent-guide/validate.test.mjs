import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateRegistry } from './validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('good fixture validates with no errors', () => {
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  assert.equal(res.errors.length, 0);
});

test('dangling danger reference is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-danger-ref'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('danger') && e.includes('nonexistent-tier')),
    `expected a danger-ref error, got: ${JSON.stringify(res.errors)}`,
  );
});

test('good fixture still validates after opt-in checks are added', () => {
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
});

test('empty link url is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-link-url'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('link') && e.includes('url')),
    `expected a link-url error, got: ${JSON.stringify(res.errors)}`,
  );
});
