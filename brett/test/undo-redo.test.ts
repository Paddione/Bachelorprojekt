// brett/test/undo-redo.test.ts — T000470: Undo/Redo Mutations-Stack Unit-Tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
  undoStackModule,
} from '../src/server/index';

const {
  captureBeforeSnapshot,
  captureAfterSnapshot,
  pushUndo,
  performUndo,
  performRedo,
  getUndoStatus,
  clearStacks,
  UNDO_LIMIT,
} = undoStackModule;

const APPEARANCE = {
  face: null,
  body: 'adult-average',
  accessories: { head: null, upper: null, feet: null },
};

function freshFig(id: string, extra: any = {}): any {
  return { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE, ...extra };
}

// ── Grundlegendes Stack-Verhalten ────────────────────────────────────────────

test('undo-redo: Stack ist leer bei unbekanntem Raum', () => {
  const status = getUndoStatus('room-nonexistent');
  assert.equal(status.canUndo, false);
  assert.equal(status.canRedo, false);
  assert.equal(status.undoCount, 0);
  assert.equal(status.redoCount, 0);
});

test('undo-redo: pushUndo erhöht undoCount', () => {
  const room = 'ur-push-1';
  applyMutation(room, { type: 'add', figure: freshFig('f1') });
  const before = captureBeforeSnapshot(room, { type: 'move', id: 'f1' }, figureMaps);
  applyMutation(room, { type: 'move', id: 'f1', x: 2, z: 3, facingY: 0 });
  const after = captureAfterSnapshot(before, figureMaps, room, { type: 'move', id: 'f1' });
  pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });
  assert.equal(getUndoStatus(room).undoCount, 1);
});

test('undo-redo: Stack wird auf UNDO_LIMIT getrimmt', () => {
  const room = 'ur-trim-1';
  applyMutation(room, { type: 'add', figure: freshFig('f1') });
  for (let i = 0; i < UNDO_LIMIT + 5; i++) {
    const before = captureBeforeSnapshot(room, { type: 'move', id: 'f1' }, figureMaps);
    applyMutation(room, { type: 'move', id: 'f1', x: i, z: 0, facingY: 0 });
    const after = captureAfterSnapshot(before, figureMaps, room, { type: 'move', id: 'f1' });
    pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });
  }
  assert.equal(getUndoStatus(room).undoCount, UNDO_LIMIT, 'Stack bleibt bei UNDO_LIMIT');
});

// ── Undo: move ────────────────────────────────────────────────────────────────

test('undo-redo: move → Undo restauriert vorherige Position', () => {
  const room = 'ur-move-1';
  applyMutation(room, { type: 'add', figure: freshFig('f1', { x: 1, z: 2 }) });

  const before = captureBeforeSnapshot(room, { type: 'move', id: 'f1' }, figureMaps);
  applyMutation(room, { type: 'move', id: 'f1', x: 5, z: 7, facingY: 0 });
  const after = captureAfterSnapshot(before, figureMaps, room, { type: 'move', id: 'f1' });
  pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });

  // Verifizieren: figure ist jetzt bei (5, 7)
  const stateAfter = buildStateFromMutations(room);
  assert.equal(stateAfter.figures.find((f: any) => f.id === 'f1').x, 5);

  // Undo ausführen
  const result = performUndo(room, figureMaps);
  assert.equal(result.applied, true);

  // Figur muss wieder bei (1, 2) sein (Startwert beim freshFig + add-Normalisierung)
  const stateUndone = buildStateFromMutations(room);
  const fig = stateUndone.figures.find((f: any) => f.id === 'f1');
  assert.ok(fig, 'Figur muss existieren nach Undo');
  assert.equal(fig.x, 1);
  assert.equal(fig.z, 2);
});

// ── Undo: add (Figur löschen) ─────────────────────────────────────────────────

test('undo-redo: add → Undo entfernt die Figur', () => {
  const room = 'ur-add-1';
  const msg = { type: 'add', figure: freshFig('f-add') };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'add', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).figures.length, 1, 'Figur existiert nach add');
  performUndo(room, figureMaps);
  assert.equal(buildStateFromMutations(room).figures.length, 0, 'Figur weg nach Undo-add');
});

// ── Undo: delete (Figur restaurieren) ────────────────────────────────────────

test('undo-redo: delete → Undo restauriert die Figur', () => {
  const room = 'ur-del-1';
  applyMutation(room, { type: 'add', figure: freshFig('f-del', { x: 3, z: 4 }) });
  const msg = { type: 'delete', id: 'f-del' };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'delete', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).figures.length, 0, 'Figur weg nach delete');
  performUndo(room, figureMaps);
  const fig = buildStateFromMutations(room).figures.find((f: any) => f.id === 'f-del');
  assert.ok(fig, 'Figur nach Undo-delete wieder vorhanden');
  assert.equal(fig.x, 3);
});

// ── Undo: clear ────────────────────────────────────────────────────────────────

