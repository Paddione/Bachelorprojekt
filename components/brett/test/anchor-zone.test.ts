// brett/test/anchor-zone.test.ts — T000468
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations, figures, wsHandler } from '../src/server/index';

// ── anchor_create ────────────────────────────────────────────────────────────

test('anchor_create: Anker wird korrekt angelegt', () => {
  const room = 'az-test-ac-1';
  applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: 3, label: 'Start', color: '#c8a96e' } });
  const state = buildStateFromMutations(room);
  assert.ok(Array.isArray(state.anchors), 'state.anchors ist ein Array');
  assert.strictEqual(state.anchors.length, 1);
  const a = state.anchors[0];
  assert.strictEqual(typeof a.id, 'string', 'ID wurde generiert');
  assert.ok(a.id.length >= 1, 'ID ist nicht leer');
  assert.strictEqual(a.x, 2);
  assert.strictEqual(a.z, 3);
  assert.strictEqual(a.label, 'Start');
  assert.strictEqual(a.color, '#c8a96e');
});

test('anchor_create: Mehrere Anker kumulieren', () => {
  const room = 'az-test-ac-2';
  applyMutation(room, { type: 'anchor_create', anchor: { x: 1, z: 1 } });
  applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: 2 } });
  applyMutation(room, { type: 'anchor_create', anchor: { x: 3, z: 3 } });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.anchors.length, 3, 'drei Anker vorhanden');
});

test('anchor_create: ungültige Payload wird ignoriert', () => {
  const room = 'az-test-ac-3';
  applyMutation(room, { type: 'anchor_create', anchor: null });
  applyMutation(room, { type: 'anchor_create' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.anchors.length, 0, 'ungültige Payloads werden ignoriert');
});

// ── anchor_delete ────────────────────────────────────────────────────────────

test('anchor_delete: Anker wird entfernt, andere bleiben', () => {
  const room = 'az-test-ad-1';
  applyMutation(room, { type: 'anchor_create', anchor: { x: 1, z: 1, id: 'a1' } });
  applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: 2, id: 'a2' } });
  applyMutation(room, { type: 'anchor_delete', anchorId: 'a1' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.anchors.length, 1, 'nur noch ein Anker übrig');
  assert.strictEqual(state.anchors[0].x, 2, 'richtiger Anker geblieben');
});

test('anchor_delete: unbekannte ID ist ein No-Op', () => {
  const room = 'az-test-ad-2';
  applyMutation(room, { type: 'anchor_create', anchor: { x: 5, z: 5 } });
  applyMutation(room, { type: 'anchor_delete', anchorId: 'nonexistent' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.anchors.length, 1, 'Anker unberührt bei unbekannter ID');
});

// ── zone_create ───────────────────────────────────────────────────────────────

test('zone_create: Rechteck-Zone wird korrekt angelegt', () => {
  const room = 'az-test-zc-1';
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', width: 3, height: 2, label: 'Ressourcen', color: '#4ea1ff', opacity: 0.3 } });
  const state = buildStateFromMutations(room);
  assert.ok(Array.isArray(state.zones), 'state.zones ist ein Array');
  assert.strictEqual(state.zones.length, 1);
  const z = state.zones[0];
  assert.strictEqual(typeof z.id, 'string', 'ID wurde generiert');
  assert.strictEqual(z.shape, 'rect');
  assert.strictEqual(z.width, 3);
  assert.strictEqual(z.height, 2);
  assert.strictEqual(z.label, 'Ressourcen');
  assert.strictEqual(z.color, '#4ea1ff');
  assert.strictEqual(z.opacity, 0.3);
});

test('zone_create: Kreis-Zone wird korrekt angelegt', () => {
  const room = 'az-test-zc-2';
  applyMutation(room, { type: 'zone_create', zone: { x: 1, z: -1, shape: 'circle', radius: 2.5, color: '#3fb950' } });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.zones.length, 1);
  assert.strictEqual(state.zones[0].shape, 'circle');
  assert.strictEqual(state.zones[0].radius, 2.5);
});

