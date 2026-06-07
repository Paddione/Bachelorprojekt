import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, ensureFigureMap, seedFigureMapFromState, figureMaps } from '../src/server/figures';
import { canMutate } from '../src/server/permissions';
import { buildStateFromMutations, initPhases } from '../src/server/phases';

// Wire up phases (needed by buildStateFromMutations)
initPhases({ figureMaps, applyMutation });

// ── Test-Setup Hilfsfunktionen ────────────────────────────────────────────────

function makeRoom(roomId: string): string {
  const figs = ensureFigureMap(roomId);
  figs.clear();
  // Basis-Figuren anlegen
  applyMutation(roomId, { type: 'add', figure: { id: 'fig-1', x: 0, z: 0, facingY: 0, appearance: {} } });
  applyMutation(roomId, { type: 'add', figure: { id: 'fig-2', x: 1, z: 1, facingY: 0, appearance: {} } });
  // ownerId direkt setzen (server-autoritativ)
  applyMutation(roomId, { type: 'figure_owner_set', figureId: 'fig-2', ownerId: 'player-a' });
  return roomId;
}

// ── applyMutation: figure_note_set ───────────────────────────────────────────

test('applyMutation figure_note_set: setzt note auf existierende Figur', () => {
  const room = makeRoom('note-test-1');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'Ich sehe Weite.' });
  const fig = figureMaps.get(room)!.get('fig-1');
  assert.strictEqual(fig.note, 'Ich sehe Weite.');
});

test('applyMutation figure_note_set: kürzt auf 1000 Zeichen', () => {
  const room = makeRoom('note-test-2');
  const long = 'x'.repeat(2000);
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: long });
  const fig = figureMaps.get(room)!.get('fig-1');
  assert.strictEqual(fig.note!.length, 1000);
});

test('applyMutation figure_note_set: no-op bei unbekannter figureId', () => {
  const room = makeRoom('note-test-3');
  applyMutation(room, { type: 'figure_note_set', figureId: 'nonexistent', note: 'test' });
  // kein Fehler, figureMaps unverändert
  assert.ok(!figureMaps.get(room)!.has('nonexistent'));
});

test('applyMutation figure_note_set: leerer String löscht Notiz', () => {
  const room = makeRoom('note-test-4');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'erste Notiz' });
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: '' });
  const fig = figureMaps.get(room)!.get('fig-1');
  assert.strictEqual(fig.note, '');
});

// ── canMutate: figure_note_set ────────────────────────────────────────────────

type CtxInput = Parameters<typeof canMutate>[0];

function ctx(overrides: Partial<CtxInput>): CtxInput {
  return {
    msgType: 'figure_note_set',
    role: 'beobachter',
    playerId: 'me',
    figureOwnerId: null,
    allowRepresentativeAdd: false,
    ...overrides,
  };
}

test('canMutate figure_note_set: leiter → true (beliebige Figur)', () => {
  assert.strictEqual(canMutate(ctx({ role: 'leiter', figureOwnerId: null })), true);
  assert.strictEqual(canMutate(ctx({ role: 'leiter', figureOwnerId: 'other' })), true);
});

test('canMutate figure_note_set: stellvertreter eigene Figur → true', () => {
  assert.strictEqual(
    canMutate(ctx({ role: 'stellvertreter', playerId: 'me', figureOwnerId: 'me' })),
    true,
  );
});

test('canMutate figure_note_set: stellvertreter fremde Figur → false', () => {
  assert.strictEqual(
    canMutate(ctx({ role: 'stellvertreter', playerId: 'me', figureOwnerId: 'other' })),
    false,
  );
});

test('canMutate figure_note_set: stellvertreter null Owner → false', () => {
  assert.strictEqual(
    canMutate(ctx({ role: 'stellvertreter', playerId: 'me', figureOwnerId: null })),
    false,
  );
});

test('canMutate figure_note_set: beobachter → false', () => {
  assert.strictEqual(canMutate(ctx({ role: 'beobachter' })), false);
});

// ── buildStateFromMutations: note in figures ──────────────────────────────────

test('buildStateFromMutations: note erscheint in figures-Array', () => {
  const room = makeRoom('note-build-1');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'Perspektive: Norden.' });
  const state = buildStateFromMutations(room);
  const fig1 = state.figures.find((f: any) => f.id === 'fig-1');
  assert.ok(fig1, 'fig-1 muss in figures[] sein');
  assert.strictEqual(fig1.note, 'Perspektive: Norden.');
});

// ── seedFigureMapFromState: note wird re-hydriert ─────────────────────────────

test('seedFigureMapFromState: note wird korrekt re-hydriert', () => {
  const map = new Map<string, any>();
  const persistedState = {
    figures: [
      { id: 'f-1', x: 0, z: 0, facingY: 0, appearance: {}, note: 'Gespeicherte Notiz' },
      { id: 'f-2', x: 1, z: 1, facingY: 0, appearance: {} }, // keine Notiz
    ],
  };
  seedFigureMapFromState(map, persistedState);
  assert.strictEqual(map.get('f-1').note, 'Gespeicherte Notiz');
  assert.ok(map.has('f-2'));
  assert.strictEqual(map.get('f-2').note, undefined);
});

test('seedFigureMapFromState: note überlebt DB-Round-Trip ohne Verlust', () => {
  const room = makeRoom('note-seed-1');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'Round-Trip Test' });
  const state = buildStateFromMutations(room);
  // Simuliere DB-Round-Trip: neues Map aus gespeichertem State
  const freshMap = new Map<string, any>();
  seedFigureMapFromState(freshMap, state);
  const rehydrated = freshMap.get('fig-1');
  assert.strictEqual(rehydrated.note, 'Round-Trip Test');
});
