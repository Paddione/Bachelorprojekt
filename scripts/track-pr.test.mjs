import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePr } from './track-pr.mjs';

test('parses conventional commit with scope', () => {
  const r = parsePr({
    number: 491,
    title: 'feat(infra): multi-tenant website support',
    body: '',
    mergedAt: '2026-05-05T14:02:00Z',
    mergedBy: { login: 'patrick' },
  });
  assert.equal(r.pr_number, 491);
  assert.equal(r.category, 'feat');
  assert.equal(r.scope, 'infra');
  assert.equal(r.title, 'multi-tenant website support');
  assert.equal(r.merged_at, '2026-05-05T14:02:00Z');
  assert.equal(r.merged_by, 'patrick');
  assert.deepEqual(r.bug_refs, []);
});

test('parses conventional commit without scope', () => {
  const r = parsePr({
    number: 100,
    title: 'fix: race condition in slot booker',
    body: '',
    mergedAt: '2026-04-01T10:00:00Z',
  });
  assert.equal(r.category, 'fix');
  assert.equal(r.scope, null);
  assert.equal(r.title, 'race condition in slot booker');
});

test('extracts BR-XXXX bug references from body', () => {
  const r = parsePr({
    number: 200,
    title: 'fix(website): correct date format',
    body: 'Fixes BR-20260415-0042 and Closes BR-20260420-0001\nAlso resolves BR-20260423-0099.',
    mergedAt: '2026-04-25T12:00:00Z',
  });
  assert.deepEqual(r.bug_refs, [
    'BR-20260415-0042',
    'BR-20260420-0001',
    'BR-20260423-0099',
  ]);
});

test('extracts requirement_id (FA/SA/NFA/AK) from body', () => {
  const r = parsePr({
    number: 201,
    title: 'feat(stream): livekit recording',
    body: 'Implements FA-12 and partially SA-03.',
    mergedAt: '2026-04-30T08:00:00Z',
  });
  assert.equal(r.requirement_id, 'FA-12');
});

test('falls back to chore category for unconventional title', () => {
  const r = parsePr({
    number: 300,
    title: 'Bump dependencies',
    body: '',
    mergedAt: '2026-05-01T09:00:00Z',
  });
  assert.equal(r.category, 'chore');
  assert.equal(r.title, 'Bump dependencies');
});

test('infers brand from scope when scope is mentolder/korczewski', () => {
  const r = parsePr({
    number: 400,
    title: 'feat(korczewski): rebuild homepage',
    body: '',
    mergedAt: '2026-05-05T00:00:00Z',
  });
  assert.equal(r.brand, 'korczewski');
});

test('null brand for non-brand scopes', () => {
  const r = parsePr({
    number: 401,
    title: 'feat(infra): cluster merge',
    body: '',
    mergedAt: '2026-05-04T00:00:00Z',
  });
  assert.equal(r.brand, null);
});
