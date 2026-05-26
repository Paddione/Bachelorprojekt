// brett/test/session-code.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  generateSessionCode,
  registerSessionCode,
  resolveSessionCode,
  sessionCodeIndex,
  rebuildSessionCodeIndexFromStates,
} = require('../server.js');

test('generateSessionCode: matches Crockford-base32 pattern XXX-XXX', () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateSessionCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/,
      `code ${code} must be 3-3 Crockford-base32 (no I,L,O,0,1)`);
  }
});

test('generateSessionCode: 10k iterations have <1% collision rate', () => {
  const seen = new Set();
  let collisions = 0;
  for (let i = 0; i < 10_000; i++) {
    const code = generateSessionCode();
    if (seen.has(code)) collisions++;
    seen.add(code);
  }
  assert.ok(collisions < 100, `collisions ${collisions} should be <100 for 10k codes from 32^5 space`);
});

test('registerSessionCode + resolveSessionCode: roundtrip', () => {
  const code = generateSessionCode();
  registerSessionCode(code, 'room-token-xyz');
  assert.strictEqual(resolveSessionCode(code), 'room-token-xyz');
});

test('resolveSessionCode: returns null for unknown code', () => {
  assert.strictEqual(resolveSessionCode('XXX-XXX'), null);
});

test('sessionCodeIndex rebuilds from persisted state on bootstrap', async () => {
  sessionCodeIndex.clear();
  rebuildSessionCodeIndexFromStates([
    { room_token: 'r-1', state: { sessionCode: 'AAA-AAA' } },
    { room_token: 'r-2', state: { sessionCode: 'BBB-BBB' } },
    { room_token: 'r-3', state: { /* no session code */ } },
  ]);
  assert.strictEqual(resolveSessionCode('AAA-AAA'), 'r-1');
  assert.strictEqual(resolveSessionCode('BBB-BBB'), 'r-2');
  assert.strictEqual(sessionCodeIndex.size, 2);
});
