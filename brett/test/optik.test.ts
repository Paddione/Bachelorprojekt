import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations } from '../src/server/index';
import type { OptikSettings } from '../src/types/state';

// D2 — Repair of the dead `optik` seam (§4.1). The board-optik state is now
// written via the privileged `optik_set` mutation and exercised against the REAL
// server applyMutation / buildStateFromMutations (replaces the self-contained
// reimplementation in tests/unit/brett-optik-server.js).

test('optik_set stores the OptikSettings under __optik__', () => {
  const room = 'optik-d2-store';
  const settings: OptikSettings = { floor: 'felt-green', sky: 'dusk', lightMood: 'warm' };
  applyMutation(room, { type: 'optik_set', settings });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.optik, settings);
});

test('__optik__ is excluded from the figures array', () => {
  const room = 'optik-d2-exclude';
  applyMutation(room, { type: 'add', figure: { id: 'fig1', x: 0, z: 0, facingY: 0 } });
  applyMutation(room, { type: 'optik_set', settings: { floor: 'slate', sky: 'day', lightMood: 'neutral' } });
  const state = buildStateFromMutations(room);
  assert.ok(state.figures.every((f: any) => f.id !== '__optik__'));
  assert.strictEqual(state.figures.length, 1);
  assert.strictEqual(state.figures[0].id, 'fig1');
});

test('clear removes the __optik__ entry', () => {
  const room = 'optik-d2-clear';
  applyMutation(room, { type: 'optik_set', settings: { floor: 'wood-dark', sky: 'calm', lightMood: 'cool' } });
  applyMutation(room, { type: 'clear' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.optik, undefined);
});

test('non-object settings is ignored (no __optik__ written)', () => {
  const room = 'optik-d2-invalid';
  applyMutation(room, { type: 'optik_set', settings: 'not-an-object' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.optik, undefined);
});

test('unset optik → result.optik === undefined', () => {
  const room = 'optik-d2-unset';
  applyMutation(room, { type: 'add', figure: { id: 'fig1', x: 1, z: 2, facingY: 0 } });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.optik, undefined);
});
