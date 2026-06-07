// brett/test/admin-spotlight.test.ts — T000471: Spotlight/Dim/Freeze
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
  seedFigureMapFromState,
} from '../src/server/index';

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function moderation(room: string) {
  return buildStateFromMutations(room)?.moderation ?? { spotlight: null, dim: null, freeze: false };
}

// ── applyMutation: moderation_spotlight_set ──────────────────────────────────

test('moderation_spotlight_set: sets spotlight figureId', () => {
  const room = 'sdf-spotlight-1';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  assert.strictEqual(moderation(room).spotlight, 'f1');
});

test('moderation_spotlight_set: null clears spotlight', () => {
  const room = 'sdf-spotlight-2';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: null });
  assert.strictEqual(moderation(room).spotlight, null);
});

test('moderation_spotlight_set: does not affect dim or freeze', () => {
  const room = 'sdf-spotlight-3';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f2' });
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  const m = moderation(room);
  assert.strictEqual(m.spotlight, 'f1');
  assert.strictEqual(m.dim, 'f2');
  assert.strictEqual(m.freeze, true);
});

// ── applyMutation: moderation_dim_set ───────────────────────────────────────

test('moderation_dim_set: sets dim figureId independently', () => {
  const room = 'sdf-dim-1';
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f3' });
  const m = moderation(room);
  assert.strictEqual(m.dim, 'f3');
  assert.strictEqual(m.spotlight, null);
  assert.strictEqual(m.freeze, false);
});

test('moderation_dim_set: null clears dim', () => {
  const room = 'sdf-dim-2';
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f3' });
  applyMutation(room, { type: 'moderation_dim_set', figureId: null });
  assert.strictEqual(moderation(room).dim, null);
});

// ── applyMutation: moderation_freeze_set ────────────────────────────────────

test('moderation_freeze_set: sets freeze to true', () => {
  const room = 'sdf-freeze-1';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  assert.strictEqual(moderation(room).freeze, true);
});

test('moderation_freeze_set: sets freeze to false', () => {
  const room = 'sdf-freeze-2';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: false });
  assert.strictEqual(moderation(room).freeze, false);
});

test('moderation_freeze_set: does not affect spotlight or dim', () => {
  const room = 'sdf-freeze-3';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f2' });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const m = moderation(room);
  assert.strictEqual(m.spotlight, 'f1');
  assert.strictEqual(m.dim, 'f2');
  assert.strictEqual(m.freeze, true);
});

// ── buildStateFromMutations: moderation exponiert ───────────────────────────

test('buildStateFromMutations: moderation absent → null (no sentinel set)', () => {
  const room = 'sdf-state-absent';
  // Raum ohne Moderation-Sentinel
  applyMutation(room, { type: 'add', figure: { id: 'f0', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  const state = buildStateFromMutations(room);
  assert.ok(!state.moderation || state.moderation.spotlight === null, 'no spotlight without sentinel');
});

test('buildStateFromMutations: moderation.freeze survives setzen + lesen', () => {
  const room = 'sdf-state-freeze';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  assert.strictEqual(buildStateFromMutations(room).moderation.freeze, true);
});

// ── seedFigureMapFromState: Moderation DB-Roundtrip ─────────────────────────

test('seedFigureMapFromState: moderation state survives roundtrip', () => {
  const room = 'sdf-seed-1';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'fig-x' });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const state = buildStateFromMutations(room);
  // Simulate DB roundtrip: clear map, seed from persisted state
  figureMaps.delete(room);
  const newMap = new Map<string, any>();
  seedFigureMapFromState(newMap, state);
  figureMaps.set(room, newMap);
  const restored = moderation(room);
  assert.strictEqual(restored.spotlight, 'fig-x');
  assert.strictEqual(restored.freeze, true);
});
