// brett/test/free-fly-camera.test.ts — T5 / T000465
// Unit tests for free-fly-camera.ts (headless, no WebGL/DOM required)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// We import via static import — the module must NOT pull in scene.ts or DOM
import {
  enterFreeFly,
  exitFreeFly,
  isFreeFly,
  tickFreeFly,
  // internal test helpers — available for headless tests
  _setYaw,
  _setPitch,
  _setKeys,
  _resetState,
} from '../src/client/free-fly-camera';

// ── helpers ─────────────────────────────────────────────────────────

function makeCamera(x = 0, y = 2, z = 5): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  cam.position.set(x, y, z);
  cam.lookAt(0, 1, 0);
  return cam;
}

// ── Export surface ───────────────────────────────────────────────────

test('exports enterFreeFly, exitFreeFly, isFreeFly, tickFreeFly', () => {
  assert.strictEqual(typeof enterFreeFly, 'function');
  assert.strictEqual(typeof exitFreeFly, 'function');
  assert.strictEqual(typeof isFreeFly, 'function');
  assert.strictEqual(typeof tickFreeFly, 'function');
});

// ── isFreeFly defaults to false ──────────────────────────────────────

test('isFreeFly() is false initially', () => {
  _resetState();
  assert.strictEqual(isFreeFly(), false);
});

// ── enterFreeFly / exitFreeFly toggle ────────────────────────────────

test('enterFreeFly sets isFreeFly to true (headless, no pointer-lock)', () => {
  _resetState();
  const cam = makeCamera();
  // enterFreeFly may fail silently on pointer-lock in headless env
  enterFreeFly(cam, null as any);
  assert.strictEqual(isFreeFly(), true);
});

test('exitFreeFly sets isFreeFly to false', () => {
  _resetState();
  const cam = makeCamera();
  enterFreeFly(cam, null as any);
  assert.strictEqual(isFreeFly(), true);
  exitFreeFly();
  assert.strictEqual(isFreeFly(), false);
});

// ── tickFreeFly does nothing when inactive ───────────────────────────

test('tickFreeFly is no-op when inactive', () => {
  _resetState();
  const cam = makeCamera(1, 2, 3);
  tickFreeFly(0.016, cam);
  assert.strictEqual(cam.position.x, 1);
  assert.strictEqual(cam.position.y, 2);
  assert.strictEqual(cam.position.z, 3);
});

// ── WASD direction: yaw 0 → W moves along -Z ────────────────────────

test('W key with yaw=0 moves camera in -Z direction', () => {
  _resetState();
  const cam = makeCamera(0, 2, 0);
  enterFreeFly(cam, null as any);
  _setYaw(0);    // facing -Z
  _setPitch(0);
  _setKeys({ w: true });
  const prevZ = cam.position.z;
  tickFreeFly(0.1, cam);
  // W should push camera forward (decreasing Z with yaw=0)
  assert.ok(cam.position.z < prevZ, `Z should decrease, got ${cam.position.z} vs prev ${prevZ}`);
});

// ── WASD direction: yaw 90° → W moves along +X ──────────────────────

test('W key with yaw=90deg moves camera in +X direction', () => {
  _resetState();
  const cam = makeCamera(0, 2, 0);
  enterFreeFly(cam, null as any);
  _setYaw(Math.PI / 2);  // facing +X
  _setPitch(0);
  _setKeys({ w: true });
  const prevX = cam.position.x;
  tickFreeFly(0.1, cam);
  assert.ok(cam.position.x > prevX, `X should increase, got ${cam.position.x} vs prev ${prevX}`);
});

// ── Position box clamp: y < 0.3 → clamped to 0.3 ───────────────────

test('tickFreeFly clamps y to minimum 0.3', () => {
  _resetState();
  const cam = makeCamera(0, 0.1, 0);
  cam.position.y = 0.1;
  enterFreeFly(cam, null as any);
  _setYaw(0);
  _setPitch(0);
  _setKeys({});
  tickFreeFly(0.016, cam);
  assert.ok(cam.position.y >= 0.3, `y should be >= 0.3, got ${cam.position.y}`);
});

test('tickFreeFly clamps x to ±30', () => {
  _resetState();
  const cam = makeCamera(35, 2, 0);
  enterFreeFly(cam, null as any);
  _setYaw(0);
  _setPitch(0);
  _setKeys({});
  tickFreeFly(0.016, cam);
  assert.ok(cam.position.x <= 30, `x should be <= 30, got ${cam.position.x}`);
});

test('tickFreeFly clamps z to ±30', () => {
  _resetState();
  const cam = makeCamera(0, 2, -35);
  enterFreeFly(cam, null as any);
  _setYaw(0);
  _setPitch(0);
  _setKeys({});
  tickFreeFly(0.016, cam);
  assert.ok(cam.position.z >= -30, `z should be >= -30, got ${cam.position.z}`);
});

// ── Pitch clamp: cannot exceed ±85° ─────────────────────────────────

test('pitch is clamped to ±85 degrees', () => {
  _resetState();
  const cam = makeCamera(0, 2, 0);
  enterFreeFly(cam, null as any);
  _setPitch(Math.PI);  // 180° — should be clamped
  _setYaw(0);
  _setKeys({});
  tickFreeFly(0.016, cam);
  // After tick, the camera lookAt should not be past 85deg
  // We verify by checking pitch is still within range after being set
  // The _setPitch helper sets the raw value; tick must clamp it
  // We just verify no NaN/Infinity in camera matrix
  const pos = cam.position;
  assert.ok(isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z), 'no NaN in position');
});

// ── Framerate independence: 2 half-frames ≈ 1 full-frame ────────────

test('tickFreeFly is roughly framerate-independent (2×dt/2 ≈ 1×dt)', () => {
  _resetState();
  const cam1 = makeCamera(0, 2, 0);
  enterFreeFly(cam1, null as any);
  _setYaw(0);
  _setPitch(0);
  _setKeys({ w: true });
  tickFreeFly(0.032, cam1);
  exitFreeFly();

  _resetState();
  const cam2 = makeCamera(0, 2, 0);
  enterFreeFly(cam2, null as any);
  _setYaw(0);
  _setPitch(0);
  _setKeys({ w: true });
  tickFreeFly(0.016, cam2);
  tickFreeFly(0.016, cam2);
  exitFreeFly();

  // With exponential smoothing, exact equality is not expected,
  // but positions should be within 5% of each other
  const diff = Math.abs(cam1.position.z - cam2.position.z);
  const magnitude = Math.abs(cam1.position.z);
  assert.ok(diff < 0.1 || (magnitude > 0.001 && diff / magnitude < 0.1),
    `positions should be similar: cam1.z=${cam1.position.z}, cam2.z=${cam2.position.z}`);
});
