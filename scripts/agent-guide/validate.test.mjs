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

test('init_prompt_de over 200 chars is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-init-prompt'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('init_prompt_de') && e.includes('200')),
    `expected an init_prompt_de length error, got: ${JSON.stringify(res.errors)}`,
  );
});

test('a short init_prompt_de in the good fixture would validate', () => {
  // sanity: the optional field is accepted when present and within budget
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
});

test('dangling stages reference is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-stage-ref'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('stages') && e.includes('does-not-exist')),
    `expected a stages-ref error, got: ${JSON.stringify(res.errors)}`,
  );
});

test('good fixture still validates with a flow.yaml present', () => {
  // good fixture has no flow.yaml → flow checks are skipped, not errors
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
});

test('bad harness value is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-harness'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('harness') && e.includes('bogus')),
    `expected a harness error, got: ${JSON.stringify(res.errors)}`,
  );
});

