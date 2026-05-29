// brett/test/board-auth.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { boardAuthRedirect } = require('../server.js');

test('coaching deployment + no session → redirect to login with returnTo', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, { /* coaching default */ });
  assert.strictEqual(r, '/auth/login?returnTo=%2F');
});
test('coaching deployment + authenticated session → no redirect', () => {
  const r = boardAuthRedirect({ session: { userId: 'u1' }, path: '/' }, {});
  assert.strictEqual(r, null);
});
test('mayhem deployment → never gates', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, { BRETT_DEFAULT_MODE: 'mayhem' });
  assert.strictEqual(r, null);
});
test('e2e secret header bypasses the gate', () => {
  const r = boardAuthRedirect(
    { session: {}, path: '/', header: () => 'sekret' },
    { BRETT_OIDC_SECRET: 'sekret' });
  assert.strictEqual(r, null);
});
