// brett/test/join-overlay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, joinUrl } from '../public/assets/coaching/join.mjs';

test('normalizeCode uppercases, strips spaces, inserts the dash', () => {
  assert.equal(normalizeCode('abc def'), 'ABC-DEF');
  assert.equal(normalizeCode('ABCDEF'), 'ABC-DEF');
  assert.equal(normalizeCode('abc-def'), 'ABC-DEF');
});

test('joinUrl builds the encoded endpoint', () => {
  assert.equal(joinUrl('ABC-DEF'), '/api/join?code=ABC-DEF');
});
