// brett/test/identity-spoof.test.ts — Phase C / C4
// Identity is session-authoritative: a session-bearing client can never override
// its identity (and therefore its role) via a spoofed msg.playerId / _playerId.
import { test } from 'node:test';
import assert from 'node:assert';
import { resolvePlayerId, resolveRole, canMutate } from '../src/server/index';
import type { Role } from '../src/types/state';

test('resolvePlayerId: session userId beats a spoofed _playerId', () => {
  assert.strictEqual(
    resolvePlayerId({ _session: { userId: 'beob-1' }, _playerId: 'leiter-1' }),
    'beob-1',
  );
});

test('resolvePlayerId: no session → _playerId, then anon', () => {
  assert.strictEqual(resolvePlayerId({ _playerId: 'p1' }), 'p1');
  assert.strictEqual(resolvePlayerId({}), 'anon');
});

test('spoof scenario: authenticated beobachter joining as leiter-userId is still beobachter & denied', () => {
  const roles: Record<string, Role> = { 'leiter-1': 'leiter', 'beob-1': 'beobachter' };
  // Authenticated beobachter who supplied a privileged _playerId.
  const ws = { _session: { userId: 'beob-1' }, _playerId: 'leiter-1' };

  // Role keys on the session id, not the spoofed _playerId.
  assert.strictEqual(resolveRole(ws, roles), 'beobachter');

  // The spoofed move on the leiter's figure is rejected.
  assert.strictEqual(
    canMutate({
      msgType: 'move',
      role: resolveRole(ws, roles),
      playerId: resolvePlayerId(ws),
      figureOwnerId: 'leiter-1',
    }),
    false,
  );
});

test('anon-escalation guard: session-less client supplying a privileged id → beobachter', () => {
  const roles: Record<string, Role> = { 'leiter-1': 'leiter' };
  const ws = { _playerId: 'leiter-1' }; // no session
  assert.strictEqual(resolveRole(ws, roles), 'beobachter');
});
