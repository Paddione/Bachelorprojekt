// brett/test/join-code.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { registerSessionCode, resolveJoinTarget } = require('../server.js');

test('resolveJoinTarget redirects a known code to its room', () => {
  registerSessionCode('ABC-DEF', 'room-xyz');
  assert.deepStrictEqual(resolveJoinTarget('ABC-DEF'), { redirect: '/?room=room-xyz' });
});
test('resolveJoinTarget errors on unknown code', () => {
  assert.deepStrictEqual(resolveJoinTarget('ZZZ-ZZZ'), { error: 'unknown-code' });
});
test('resolveJoinTarget errors on malformed code', () => {
  assert.deepStrictEqual(resolveJoinTarget('garbage'), { error: 'unknown-code' });
});
