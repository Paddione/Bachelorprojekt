// brett/test/figure-owner.test.ts — Phase C / C1 + C6
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  orphanFiguresForUser,
} from '../src/server/index';

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function figureById(room: string, id: string): any {
  return buildStateFromMutations(room).figures.find((f: any) => f.id === id);
}

// ── C1: ownerId is server-authoritative ──────────────────────────────────────

test('C1: client-supplied ownerId on add is stripped (like id)', () => {
  const room = 'fowner-add';
  applyMutation(room, {
    type: 'add',
    figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE, ownerId: 'attacker' },
  });
  assert.strictEqual(figureById(room, 'f1').ownerId, undefined,
    'client ownerId must never land on add');
});

test('C1: client-supplied ownerId on update is stripped, other changes apply', () => {
  const room = 'fowner-update';
  applyMutation(room, {
    type: 'add',
    figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE },
  });
  applyMutation(room, { type: 'update', id: 'f1', changes: { ownerId: 'attacker', x: 5 } });
  const f = figureById(room, 'f1');
  assert.strictEqual(f.x, 5, 'safe change applies');
  assert.strictEqual(f.ownerId, undefined, 'client ownerId must never land on update');
});

test('C1: figure_owner_set writes ownerId, tolerates null (unassign)', () => {
  const room = 'fowner-set';
  applyMutation(room, {
    type: 'add',
    figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE },
  });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: 'beob-1' });
  assert.strictEqual(figureById(room, 'f1').ownerId, 'beob-1');
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: null });
  assert.strictEqual(figureById(room, 'f1').ownerId, null);
});

test('C1: figure_owner_set against a non-existent figure is a no-op', () => {
  const room = 'fowner-noop';
  applyMutation(room, { type: 'figure_owner_set', figureId: 'ghost', ownerId: 'beob-1' });
  assert.strictEqual(buildStateFromMutations(room).figures.length, 0,
    'no phantom figure created');
});

// ── C6: owner-orphan handling ────────────────────────────────────────────────

test('C6: orphanFiguresForUser nulls only the leaver-owned figures', () => {
  const room = 'orphan-1';
  for (const id of ['f1', 'f2', 'f3']) {
    applyMutation(room, { type: 'add', figure: { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  }
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: 'beob-1' });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f2', ownerId: 'beob-1' });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f3', ownerId: 'beob-2' });

  const changed = orphanFiguresForUser(room, 'beob-1');
  assert.deepStrictEqual([...changed].sort(), ['f1', 'f2']);
  assert.strictEqual(figureById(room, 'f1').ownerId, null);
  assert.strictEqual(figureById(room, 'f2').ownerId, null);
  assert.strictEqual(figureById(room, 'f3').ownerId, 'beob-2', 'other owner untouched');
});

test('C6: orphanFiguresForUser for an unknown user changes nothing', () => {
  const room = 'orphan-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: 'beob-1' });
  const changed = orphanFiguresForUser(room, 'nobody');
  assert.deepStrictEqual(changed, []);
  assert.strictEqual(figureById(room, 'f1').ownerId, 'beob-1', 'unchanged');
});
