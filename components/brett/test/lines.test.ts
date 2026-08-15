// brett/test/lines.test.ts — Meilenstein 4 / T000467
// Unit-Tests für applyMutation (line_*) + buildStateFromMutations + seedFigureMapFromState
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMutation,
  buildStateFromMutations,
  figures,
} from '../src/server/index';

const APP = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

// ── line_create ──────────────────────────────────────────────────────────────
test('line_create: adds a line to __lines__ sentinel', () => {
  const room = 'lines-create-1';
  applyMutation(room, { type: 'add', figure: { id: 'fa', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fb', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'l1', fromId: 'fa', toId: 'fb', lineType: 'relationship' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0].id, 'l1');
  assert.equal(state.lines[0].lineType, 'relationship');
});

test('line_create: fromId === toId is ignored (self-line prevention)', () => {
  const room = 'lines-self';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'lx', fromId: 'f1', toId: 'f1', lineType: 'tension' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines?.length ?? 0, 0, 'self-line must not be stored');
});

test('line_create: cap at 100 lines per room', () => {
  const room = 'lines-cap';
  applyMutation(room, { type: 'add', figure: { id: 'ca', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'cb', x: 1, z: 1, facingY: 0, appearance: APP } });
  for (let i = 0; i < 105; i++) {
    applyMutation(room, { type: 'line_create', id: `lc${i}`, fromId: 'ca', toId: 'cb', lineType: 'relationship' });
  }
  const state = buildStateFromMutations(room);
  assert.ok(state.lines.length <= 100, 'must not exceed 100 lines');
});

// ── line_delete ──────────────────────────────────────────────────────────────
test('line_delete: removes the targeted line', () => {
  const room = 'lines-delete-1';
  applyMutation(room, { type: 'add', figure: { id: 'fx', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fy', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'ld1', fromId: 'fx', toId: 'fy', lineType: 'tension' });
  applyMutation(room, { type: 'line_create', id: 'ld2', fromId: 'fx', toId: 'fy', lineType: 'resource' });
  applyMutation(room, { type: 'line_delete', lineId: 'ld1' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0].id, 'ld2');
});

test('line_delete: deleting non-existent line is a no-op', () => {
  const room = 'lines-delete-noop';
  applyMutation(room, { type: 'line_delete', lineId: 'ghost' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines?.length ?? 0, 0, 'no-op on missing line');
});

// ── line_type_set ────────────────────────────────────────────────────────────
test('line_type_set: updates the lineType of an existing line', () => {
  const room = 'lines-type-1';
  applyMutation(room, { type: 'add', figure: { id: 'fa2', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fb2', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'lt1', fromId: 'fa2', toId: 'fb2', lineType: 'relationship' });
  applyMutation(room, { type: 'line_type_set', lineId: 'lt1', lineType: 'tension' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines[0].lineType, 'tension');
});

// ── figure delete cascades to lines ─────────────────────────────────────────
test('figure delete removes all lines referencing that figure', () => {
  const room = 'lines-cascade';
  applyMutation(room, { type: 'add', figure: { id: 'fc1', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fc2', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fc3', x: 2, z: 2, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'lca', fromId: 'fc1', toId: 'fc2', lineType: 'tension' });
  applyMutation(room, { type: 'line_create', id: 'lcb', fromId: 'fc2', toId: 'fc3', lineType: 'resource' });
  applyMutation(room, { type: 'line_create', id: 'lcc', fromId: 'fc1', toId: 'fc3', lineType: 'relationship' });
  // Lösche fc2 — sollte lca und lcb entfernen, lcc bleibt
  applyMutation(room, { type: 'delete', id: 'fc2' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines.length, 1, 'only lcc should survive');
  assert.equal(state.lines[0].id, 'lcc');
});

// ── buildStateFromMutations — lines Feld ────────────────────────────────────
test('buildStateFromMutations: lines absent when no lines created → undefined or []', () => {
  const room = 'lines-empty';
  applyMutation(room, { type: 'add', figure: { id: 'fe', x: 0, z: 0, facingY: 0, appearance: APP } });
  const state = buildStateFromMutations(room);
  assert.ok(!state.lines || state.lines.length === 0, 'lines should be empty when none created');
});

// ── seedFigureMapFromState — Round-Trip ──────────────────────────────────────
test('seedFigureMapFromState: lines survive build→seed→build round-trip', () => {
  const roomA = 'lines-rt-A';
  applyMutation(roomA, { type: 'add', figure: { id: 'r1', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(roomA, { type: 'add', figure: { id: 'r2', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(roomA, { type: 'line_create', id: 'lr1', fromId: 'r1', toId: 'r2', lineType: 'tension' });

  const persisted = buildStateFromMutations(roomA);
  assert.equal(persisted.lines.length, 1);

  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, persisted);
  figures.figureMaps.set('lines-rt-B', freshMap);

  const rebuilt = buildStateFromMutations('lines-rt-B');
  assert.equal(rebuilt.lines.length, 1);
  assert.equal(rebuilt.lines[0].id, 'lr1');
  assert.equal(rebuilt.lines[0].lineType, 'tension');
  assert.equal(rebuilt.lines[0].fromId, 'r1');
  assert.equal(rebuilt.lines[0].toId, 'r2');
});
