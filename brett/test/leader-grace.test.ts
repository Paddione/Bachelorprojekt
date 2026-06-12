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
import {
  roomPreviousPlayers,
  trackPlayerInRoom,
  // SEC bug #3 (T000660): per-room cleanup for the server-side tracking Maps
  // (roomPreviousPlayers + tokenGraceTimers). Not yet implemented — undefined
  // until added, so the calls below throw.
  cleanupRoomTracking,
} from '../src/server/sessions';

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

// ── SEC bug #3 (T000660): server Map leaks on room destroy ───────────────────
// roomPreviousPlayers and tokenGraceTimers accumulate entries for the whole
// process lifetime — nothing prunes them when a room ends. cleanupRoomTracking
// must drop both entries (and cancel the pending grace timer) for one room.
test('cleanupRoomTracking: clears roomPreviousPlayers for the room', () => {
  const room = 'cleanup-room-1';
  trackPlayerInRoom(room, 'p1');
  trackPlayerInRoom(room, 'p2');
  assert.strictEqual(roomPreviousPlayers.has(room), true, 'tracked before cleanup');
  cleanupRoomTracking(room);
  assert.strictEqual(roomPreviousPlayers.has(room), false, 'roomPreviousPlayers entry removed');
});

test('cleanupRoomTracking: cancels and removes the pending grace timer', () => {
  const room = 'cleanup-room-2';
  applyMutation(room, { type: 'session_admin_token_set', playerId: 'leader1' });
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  beginTokenGrace(room, 'leader1', { timeoutMs: 30_000 });
  assert.strictEqual(tokenGraceTimers.has(room), true, 'grace timer present');
  cleanupRoomTracking(room);
  assert.strictEqual(tokenGraceTimers.has(room), false, 'grace timer removed after cleanup');
});

test('cleanupRoomTracking: leaves other rooms untouched', () => {
  trackPlayerInRoom('cleanup-keep', 'p9');
  cleanupRoomTracking('cleanup-room-other');
  assert.strictEqual(roomPreviousPlayers.has('cleanup-keep'), true, 'unrelated room survives');
  roomPreviousPlayers.delete('cleanup-keep');
});
