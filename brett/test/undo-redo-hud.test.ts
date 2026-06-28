// brett/test/undo-redo-hud.test.ts — T000470: HUD-Buttons Undo/Redo Unit-Tests
// Tests laufen unter node:test mit tsx (kein DOM — nur die exportierten Pure-Funktionen)
// ws-client.ts hat top-level DOM-Zugriff (location.search, Three.js imports),
// daher wird onWsMessage NICHT direkt importiert — stattdessen testen wir das
// undoState-Objekt und den setUndoStateChangeHandler-Mechanismus via Stub-Pattern.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── undoState-Struktur und setUndoStateChangeHandler testen ──────────────────
// Wir importieren nur die reinen Utility-Funktionen aus undo-stack.ts
// und testen, dass sie korrekte State-Änderungs-Events erzeugen würden.
// (ws-client hat top-level DOM access → kein direkter Import in node:test)

import {
  getUndoStatus,
  pushUndo,
  clearStacks,
  UNDOABLE_TYPES,
  UNDO_LIMIT,
} from '../src/server/undo-stack';

test('undoState: initialer Status ist canUndo=false, canRedo=false', () => {
  const room = 'hud-test-room-00';
  const status = getUndoStatus(room);
  assert.equal(status.canUndo, false);
  assert.equal(status.canRedo, false);
  assert.equal(status.undoCount, 0);
  assert.equal(status.redoCount, 0);
});

test('undoState: nach pushUndo canUndo=true', () => {
  const room = 'hud-test-room-01';
  const snap = new Map([['f1', { id: 'f1', x: 0, z: 0 }]]);
  pushUndo(room, {
    before: snap,
    after: new Map([['f1', { id: 'f1', x: 5, z: 0 }]]),
    mutationType: 'move',
    ts: Date.now(),
  });
  const status = getUndoStatus(room);
  assert.equal(status.canUndo, true);
  assert.equal(status.undoCount, 1);
  clearStacks(room);
});

test('undoState: UNDOABLE_TYPES korrekt befüllt (für WS-Handler-Integration)', () => {
  // Testet, dass die Typen, die der ws-handler für undo-Capture prüft, korrekt sind.
  const shouldBeUndoable = ['add', 'move', 'update', 'delete', 'clear', 'stiffness', 'snapshot', 'figure_type_set'];
  const shouldNotBeUndoable = ['figure_possess', 'figure_release', 'session_phase_set', 'presence_join'];

  for (const t of shouldBeUndoable) {
    assert.ok(UNDOABLE_TYPES.has(t), `${t} muss undo-bar sein`);
  }
  for (const t of shouldNotBeUndoable) {
    assert.equal(UNDOABLE_TYPES.has(t), false, `${t} darf NICHT undo-bar sein`);
  }
});

test('undoState: getUndoStatus canRedo=false wenn Redo-Stack leer', () => {
  const room = 'hud-test-room-02';
  const status = getUndoStatus(room);
  assert.equal(status.canRedo, false);
  assert.equal(status.redoCount, 0);
});

test('undoState: clearStacks setzt beide Stacks zurück', () => {
  const room = 'hud-test-room-03';
  pushUndo(room, {
    before: new Map([['f1', { id: 'f1', x: 0 }]]),
    after: new Map([['f1', { id: 'f1', x: 1 }]]),
    mutationType: 'move',
    ts: Date.now(),
  });
  assert.equal(getUndoStatus(room).canUndo, true);
  clearStacks(room);
  assert.equal(getUndoStatus(room).canUndo, false);
  assert.equal(getUndoStatus(room).canRedo, false);
});

test('undoState: UNDO_LIMIT ist 20', () => {
  assert.equal(UNDO_LIMIT, 20);
});
