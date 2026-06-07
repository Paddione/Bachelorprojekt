import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyTemplateToRoom,
  buildStateFromMutations,
} from '../src/server/index';

// D7 — Template apply orchestrator. Seeds the room server-authoritatively from
// the loaded snapshot state and broadcasts a `snapshot` of the seeded board so
// all clients render it. Server state is persisted (late-join safe).

test('applyTemplateToRoom seeds server state and broadcasts a snapshot', () => {
  const room = 'template-apply-d7';
  const collected: any[] = [];
  const collect = (m: any) => collected.push(m);

  applyTemplateToRoom(
    room,
    { figures: [{ id: 'x', x: 1, z: 2, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } }] },
    collect,
  );

  // Server state holds the template figures.
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures.length, 1);
  assert.strictEqual(state.figures[0].id, 'x');

  // A snapshot of the seeded board was broadcast.
  assert.strictEqual(collected.length, 1);
  assert.strictEqual(collected[0].type, 'snapshot');
  assert.strictEqual(collected[0].figures.length, 1);
  assert.strictEqual(collected[0].figures[0].id, 'x');
});

test('applyTemplateToRoom replaces a prior board', () => {
  const room = 'template-apply-replace';
  const { applyMutation } = require('../src/server/index');
  applyMutation(room, { type: 'add', figure: { id: 'old', x: 0, z: 0, facingY: 0 } });

  applyTemplateToRoom(
    room,
    { figures: [{ id: 'new', x: 5, z: 6, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } }] },
    () => {},
  );

  const ids = buildStateFromMutations(room).figures.map((f: any) => f.id);
  assert.deepStrictEqual(ids, ['new']);
});
