// brett/test/idle-timeout.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  applyMutation,
  buildStateFromMutations,
  touchSessionActivity,
  checkSessionIdle,
  checkAllSessions,
  figureMaps,
} = require('../server.js');

test('touchSessionActivity: updates __session_last_activity__', () => {
  const room = 'idle-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const before = buildStateFromMutations(room).sessionLastActivity;
  touchSessionActivity(room);
  const after = buildStateFromMutations(room).sessionLastActivity;
  assert.notStrictEqual(before, after);
});

test('checkSessionIdle: returns {ended:true} when no activity > 2 min', () => {
  const room = 'idle-test-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const oldTs = new Date(Date.now() - 200_000).toISOString(); // > 2 min
  applyMutation(room, { type: 'session_last_activity_set', ts: oldTs });
  const result = checkSessionIdle(room);
  assert.strictEqual(result.ended, true);
  assert.strictEqual(result.reason, 'idle-timeout');
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'ended');
});

test('checkSessionIdle: returns {ended:false} when within 2 min', () => {
  const room = 'idle-test-3';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  applyMutation(room, { type: 'session_last_activity_set', ts: new Date().toISOString() });
  const result = checkSessionIdle(room);
  assert.strictEqual(result.ended, false);
});

test('checkAllSessions: iterates and ends idle rooms only', () => {
  const idleRoom = 'idle-test-4-idle';
  const liveRoom = 'idle-test-4-live';
  applyMutation(idleRoom, { type: 'session_phase_set', phase: 'active' });
  applyMutation(idleRoom, { type: 'session_last_activity_set',
    ts: new Date(Date.now() - 300_000).toISOString() });
  applyMutation(liveRoom, { type: 'session_phase_set', phase: 'active' });
  applyMutation(liveRoom, { type: 'session_last_activity_set', ts: new Date().toISOString() });
  const results = checkAllSessions();
  const idleResult = results.find(r => r.room === idleRoom);
  const liveResult = results.find(r => r.room === liveRoom);
  assert.strictEqual(idleResult.ended, true);
  assert.strictEqual(liveResult?.ended ?? false, false);
});
