// brett/test/possession.test.ts — D-spec: Possession/Observer
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
  canMutate,
  resolveRole,
  wsHandler,
} from '../src/server/index';

const { gateMutation } = wsHandler as any;

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function figureById(room: string, id: string): any {
  return buildStateFromMutations(room).figures.find((f: any) => f.id === id);
}

function gateDeps() {
  return { buildStateFromMutations, figureMaps, canMutate, resolveRole };
}

// ── figure_possess ──────────────────────────────────────────────────

test('D: figure_possess sets possessor on free figure', () => {
  const room = 'possess-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  assert.strictEqual(figureById(room, 'f1').possessor, 'u1');
});

test('D: figure_possess on already-possessed figure is a no-op (gate)', () => {
  const room = 'possess-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  // Second possess by u2 should NOT overwrite
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u2' });
  assert.strictEqual(figureById(room, 'f1').possessor, 'u1', 'first possessor sticks');
});

test('D: figure_possess on non-existent figure is a no-op', () => {
  const room = 'possess-ghost';
  applyMutation(room, { type: 'figure_possess', figureId: 'ghost', playerId: 'u1' });
  assert.strictEqual(buildStateFromMutations(room).figures.length, 0);
});

// ── figure_release ──────────────────────────────────────────────────

test('D: figure_release clears possessor when player matches', () => {
  const room = 'release-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  applyMutation(room, { type: 'figure_release', figureId: 'f1', playerId: 'u1' });
  assert.strictEqual(figureById(room, 'f1').possessor, null);
});

test('D: figure_release by wrong player does NOT clear possessor', () => {
  const room = 'release-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  applyMutation(room, { type: 'figure_release', figureId: 'f1', playerId: 'u2' });
  assert.strictEqual(figureById(room, 'f1').possessor, 'u1', 'wrong player cannot release');
});

// ── figure_release_all ──────────────────────────────────────────────

test('D: figure_release_all clears all possessions for a player', () => {
  const room = 'release-all';
  for (const id of ['f1', 'f2', 'f3']) {
    applyMutation(room, { type: 'add', figure: { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  }
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  applyMutation(room, { type: 'figure_possess', figureId: 'f2', playerId: 'u1' });
  applyMutation(room, { type: 'figure_possess', figureId: 'f3', playerId: 'u2' });
  applyMutation(room, { type: 'figure_release_all', playerId: 'u1' });
  assert.strictEqual(figureById(room, 'f1').possessor, null);
  assert.strictEqual(figureById(room, 'f2').possessor, null);
  assert.strictEqual(figureById(room, 'f3').possessor, 'u2', 'other player untouched');
});

// ── Snapshot carries possessor ──────────────────────────────────────

test('D: buildStateFromMutations includes possessor in figure objects', () => {
  const room = 'snap-possessor';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures[0].possessor, 'u1');
});

// ── canMutate ───────────────────────────────────────────────────────

test('D canMutate: beobachter may figure_possess (transition Observer → possessor)', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_possess', role: 'beobachter', playerId: 'u-beob', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

test('D canMutate: beobachter may figure_release', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_release', role: 'beobachter', playerId: 'u-beob', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

test('D canMutate: beobachter may NOT move (still read-only for other writes)', () => {
  assert.strictEqual(canMutate({ msgType: 'move', role: 'beobachter', playerId: 'u-beob', figureOwnerId: null, allowRepresentativeAdd: false }), false);
});

test('D canMutate: stellvertreter may NOT figure_possess', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_possess', role: 'stellvertreter', playerId: 'u-stellv', figureOwnerId: 'u-stellv', allowRepresentativeAdd: false }), false);
});

test('D canMutate: leiter may figure_possess', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_possess', role: 'leiter', playerId: 'u-leiter', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

test('D canMutate: leiter may figure_release', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_release', role: 'leiter', playerId: 'u-leiter', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

// ── figure_type_set ─────────────────────────────────────────────────

test('D: figure_type_set writes figureType', () => {
  const room = 'ftype-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_type_set', figureId: 'f1', figureType: 'saboteur' });
  assert.strictEqual(figureById(room, 'f1').figureType, 'saboteur');
});

test('D: figure_type_set on non-existent figure is a no-op', () => {
  const room = 'ftype-ghost';
  applyMutation(room, { type: 'figure_type_set', figureId: 'ghost', figureType: 'coachee' });
  assert.strictEqual(buildStateFromMutations(room).figures.length, 0);
});

// ── Gate tests ──────────────────────────────────────────────────────

test('D gate: beobachter figure_possess is allowed through gate', () => {
  const room = 'gate-possess-beob';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'roles_set', roles: { 'u-beob': 'beobachter' } });
  const deps = gateDeps();
  const beobWs = { _session: { userId: 'u-beob' } };
  assert.strictEqual(gateMutation(beobWs, room, 'figure_possess', 'f1', deps), true, 'beobachter may possess free figure');
});

test('D gate: beobachter figure_release is allowed through gate', () => {
  const room = 'gate-release-beob';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u-beob' });
  applyMutation(room, { type: 'roles_set', roles: { 'u-beob': 'beobachter' } });
  const deps = gateDeps();
  const beobWs = { _session: { userId: 'u-beob' } };
  assert.strictEqual(gateMutation(beobWs, room, 'figure_release', 'f1', deps), true, 'beobachter may release own figure');
});

// ── E4/E5: pov-camera switchPov + meta mode (T001931) ────────────────
import * as THREE from 'three';
import * as povCamera from '../src/client/pov-camera';
import { STATE, setScene } from '../src/client/state';

function fakeFig(id: string): any {
  const root = new THREE.Object3D();
  const head = new THREE.Object3D();
  head.position.set(0, 1.6, 0);
  root.add(head);
  return { id, label: id, color: '#c8a96e', root, bones: { head } };
}

test('E5: switchPov targets the new figure id', () => {
  setScene({ renderer: {} as any, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), floor: {} as any });
  STATE.figures.length = 0;
  STATE.figures.push(fakeFig('pa'), fakeFig('pb'));
  povCamera.startPov('pa');
  assert.strictEqual(povCamera.getPovFigureId(), 'pa');
  povCamera.switchPov('pb');
  assert.strictEqual(povCamera.getPovFigureId(), 'pb', 'switchPov possesses the new figure');
  povCamera.stopPov();
});

test('E4: setPovMode("meta") reports meta active while possessed', () => {
  setScene({ renderer: {} as any, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), floor: {} as any });
  STATE.figures.length = 0;
  STATE.figures.push(fakeFig('pm'));
  povCamera.startPov('pm');
  assert.strictEqual(povCamera.isMeta(), false, 'startet in first-person');
  povCamera.setPovMode('meta');
  assert.strictEqual(povCamera.isMeta(), true, 'meta aktiv');
  assert.strictEqual(povCamera.getPovMode(), 'meta');
  povCamera.stopPov();
  assert.strictEqual(povCamera.isMeta(), false, 'nach stopPov kein meta');
});
