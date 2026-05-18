'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const { isAdminFromClaims, RELAY_TYPES, applyMutation, buildStateFromMutations, figureMaps } = require('../server.js');

test('isAdminFromClaims: true when admin role present', () => {
  const claims = { realm_access: { roles: ['offline_access', 'admin', 'uma_authorization'] } };
  assert.strictEqual(isAdminFromClaims(claims), true);
});

test('isAdminFromClaims: false when admin role missing', () => {
  const claims = { realm_access: { roles: ['offline_access'] } };
  assert.strictEqual(isAdminFromClaims(claims), false);
});

test('isAdminFromClaims: false for null/undefined/empty claims', () => {
  assert.strictEqual(isAdminFromClaims(null), false);
  assert.strictEqual(isAdminFromClaims(undefined), false);
  assert.strictEqual(isAdminFromClaims({}), false);
});

test('RELAY_TYPES: includes bot_spawn, bot_despawn, round_reset', () => {
  assert.ok(RELAY_TYPES.includes('bot_spawn'),   'bot_spawn missing');
  assert.ok(RELAY_TYPES.includes('bot_despawn'), 'bot_despawn missing');
  assert.ok(RELAY_TYPES.includes('round_reset'), 'round_reset missing');
});

test('admin_mayhem_toggle: applyMutation sets mayhem enabled', () => {
  const room = 'admin-ws-test-1';
  applyMutation(room, { type: 'mayhem_mode', enabled: true });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.mayhem, true);
});

test('admin_mode_set: applyMutation sets gameMode to deathmatch', () => {
  const room = 'admin-ws-test-2';
  applyMutation(room, { type: 'game_mode_change', mode: 'deathmatch' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.gameMode, 'deathmatch');
});
