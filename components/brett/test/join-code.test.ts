// brett/test/join-code.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { registerSessionCode, resolveJoinTarget } from '../src/server/index';

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
