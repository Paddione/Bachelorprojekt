// brett/test/relay-gate.test.ts — Phase C / C5
import { test } from 'node:test';
import assert from 'node:assert';
import {
  RELAY_TYPES,
  applyMutation,
  buildStateFromMutations,
  figureMaps,
  canMutate,
  resolveRole,
  wsHandler,
} from '../src/server/index';

const { gateMutation } = wsHandler as any;

test('C5: jump is now in RELAY_TYPES (relayed, gated like move)', () => {
  assert.ok(RELAY_TYPES.includes('jump'), 'jump must be relayed');
});

test('C5: RELAY_TYPES still contains move (regression guard)', () => {
  assert.ok(RELAY_TYPES.includes('move'));
});

test('C5: RELAY_TYPES still contains request_state_snapshot', () => {
  assert.ok(RELAY_TYPES.includes('request_state_snapshot'));
});

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function gateDeps() {
  return { buildStateFromMutations, figureMaps, canMutate, resolveRole };
}

test('C5 gate: beobachter move is denied (forbidden), leiter move allowed', () => {
  const room = 'gate-beob';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'roles_set', roles: { 'u-leiter': 'leiter', 'u-beob': 'beobachter' } });
  const deps = gateDeps();

  const beobWs = { _session: { userId: 'u-beob' } };
  assert.strictEqual(gateMutation(beobWs, room, 'move', 'f1', deps), false, 'beobachter denied');

  const leiterWs = { _session: { userId: 'u-leiter' } };
  assert.strictEqual(gateMutation(leiterWs, room, 'move', 'f1', deps), true, 'leiter allowed');
});

test('C5 gate: stellvertreter move allowed only on own figure', () => {
  const room = 'gate-stellv';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'add', figure: { id: 'f2', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: 'u-stellv' });
  applyMutation(room, { type: 'roles_set', roles: { 'u-stellv': 'stellvertreter' } });
  const deps = gateDeps();
  const ws = { _session: { userId: 'u-stellv' } };

  assert.strictEqual(gateMutation(ws, room, 'move', 'f1', deps), true, 'own figure allowed');
  assert.strictEqual(gateMutation(ws, room, 'move', 'f2', deps), false, 'foreign figure denied');
});

test('C5 gate: snapshot is leiter-only (Default-Deny for stellvertreter)', () => {
  const room = 'gate-snap';
  applyMutation(room, { type: 'roles_set', roles: { 'u-stellv': 'stellvertreter' } });
  const deps = gateDeps();
  assert.strictEqual(gateMutation({ _session: { userId: 'u-stellv' } }, room, 'snapshot', undefined, deps), false);
});

test('C5 gate: request_state_snapshot is never denied (beobachter)', () => {
  const room = 'gate-read';
  applyMutation(room, { type: 'roles_set', roles: { 'u-beob': 'beobachter' } });
  const deps = gateDeps();
  assert.strictEqual(
    gateMutation({ _session: { userId: 'u-beob' } }, room, 'request_state_snapshot', undefined, deps),
    true,
  );
});

test('C5 gate: stellvertreter add gated by allowRepresentativeAdd (default false)', () => {
  const room = 'gate-add';
  applyMutation(room, { type: 'roles_set', roles: { 'u-stellv': 'stellvertreter' } });
  const deps = gateDeps();
  const ws = { _session: { userId: 'u-stellv' } };
  // No lobby settings yet → allowRepresentativeAdd defaults to false.
  assert.strictEqual(gateMutation(ws, room, 'add', 'newfig', deps), false, 'add denied without toggle');
  applyMutation(room, { type: 'lobby_settings_set', settings: { allowRepresentativeAdd: true } });
  assert.strictEqual(gateMutation(ws, room, 'add', 'newfig', deps), true, 'add allowed with toggle');
});

// ── REG-1 regression: legacy / no-session free board stays writable ──────────
// origin/main relayed every mutation on a `?room=` deep-link board (no session,
// no roles). The new canMutate chokepoint must NOT turn such boards globally
// read-only. The pre-existing gate tests all seed __roles__, so this regression
// was invisible — these tests drive the gate in a room with NEITHER a session
// code NOR any roles.
test('REG-1: room with NO session + NO roles → move is PERMITTED (legacy free board)', () => {
  const room = 'gate-legacy-free';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  const deps = gateDeps();
  // Any user — even an anonymous, session-less one — can mutate on a legacy board.
  const anonWs = { _playerId: 'anon-1' };
  assert.strictEqual(gateMutation(anonWs as any, room, 'move', 'f1', deps), true, 'move allowed on legacy board');
  const oidcWs = { _session: { userId: 'someone' } };
  assert.strictEqual(gateMutation(oidcWs, room, 'move', 'f1', deps), true, 'move allowed for any authed user too');
});

test('REG-1: room with NO session + NO roles → add is PERMITTED (legacy free board)', () => {
  const room = 'gate-legacy-free-add';
  const deps = gateDeps();
  const anonWs = { _playerId: 'anon-2' };
  assert.strictEqual(gateMutation(anonWs as any, room, 'add', 'newfig', deps), true, 'add allowed on legacy board');
});

test('REG-1: enforcement re-engages the moment roles exist (no bypass once sessioned)', () => {
  const room = 'gate-legacy-then-sessioned';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  const deps = gateDeps();
  const beobWs = { _session: { userId: 'u-beob' } };
  // Legacy: permitted.
  assert.strictEqual(gateMutation(beobWs, room, 'move', 'f1', deps), true, 'permitted while legacy');
  // Once roles are assigned (a session exists), the gate enforces again.
  applyMutation(room, { type: 'roles_set', roles: { 'u-beob': 'beobachter' } });
  assert.strictEqual(gateMutation(beobWs, room, 'move', 'f1', deps), false, 'enforced once roles exist');
});
