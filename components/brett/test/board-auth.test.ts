// brett/test/board-auth.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { boardAuthRedirect } from '../src/server/index';

test('no session → redirect to login with returnTo', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, {});
  assert.strictEqual(r, '/auth/login?returnTo=%2F');
});
test('authenticated session → no redirect', () => {
  const r = boardAuthRedirect({ session: { userId: 'u1' }, path: '/' }, {});
  assert.strictEqual(r, null);
});
test('board is always gated regardless of env (no mayhem-public bypass)', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, { BRETT_DEFAULT_MODE: 'mayhem' });
  assert.strictEqual(r, '/auth/login?returnTo=%2F');
});
test('e2e secret header bypasses the gate', () => {
  const r = boardAuthRedirect(
    { session: {}, path: '/', header: () => 'sekret' },
    { BRETT_OIDC_SECRET: 'sekret' });
  assert.strictEqual(r, null);
});
