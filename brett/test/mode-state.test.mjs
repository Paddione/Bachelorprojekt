import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModeState } from '../public/assets/mode-state.mjs';

test('default mode is coaching', () => {
  const ms = createModeState({ storage: new Map() });
  assert.equal(ms.current(), 'coaching');
});

test('setMode emits change event', () => {
  let last = null;
  const ms = createModeState({ storage: new Map() });
  ms.on('change', m => { last = m; });
  ms.setMode('coaching');
  assert.equal(last, 'coaching');
});

test('invalid modes do not change state', () => {
  const ms = createModeState({ storage: new Map() });
  const result = ms.setMode('ffa');
  assert.equal(result, false);
  assert.equal(ms.current(), 'coaching');
});

test('setMode("mayhem") is accepted', () => {
  const state = createModeState({ storage: { getItem: () => null, setItem: () => {} } });
  assert.strictEqual(state.setMode('mayhem'), true);
  assert.strictEqual(state.current(), 'mayhem');
});
