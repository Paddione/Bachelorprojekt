// brett/test/seed-figuremap.test.ts — Phase B / B4
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations, figures } from '../src/server/index';

test('seedFigureMapFromState re-seeds phase/figure/roles/settings (§4.6 round-trip)', () => {
  const roomA = 'seed-A';
  // Build a persisted state in room A.
  applyMutation(roomA, { type: 'session_phase_set', phase: 'lobby' });
  applyMutation(roomA, { type: 'session_code_set', code: 'KRB-9A2' });
  applyMutation(roomA, { type: 'add', figure: { id: 'f1', x: 1, z: 2, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } } });
  applyMutation(roomA, { type: 'roles_set', roles: { u1: 'leiter', u2: 'beobachter' } });
  applyMutation(roomA, { type: 'lobby_settings_set', settings: { templateId: 'fam5', maxParticipants: 8 } });
  applyMutation(roomA, { type: 'session_created_at_set', ts: '2026-06-06T10:00:00.000Z' });
  applyMutation(roomA, { type: 'session_last_activity_set', ts: '2026-06-06T10:05:00.000Z' });

  const persisted = buildStateFromMutations(roomA);
  // sanity: buildStateFromMutations emits sessionPhase, NOT phase
  assert.strictEqual(persisted.sessionPhase, 'lobby');
  assert.strictEqual(persisted.phase, undefined, 'buildStateFromMutations emits sessionPhase, not phase');

  // Seed into a fresh map and register it as room B.
  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, persisted);
  figures.figureMaps.set('seed-B', freshMap);

  const rebuilt = buildStateFromMutations('seed-B');
  assert.strictEqual(rebuilt.sessionPhase, 'lobby', 'phase survives build → seed → build');
  assert.strictEqual(rebuilt.sessionCode, 'KRB-9A2');
  assert.strictEqual(rebuilt.figures.length, 1);
  assert.strictEqual(rebuilt.figures[0].id, 'f1');
  assert.strictEqual(rebuilt.roles.u1, 'leiter');
  assert.strictEqual(rebuilt.lobbySettings.templateId, 'fam5');
  assert.strictEqual(rebuilt.sessionCreatedAt, '2026-06-06T10:00:00.000Z');
  assert.strictEqual(rebuilt.sessionLastActivity, '2026-06-06T10:05:00.000Z');
});

test('PD-1: board-optik survives the persist → seed → build round-trip', () => {
  const room = 'seed-optik-A';
  applyMutation(room, { type: 'optik_set', settings: { sky: 'dusk', lightMood: 'warm', floor: 'oak' } });
  const built = buildStateFromMutations(room);
  assert.deepStrictEqual(built.optik, { sky: 'dusk', lightMood: 'warm', floor: 'oak' }, 'optik present pre-roundtrip');

  // Simulate the last-leave → figureMaps.delete → next-join re-seed path.
  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, built);
  figures.figureMaps.set('seed-optik-B', freshMap);

  const rebuilt = buildStateFromMutations('seed-optik-B');
  assert.deepStrictEqual(
    rebuilt.optik,
    { sky: 'dusk', lightMood: 'warm', floor: 'oak' },
    'optik survives build → seed → build (PD-1: was silently dropped before)',
  );
});

test('seedFigureMapFromState reads sessionPhase (not phase) — DB-round-trip field names', () => {
  // Simulate a DB-round-tripped state (only the buildStateFromMutations field names present).
  const persisted = {
    figures: [{ id: 'g1', x: 0, z: 0, facingY: 0, appearance: {} }],
    sessionPhase: 'active',
    stiffness: 0.7,
  };
  const map = new Map<string, any>();
  figures.seedFigureMapFromState(map, persisted);
  figures.figureMaps.set('seed-C', map);
  const rebuilt = buildStateFromMutations('seed-C');
  assert.strictEqual(rebuilt.sessionPhase, 'active');
  assert.strictEqual(rebuilt.stiffness, 0.7);
});
