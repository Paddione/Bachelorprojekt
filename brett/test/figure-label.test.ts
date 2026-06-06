// brett/test/figure-label.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations } from '../src/server/index';

test('label rides along on add and persists', () => {
  const room = 'label-test-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, label: 'Mutter' } });
  assert.strictEqual(buildStateFromMutations(room).figures.find((f: any) => f.id === 'f1').label, 'Mutter');
});
test('label updates via update.changes', () => {
  const room = 'label-test-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'update', id: 'f1', changes: { label: 'Vater' } });
  assert.strictEqual(buildStateFromMutations(room).figures.find((f: any) => f.id === 'f1').label, 'Vater');
});
