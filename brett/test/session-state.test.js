// brett/test/session-state.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  applyMutation,
  buildStateFromMutations,
  transitionPhase,
  figureMaps,
} = require('../server.js');

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
