// brett/test/figure-label.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { applyMutation, buildStateFromMutations } = require('../server.js');

test('label rides along on add and persists', () => {
  const room = 'label-test-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, label: 'Mutter' } });
  assert.strictEqual(buildStateFromMutations(room).figures.find((f) => f.id === 'f1').label, 'Mutter');
});
test('label updates via update.changes', () => {
  const room = 'label-test-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'update', id: 'f1', changes: { label: 'Vater' } });
  assert.strictEqual(buildStateFromMutations(room).figures.find((f) => f.id === 'f1').label, 'Vater');
});
