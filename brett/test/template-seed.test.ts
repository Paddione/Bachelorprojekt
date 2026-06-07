import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  figures,
} from '../src/server/index';

const { seedFiguresFromTemplate } = figures;

// D6 — Pure template figure-seeder. Replaces the non-sentinel figure set with the
// template's figures; sentinels (e.g. __session_phase__) are preserved.

test('seedFiguresFromTemplate replaces figures and preserves sentinels', () => {
  const room = 'template-seed-d6';
  // Stale figure + a session-phase sentinel.
  applyMutation(room, { type: 'add', figure: { id: 'stale', x: 9, z: 9, facingY: 0 } });
  applyMutation(room, { type: 'session_phase_set', phase: 'lobby' });

  seedFiguresFromTemplate(room, {
    figures: [
      { id: 'a', x: 1, z: 2, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } },
      { id: 'b', x: 3, z: 4, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } },
    ],
  });

  const state = buildStateFromMutations(room);
  const ids = state.figures.map((f: any) => f.id).sort();
  assert.deepStrictEqual(ids, ['a', 'b']);
  assert.ok(!ids.includes('stale'), 'stale figure must be gone');
  // Sentinel preserved.
  assert.strictEqual(state.sessionPhase, 'lobby');
});

test('seedFiguresFromTemplate tolerates an empty/missing figure list', () => {
  const room = 'template-seed-empty';
  applyMutation(room, { type: 'add', figure: { id: 'old', x: 0, z: 0, facingY: 0 } });
  seedFiguresFromTemplate(room, {});
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures.length, 0);
});
