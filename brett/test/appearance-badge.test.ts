import { test } from 'node:test';
import assert from 'node:assert';
import { ndcToScreen, badgeVisible } from '../src/client/ui/appearance-badge';

test('ndcToScreen maps NDC [-1,1] to pixel coordinates', () => {
  // Center of NDC maps to center of viewport.
  assert.deepStrictEqual(ndcToScreen(0, 0, 800, 600), { x: 400, y: 300 });
  // Top-right NDC (1,1) maps to (width, 0) — y is flipped.
  assert.deepStrictEqual(ndcToScreen(1, 1, 800, 600), { x: 800, y: 0 });
  // Bottom-left NDC (-1,-1) maps to (0, height).
  assert.deepStrictEqual(ndcToScreen(-1, -1, 800, 600), { x: 0, y: 600 });
});

test('badgeVisible requires a selection and an on-screen, in-front projection', () => {
  assert.strictEqual(badgeVisible('fig-1', 0.5), true);   // selected, in front (z<1)
  assert.strictEqual(badgeVisible(null, 0.5), false);     // no selection
  assert.strictEqual(badgeVisible('fig-1', 1.5), false);  // behind camera (z>1)
});
