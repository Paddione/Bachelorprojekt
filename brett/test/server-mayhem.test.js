'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { applyMutation, buildStateFromMutations } = require('../server.js');

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
