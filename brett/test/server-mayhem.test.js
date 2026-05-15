'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { applyMutation, buildStateFromMutations, RELAY_TYPES, lmsAlive, handleLmsDeath } = require('../server.js');

test('mutation: mayhem_mode enabled', () => {
  const room = 'test-room-1';
  applyMutation(room, { type: 'mayhem_mode', enabled: true });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.mayhem, true);
});

test('mutation: mayhem_mode disabled', () => {
  const room = 'test-room-2';
  applyMutation(room, { type: 'mayhem_mode', enabled: false });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.mayhem, false);
});

test('handleDisconnect: emits player_leave when ws had a _playerId', () => {
  const broadcasts = [];
  const fakeBroadcast = (room, msg) => broadcasts.push({ room, msg });
  const ws = { _room: 'test-room-3', _playerId: 'p-abc' };
  const { handleDisconnect } = require('../server.js');
  handleDisconnect(ws, fakeBroadcast);
  const leave = broadcasts.find(b => b.msg.type === 'player_leave');
  assert.ok(leave, 'expected player_leave broadcast');
  assert.strictEqual(leave.msg.playerId, 'p-abc');
});

test('RELAY_TYPES: includes new combat and game-mode types', () => {
  const expected = ['hit', 'hp_update', 'player_death', 'player_respawn', 'obstacle_layout', 'game_mode_change'];
  for (const t of expected) {
    assert.ok(RELAY_TYPES.includes(t), `RELAY_TYPES should include '${t}'`);
  }
});

test('mutation: game_mode_change persists mode in state', () => {
  const room = 'test-room-gm-1';
  applyMutation(room, { type: 'game_mode_change', mode: 'lms' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.gameMode, 'lms');
});

test('handleLmsDeath: removes dead player from alive set', () => {
  const room = 'test-lms-1';
  lmsAlive.set(room, new Set(['p1', 'p2', 'p3']));
  const result = handleLmsDeath(room, 'p2');
  assert.strictEqual(result.winner, null);
  assert.strictEqual(result.draw, false);
  assert.ok(!lmsAlive.get(room).has('p2'), 'p2 should be removed');
});

test('handleLmsDeath: declares winner when one player remains', () => {
  const room = 'test-lms-2';
  lmsAlive.set(room, new Set(['p1', 'p2']));
  const result = handleLmsDeath(room, 'p2');
  assert.strictEqual(result.winner, 'p1');
  assert.strictEqual(result.draw, false);
});

test('handleLmsDeath: declares draw when last two die simultaneously', () => {
  const room = 'test-lms-3';
  lmsAlive.set(room, new Set(['p1']));
  const result = handleLmsDeath(room, 'p1');
  assert.strictEqual(result.winner, null);
  assert.strictEqual(result.draw, true);
});
