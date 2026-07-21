// brett/test/figure-drag.test.ts — T002050
// Unit coverage for the pure figure-drag helpers (body drag + 360° rotation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGrabOffset, applyGrabOffset, angleAround, rotateFacing,
  normalizeAngle, degToRad, radToDeg, edgeTabVisible, shouldSend,
} from '../src/client/figure-drag.ts';

test('grab-offset keeps the figure under the cursor without jumping', () => {
  const off = computeGrabOffset({ x: 2, z: 3 }, { x: 1.5, z: 2 });
  assert.deepEqual(applyGrabOffset({ x: 2, z: 3 }, off), { x: 1.5, z: 2 });
});

test('edgeTabVisible is true only with a selection and a closed panel', () => {
  assert.equal(edgeTabVisible('f1', true), true);
  assert.equal(edgeTabVisible(null, true), false);
  assert.equal(edgeTabVisible('f1', false), false);
  assert.equal(edgeTabVisible(null, false), false);
});

test('rotation degree round-trip and wrap', () => {
  assert.ok(Math.abs(radToDeg(degToRad(270)) - 270) < 1e-9);
  assert.ok(Math.abs(normalizeAngle(rotateFacing(0, 0, Math.PI * 3)) - Math.PI) < 1e-9);
});

test('normalizeAngle wraps negative and large radians into [0, 2π)', () => {
  const twoPi = Math.PI * 2;
  assert.ok(normalizeAngle(-Math.PI / 2) >= 0);
  assert.ok(normalizeAngle(-Math.PI / 2) < twoPi);
  assert.ok(Math.abs(normalizeAngle(twoPi * 2.5) - Math.PI) < 1e-9);
});

test('rotateFacing accumulates the pointer angular delta onto the start facing', () => {
  assert.ok(Math.abs(rotateFacing(0.2, 1.0, 1.5) - 0.7) < 1e-9);
});

test('angleAround matches the facingY convention (atan2(dx, dz))', () => {
  const root = { x: 0, z: 0 };
  assert.ok(Math.abs(angleAround(root, { x: 0, z: 1 }) - 0) < 1e-9);
  assert.ok(Math.abs(angleAround(root, { x: 1, z: 0 }) - Math.PI / 2) < 1e-9);
});

test('shouldSend enforces the ~33ms throttle boundary', () => {
  assert.equal(shouldSend(1033, 1000, 33), true);
  assert.equal(shouldSend(1020, 1000, 33), false);
  assert.equal(shouldSend(1000, 1000, 33), false);
});
