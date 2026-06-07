// brett/test/leader-grace.test.ts — Phase B / B14
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  onLeaderDisconnect,
  getAdminTokenHolder,
  beginTokenGrace,
  tokenGraceTimers,
} from '../src/server/index';

function makeDeps() {
  return { getAdminTokenHolder, beginTokenGrace };
}

test('onLeaderDisconnect: token holder leaving a non-ended phase starts grace', () => {
  const room = 'leader-grace-1';
  applyMutation(room, { type: 'session_admin_token_set', playerId: 'leader1' });
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  onLeaderDisconnect(room, 'leader1', 'active', makeDeps());
  assert.strictEqual(tokenGraceTimers.has(room), true, 'grace timer started');
  clearTimeout(tokenGraceTimers.get(room)!);
  tokenGraceTimers.delete(room);
});

test('onLeaderDisconnect: a non-holder leaving does NOT start grace', () => {
  const room = 'leader-grace-2';
  applyMutation(room, { type: 'session_admin_token_set', playerId: 'leader1' });
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  onLeaderDisconnect(room, 'guest', 'active', makeDeps());
  assert.strictEqual(tokenGraceTimers.has(room), false);
});

test('onLeaderDisconnect: token holder leaving a terminal (ended) phase does NOT start grace', () => {
  const room = 'leader-grace-3';
  applyMutation(room, { type: 'session_admin_token_set', playerId: 'leader1' });
  applyMutation(room, { type: 'session_phase_set', phase: 'ended' });
  onLeaderDisconnect(room, 'leader1', 'ended', makeDeps());
  assert.strictEqual(tokenGraceTimers.has(room), false);
});
