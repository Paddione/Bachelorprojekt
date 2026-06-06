'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const { isAdminFromClaims, RELAY_TYPES, applyMutation, buildStateFromMutations } = require('../server.js');

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

test('RELAY_TYPES: contains only coaching/figure types, no Mayhem types', () => {
  for (const t of ['mayhem_mode','game_mode_change','hit','player_death','vehicle_spawn','hero_select','duel_start','bot_spawn']) {
    assert.ok(!RELAY_TYPES.includes(t), `RELAY_TYPES must not include ${t}`);
  }
  for (const t of ['add','move','update','delete','clear','optik','stiffness']) {
    assert.ok(RELAY_TYPES.includes(t), `RELAY_TYPES must include ${t}`);
  }
});

test('applyMutation: coaching steps round-trip through state', () => {
  const room = 'admin-ws-test-coaching';
  applyMutation(room, { type: 'coaching_steps_set', steps: ['a', 'b'], index: 1 });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.coachingSteps, { steps: ['a', 'b'], index: 1 });
});
