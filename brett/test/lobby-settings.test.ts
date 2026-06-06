import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  figures,
} from '../src/server/index';

// D3 — `__lobby_settings__` sentinel persistence. Phase B added the case as an
// OVERWRITE; D3 upgrades it to a shallow MERGE so setting one field never
// clobbers the others, and re-asserts the SPECIAL/emit + persist→seed roundtrip.

test('lobby_settings_set merges fields (does not overwrite)', () => {
  const room = 'lobby-settings-merge';
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId: 't1' } });
  applyMutation(room, { type: 'lobby_settings_set', settings: { maxParticipants: 8, allowRepresentativeAdd: true } });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.lobbySettings, {
    templateId: 't1',
    maxParticipants: 8,
    allowRepresentativeAdd: true,
  });
});

test('__lobby_settings__ is excluded from the figures array', () => {
  const room = 'lobby-settings-exclude';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0 } });
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId: 'x' } });
  const state = buildStateFromMutations(room);
  assert.ok(state.figures.every((f: any) => f.id !== '__lobby_settings__'));
  assert.strictEqual(state.figures.length, 1);
});

test('non-object settings is ignored (no merge, no clobber)', () => {
  const room = 'lobby-settings-invalid';
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId: 't1' } });
  applyMutation(room, { type: 'lobby_settings_set', settings: 'nope' });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.lobbySettings, { templateId: 't1' });
});

test('lobbySettings survives the persist→seed roundtrip', () => {
  const room = 'lobby-settings-roundtrip';
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId: 't1', maxParticipants: 6 } });
  const built = buildStateFromMutations(room);

  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, built);
  figures.figureMaps.set('lobby-settings-roundtrip-2', freshMap);
  const rebuilt = buildStateFromMutations('lobby-settings-roundtrip-2');
  assert.deepStrictEqual(rebuilt.lobbySettings, { templateId: 't1', maxParticipants: 6 });
});
