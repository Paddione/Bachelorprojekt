// brett/test/reconnect-guard.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import {
  trackPlayerInRoom,
  wasPreviouslyInRoom,
  applyMutation,
  shouldRejectReconnect,
} from '../src/server/index';

test('trackPlayerInRoom + wasPreviouslyInRoom: roundtrip', () => {
  trackPlayerInRoom('rc-room-1', 'paddione');
  assert.strictEqual(wasPreviouslyInRoom('rc-room-1', 'paddione'), true);
  assert.strictEqual(wasPreviouslyInRoom('rc-room-1', 'gekko'), false);
});

test('shouldRejectReconnect: phase=active + previously joined → reject', () => {
  const room = 'rc-room-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  trackPlayerInRoom(room, 'paddione');
  const decision = shouldRejectReconnect(room, 'paddione');
  assert.strictEqual(decision.reject, true);
  assert.strictEqual(decision.code, 409);
  assert.match(decision.message!, /aktiver Runde/i);
});

test('shouldRejectReconnect: phase=warmup → allow even with prior join', () => {
  const room = 'rc-room-3';
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  trackPlayerInRoom(room, 'paddione');
  const decision = shouldRejectReconnect(room, 'paddione');
  assert.strictEqual(decision.reject, false);
});

test('shouldRejectReconnect: phase=active + first-time join → reject', () => {
  const room = 'rc-room-4';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  // No trackPlayerInRoom — first attempt
  const decision = shouldRejectReconnect(room, 'newcomer');
  assert.strictEqual(decision.reject, true, 'first join during active also forbidden');
});

test('shouldRejectReconnect: no session → allow (legacy room)', () => {
  const decision = shouldRejectReconnect('rc-room-no-session', 'anyone');
  assert.strictEqual(decision.reject, false);
});