test('undo-redo: clear → Undo restauriert alle Figuren', () => {
  const room = 'ur-clear-1';
  applyMutation(room, { type: 'add', figure: freshFig('fc1') });
  applyMutation(room, { type: 'add', figure: freshFig('fc2') });
  applyMutation(room, { type: 'add', figure: freshFig('fc3') });

  const msg = { type: 'clear' };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'clear', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).figures.length, 0, 'Board leer nach clear');
  performUndo(room, figureMaps);
  assert.equal(buildStateFromMutations(room).figures.length, 3, 'Alle 3 Figuren nach Undo-clear');
});

// ── Redo ──────────────────────────────────────────────────────────────────────

test('undo-redo: Undo dann Redo restauriert letzten Zustand', () => {
  const room = 'ur-redo-1';
  applyMutation(room, { type: 'add', figure: freshFig('fr1', { x: 0, z: 0 }) });

  const msg = { type: 'move', id: 'fr1', x: 8, z: 9, facingY: 0 };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });

  // Undo → Figur bei (0, 0)
  performUndo(room, figureMaps);
  const stateUndone = buildStateFromMutations(room);
  assert.equal(stateUndone.figures.find((f: any) => f.id === 'fr1').x, 0);

  // Redo → Figur wieder bei (8, 9)
  const redoResult = performRedo(room, figureMaps);
  assert.equal(redoResult.applied, true);
  const stateRedone = buildStateFromMutations(room);
  assert.equal(stateRedone.figures.find((f: any) => f.id === 'fr1').x, 8);
  assert.equal(stateRedone.figures.find((f: any) => f.id === 'fr1').z, 9);
});

test('undo-redo: Neue Mutation löscht Redo-Stack', () => {
  const room = 'ur-redo-clear-1';
  applyMutation(room, { type: 'add', figure: freshFig('frx') });

  const msg1 = { type: 'move', id: 'frx', x: 1, z: 0, facingY: 0 };
  const before1 = captureBeforeSnapshot(room, msg1, figureMaps);
  applyMutation(room, msg1);
  const after1 = captureAfterSnapshot(before1, figureMaps, room, msg1);
  pushUndo(room, { before: before1, after: after1, mutationType: 'move', ts: Date.now() });

  performUndo(room, figureMaps);
  assert.equal(getUndoStatus(room).canRedo, true, 'canRedo nach Undo');

  // Neue Mutation löscht Redo
  const msg2 = { type: 'move', id: 'frx', x: 99, z: 0, facingY: 0 };
  const before2 = captureBeforeSnapshot(room, msg2, figureMaps);
  applyMutation(room, msg2);
  const after2 = captureAfterSnapshot(before2, figureMaps, room, msg2);
  pushUndo(room, { before: before2, after: after2, mutationType: 'move', ts: Date.now() });

  assert.equal(getUndoStatus(room).canRedo, false, 'Redo-Stack nach neuer Mutation leer');
});

// ── Undo auf leerem Stack ──────────────────────────────────────────────────────

test('undo-redo: performUndo auf leerem Stack → { applied: false }', () => {
  const room = 'ur-empty-1';
  const result = performUndo(room, figureMaps);
  assert.equal(result.applied, false);
});

test('undo-redo: performRedo auf leerem Redo-Stack → { applied: false }', () => {
  const room = 'ur-empty-redo-1';
  const result = performRedo(room, figureMaps);
  assert.equal(result.applied, false);
});

// ── stiffness Undo-bar ────────────────────────────────────────────────────────

test('undo-redo: stiffness → Undo restauriert alten Wert', () => {
  const room = 'ur-stiff-1';
  applyMutation(room, { type: 'stiffness', value: 0.5 });

  const msg = { type: 'stiffness', value: 0.9 };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'stiffness', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).stiffness, 0.9, 'stiffness nach Mutation');
  performUndo(room, figureMaps);
  assert.equal(buildStateFromMutations(room).stiffness, 0.5, 'stiffness nach Undo');
});

// ── clearStacks ───────────────────────────────────────────────────────────────

test('undo-redo: clearStacks entfernt beide Stacks', () => {
  const room = 'ur-cleanup-1';
  applyMutation(room, { type: 'add', figure: freshFig('fclean') });
  const msg = { type: 'delete', id: 'fclean' };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'delete', ts: Date.now() });

  assert.equal(getUndoStatus(room).canUndo, true);
  clearStacks(room);
  assert.equal(getUndoStatus(room).canUndo, false);
  assert.equal(getUndoStatus(room).canRedo, false);
});

// ── UNDOABLE_TYPES enthält erwartete Typen ────────────────────────────────────

test('undo-redo: UNDOABLE_TYPES enthält alle erwarteten Typen', () => {
  const expected = ['add', 'move', 'update', 'delete', 'clear', 'stiffness', 'snapshot', 'figure_type_set'];
  for (const t of expected) {
    assert.ok(undoStackModule.UNDOABLE_TYPES.has(t), `UNDOABLE_TYPES muss ${t} enthalten`);
  }
});

test('undo-redo: UNDOABLE_TYPES enthält figure_possess NICHT', () => {
  assert.equal(undoStackModule.UNDOABLE_TYPES.has('figure_possess'), false);
});

test('undo-redo: UNDOABLE_TYPES enthält session_phase_set NICHT', () => {
  assert.equal(undoStackModule.UNDOABLE_TYPES.has('session_phase_set'), false);
});
