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

test('shouldRejectReconnect: phase=active + first-time join → admit (late-joiner)', () => {
  const room = 'rc-room-4';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  // No trackPlayerInRoom — genuine first attempt = real late-joiner → admit.
  const decision = shouldRejectReconnect(room, 'newcomer');
  assert.strictEqual(decision.reject, false, 'real late-joiner during active is admitted');
});

test('shouldRejectReconnect: phase=paused + first-time join → admit (late-joiner)', () => {
  const room = 'rc-room-4b';
  applyMutation(room, { type: 'session_phase_set', phase: 'paused' });
  const decision = shouldRejectReconnect(room, 'newcomer');
  assert.strictEqual(decision.reject, false);
});

test('shouldRejectReconnect: phase=lobby → admit', () => {
  const room = 'rc-room-lobby';
  applyMutation(room, { type: 'session_phase_set', phase: 'lobby' });
  trackPlayerInRoom(room, 'paddione');
  const decision = shouldRejectReconnect(room, 'paddione');
  assert.strictEqual(decision.reject, false);
});

test('shouldRejectReconnect: phase=ended → reject (410)', () => {
  const room = 'rc-room-ended';
  applyMutation(room, { type: 'session_phase_set', phase: 'ended' });
  const decision = shouldRejectReconnect(room, 'paddione');
  assert.strictEqual(decision.reject, true);
  assert.strictEqual(decision.code, 410);
});

test('shouldRejectReconnect: null playerId during active → admit (server null, matrix-safe)', () => {
  const room = 'rc-room-null';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const decision = shouldRejectReconnect(room, null);
  assert.strictEqual(decision.reject, false, 'unknown player = not previously in room → admit');
});

test('shouldRejectReconnect: no session → allow (legacy room)', () => {
  const decision = shouldRejectReconnect('rc-room-no-session', 'anyone');
  assert.strictEqual(decision.reject, false);
});
