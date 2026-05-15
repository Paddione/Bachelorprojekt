'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pool, server, applyMutation, buildStateFromMutations, handleDisconnect } = require('../server.js');

test.after(async () => {
  if (server) server.close();
  if (pool) await pool.end();
});

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
  handleDisconnect(ws, fakeBroadcast);
  const leave = broadcasts.find(b => b.msg.type === 'player_leave');
  assert.ok(leave, 'expected player_leave broadcast');
  assert.strictEqual(leave.msg.playerId, 'p-abc');
});