test('zone_create: ungültige Payload wird ignoriert', () => {
  const room = 'az-test-zc-3';
  applyMutation(room, { type: 'zone_create', zone: null });
  applyMutation(room, { type: 'zone_create' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.zones.length, 0, 'ungültige Payloads werden ignoriert');
});

// ── zone_delete ───────────────────────────────────────────────────────────────

test('zone_delete: Zone wird entfernt, andere bleiben', () => {
  const room = 'az-test-zd-1';
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', id: 'z1' } });
  applyMutation(room, { type: 'zone_create', zone: { x: 5, z: 5, shape: 'circle', id: 'z2' } });
  applyMutation(room, { type: 'zone_delete', zoneId: 'z1' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.zones.length, 1, 'nur noch eine Zone übrig');
  assert.strictEqual(state.zones[0].shape, 'circle', 'richtige Zone geblieben');
});

test('zone_delete: unbekannte ID ist ein No-Op', () => {
  const room = 'az-test-zd-2';
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect' } });
  applyMutation(room, { type: 'zone_delete', zoneId: 'nonexistent' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.zones.length, 1, 'Zone unberührt bei unbekannter ID');
});

// ── buildStateFromMutations ────────────────────────────────────────────────────

test('buildStateFromMutations: anchors und zones immer als Array (auch wenn leer)', () => {
  const room = 'az-test-bs-1';
  // Kein Anker/Zone angelegt
  const state = buildStateFromMutations(room);
  assert.ok(state === null || Array.isArray(state?.anchors), 'anchors ist Array oder State ist null');
  // Mit einem Eintrag
  applyMutation(room, { type: 'anchor_create', anchor: { x: 0, z: 0 } });
  const state2 = buildStateFromMutations(room);
  assert.ok(Array.isArray(state2.anchors));
  assert.ok(Array.isArray(state2.zones));
  assert.strictEqual(state2.zones.length, 0, 'zones leer wenn keine Zone angelegt');
});

test('buildStateFromMutations: anchors/zones sind kein Sentinel-Figure', () => {
  const room = 'az-test-bs-2';
  applyMutation(room, { type: 'anchor_create', anchor: { x: 1, z: 1 } });
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'circle' } });
  const state = buildStateFromMutations(room);
  // figures darf keine __anchors__ / __zones__ enthalten
  const figIds = state.figures.map((f: any) => f.id);
  assert.ok(!figIds.includes('__anchors__'), '__anchors__ darf nicht in figures auftauchen');
  assert.ok(!figIds.includes('__zones__'), '__zones__ darf nicht in figures auftauchen');
});

// ── Persistenz-Round-Trip ─────────────────────────────────────────────────────

test('seedFigureMapFromState: anchors und zones überleben build → seed → build', () => {
  const room = 'az-test-rt-1';
  applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: -1, label: 'Anker A', color: '#c8a96e', id: 'rt-a1' } });
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', width: 4, height: 3, label: 'Zone B', color: '#4ea1ff', id: 'rt-z1' } });

  const persisted = buildStateFromMutations(room);
  assert.strictEqual(persisted.anchors.length, 1);
  assert.strictEqual(persisted.zones.length, 1);

  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, persisted);
  figures.figureMaps.set('az-test-rt-1-b', freshMap);

  const rebuilt = buildStateFromMutations('az-test-rt-1-b');
  assert.strictEqual(rebuilt.anchors.length, 1, 'Anker nach Round-Trip vorhanden');
  assert.strictEqual(rebuilt.anchors[0].id, 'rt-a1');
  assert.strictEqual(rebuilt.anchors[0].label, 'Anker A');
  assert.strictEqual(rebuilt.zones.length, 1, 'Zone nach Round-Trip vorhanden');
  assert.strictEqual(rebuilt.zones[0].id, 'rt-z1');
  assert.strictEqual(rebuilt.zones[0].label, 'Zone B');
  assert.strictEqual(rebuilt.zones[0].width, 4);
});

test('seedFigureMapFromState: leere anchors/zones werden nicht als Sentinel gesetzt', () => {
  const room = 'az-test-rt-2';
  // State ohne Anker/Zonen
  applyMutation(room, { type: 'stiffness', value: 0.5 });
  const persisted = buildStateFromMutations(room);
  assert.ok(Array.isArray(persisted.anchors) && persisted.anchors.length === 0);

  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, persisted);
  // __anchors__ sollte NICHT gesetzt sein, wenn keine vorhanden
  assert.strictEqual(freshMap.get('__anchors__'), undefined, '__anchors__ nicht gesetzt wenn leer');
  assert.strictEqual(freshMap.get('__zones__'), undefined, '__zones__ nicht gesetzt wenn leer');
});

// ── ADMIN_TYPES Guard ─────────────────────────────────────────────────────────

test('ADMIN_TYPES enthält alle vier anchor/zone Typen', () => {
  const { ADMIN_TYPES } = wsHandler;
  assert.ok(ADMIN_TYPES.has('anchor_create'), 'anchor_create in ADMIN_TYPES');
  assert.ok(ADMIN_TYPES.has('anchor_delete'), 'anchor_delete in ADMIN_TYPES');
  assert.ok(ADMIN_TYPES.has('zone_create'), 'zone_create in ADMIN_TYPES');
  assert.ok(ADMIN_TYPES.has('zone_delete'), 'zone_delete in ADMIN_TYPES');
});
