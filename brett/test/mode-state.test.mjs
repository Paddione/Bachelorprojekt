import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModeState } from '../public/assets/mode-state.mjs';

test('default mode is coaching', () => {
  const ms = createModeState({ storage: new Map() });
  assert.equal(ms.current(), 'coaching');
});

test('persisted loadout overrides defaults', () => {
  const storage = new Map([['brett.loadout', JSON.stringify({ melee: 'katana', ranged: 'handgun' })]]);
  const ms = createModeState({ storage });
  assert.equal(ms.loadout().melee, 'katana');
});

test('setMode emits change event', () => {
  let last = null;
  const ms = createModeState({ storage: new Map() });
  ms.on('change', m => { last = m; });
  ms.setMode('ffa');
  assert.equal(last, 'ffa');
});

test('stub modes do not change state', () => {
  const ms = createModeState({ storage: new Map() });
  const result = ms.setMode('teams');
  assert.equal(result, false);
  assert.equal(ms.current(), 'coaching');
});

test('mayhem-solo is a valid mode', () => {
  let last = null;
  const ms = createModeState({ storage: new Map() });
  ms.on('change', m => { last = m; });
  const result = ms.setMode('mayhem-solo');
  assert.equal(result, true);
  assert.equal(ms.current(), 'mayhem-solo');
  assert.equal(last, 'mayhem-solo');
});
