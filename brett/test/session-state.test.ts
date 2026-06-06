// brett/test/session-state.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  transitionPhase,
  figureMaps,
  handleAdminSessionCreate,
  handleAdminRoundStop,
  handleAdminRoundPause,
} from '../src/server/index';

test('SPECIAL array excludes session sentinel keys from figures list', () => {
  const room = 'session-state-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  applyMutation(room, { type: 'session_code_set', code: 'KRB-9A2' });
  applyMutation(room, { type: 'session_admin_token_set', playerId: 'paddione' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures.length, 0, 'sentinels must not leak into figures');
  assert.strictEqual(state.sessionPhase, 'warmup');
  assert.strictEqual(state.sessionCode, 'KRB-9A2');
  assert.strictEqual(state.adminTokenHolder, 'paddione');
});

test('transitionPhase: warmup → active is allowed', () => {
  const room = 'session-state-test-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  const result = transitionPhase(room, 'active');
  assert.strictEqual(result.ok, true);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.sessionPhase, 'active');
});

test('transitionPhase: ended → anything is a no-op', () => {
  const room = 'session-state-test-3';
  applyMutation(room, { type: 'session_phase_set', phase: 'ended' });
  const result = transitionPhase(room, 'active');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'terminal-phase');
});

test('transitionPhase: active ↔ paused round-trip preserves session', () => {
  const room = 'session-state-test-4';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  assert.strictEqual(transitionPhase(room, 'paused').ok, true);
  assert.strictEqual(transitionPhase(room, 'active').ok, true);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.sessionPhase, 'active');
});

test('admin_session_create: creates session with code + warmup phase + sets holder', () => {
  const room = 'session-create-test-1';
  const result = handleAdminSessionCreate(room, 'paddione');
  assert.strictEqual(result.ok, true);
  assert.match(result.code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.sessionPhase, 'warmup');
  assert.strictEqual(state.sessionCode, result.code);
  assert.strictEqual(state.adminTokenHolder, 'paddione');
});

test('admin_round_stop: transitions phase to ended, broadcasts session_ended', () => {
  const room = 'stop-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const broadcasts: any[] = [];
  const result = handleAdminRoundStop(room, (m: any) => broadcasts.push(m));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'ended');
  assert.ok(broadcasts.some((m: any) => m.type === 'session_phase_change' && m.phase === 'ended'));
  assert.ok(broadcasts.some((m: any) => m.type === 'session_ended'));
});

test('admin_round_pause: active → paused toggle, paused → active toggle', () => {
  const room = 'pause-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  handleAdminRoundPause(room, () => {});
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'paused');
  handleAdminRoundPause(room, () => {});
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'active');
});
