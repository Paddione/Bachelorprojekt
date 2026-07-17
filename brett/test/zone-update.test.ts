// brett/test/zone-update.test.ts — E1 (T001931)
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations, wsHandler } from '../src/server/index';

test('ADMIN_TYPES enthält zone_update', () => {
  assert.ok(wsHandler.ADMIN_TYPES.has('zone_update'), 'zone_update in ADMIN_TYPES');
});

test('zone_update: definierte Felder werden gemerged, andere bleiben', () => {
  const room = 'zu-test-1';
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', width: 2, height: 2, label: 'A', color: '#4ea1ff', opacity: 0.25, id: 'z1' } });
  applyMutation(room, { type: 'zone_update', zoneId: 'z1', x: 5, width: 4, label: 'B', variant: 'frame' });
  const z = buildStateFromMutations(room).zones[0];
  assert.strictEqual(z.x, 5, 'x aktualisiert');
  assert.strictEqual(z.width, 4, 'width aktualisiert');
  assert.strictEqual(z.label, 'B', 'label aktualisiert');
  assert.strictEqual(z.variant, 'frame', 'variant gesetzt');
  // Unveränderte Felder bleiben intakt.
  assert.strictEqual(z.z, 0, 'z unberührt');
  assert.strictEqual(z.height, 2, 'height unberührt');
  assert.strictEqual(z.color, '#4ea1ff', 'color unberührt');
  assert.strictEqual(z.opacity, 0.25, 'opacity unberührt');
});

test('zone_update: unbekannte zoneId ist ein No-Op (keine Phantom-Zone)', () => {
  const room = 'zu-test-2';
  applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', id: 'z1' } });
  applyMutation(room, { type: 'zone_update', zoneId: 'ghost', x: 99 });
  const zones = buildStateFromMutations(room).zones;
  assert.strictEqual(zones.length, 1, 'keine Zone hinzugefügt');
  assert.strictEqual(zones[0].x, 0, 'existierende Zone unberührt');
});

test('zone_update: opacity-only Update erhält Geometrie', () => {
  const room = 'zu-test-3';
  applyMutation(room, { type: 'zone_create', zone: { x: 1, z: 2, shape: 'circle', radius: 3, id: 'z1' } });
  applyMutation(room, { type: 'zone_update', zoneId: 'z1', opacity: 0.8 });
  const z = buildStateFromMutations(room).zones[0];
  assert.strictEqual(z.opacity, 0.8);
  assert.strictEqual(z.radius, 3, 'radius unberührt');
  assert.strictEqual(z.shape, 'circle');
});
