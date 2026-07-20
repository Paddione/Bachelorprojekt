// brett/test/board-dblclick.test.ts — T002006: dblclick floor action is always spawn.
import { test } from 'node:test';
import assert from 'node:assert';
import { dblclickFloorAction } from '../src/client/board-dblclick';

test('dblclickFloorAction always returns a spawn action', () => {
  const action = dblclickFloorAction({ x: 1.5, z: -2.25 });
  assert.strictEqual(action.kind, 'spawn');
});

test('dblclickFloorAction passes through the target coordinates', () => {
  const action = dblclickFloorAction({ x: 3, z: 4 });
  assert.strictEqual(action.x, 3);
  assert.strictEqual(action.z, 4);
});

test('dblclickFloorAction is independent of any external selection state', () => {
  // No selection concept is passed in at all — the function only knows the target.
  const a = dblclickFloorAction({ x: 0, z: 0 });
  const b = dblclickFloorAction({ x: 0, z: 0 });
  assert.deepStrictEqual(a, b);
});
