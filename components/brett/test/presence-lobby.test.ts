// brett/test/presence-lobby.test.ts — Phase B / B10
import { test } from 'node:test';
import assert from 'node:assert';
import { resolvePlayerId } from '../src/server/index';

test('resolvePlayerId: session userId beats client-supplied _playerId (session-first)', () => {
  assert.strictEqual(
    resolvePlayerId({ _session: { userId: 'oidc-u1' }, _playerId: 'spoof' }),
    'oidc-u1'
  );
});

test('resolvePlayerId: falls back to _playerId without a session', () => {
  assert.strictEqual(resolvePlayerId({ _playerId: 'p2' }), 'p2');
});

test('resolvePlayerId: anon fallback for an empty ws', () => {
  assert.strictEqual(resolvePlayerId({}), 'anon');
});
