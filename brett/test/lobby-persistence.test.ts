// brett/test/lobby-persistence.test.ts — Phase B / B3
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations } from '../src/server/index';

test('roles_set + lobby_settings_set round-trip via buildStateFromMutations', () => {
  const room = 'lobby-persist-1';
  applyMutation(room, { type: 'roles_set', roles: { u1: 'leiter', u2: 'beobachter' } });
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId: 'fam5', allowRepresentativeAdd: false } });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.roles.u1, 'leiter');
  assert.strictEqual(state.roles.u2, 'beobachter');
  assert.strictEqual(state.lobbySettings.templateId, 'fam5');
  assert.strictEqual(state.lobbySettings.allowRepresentativeAdd, false);
});

test('__roles__ / __lobby_settings__ sentinels do not leak into figures', () => {
  const room = 'lobby-persist-2';
  applyMutation(room, { type: 'roles_set', roles: { u1: 'leiter' } });
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId: 't1' } });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures.length, 0, 'sentinels must not leak into figures');
});

test('roles_set ignores non-object payloads', () => {
  const room = 'lobby-persist-3';
  applyMutation(room, { type: 'roles_set', roles: null });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.roles, undefined);
});
