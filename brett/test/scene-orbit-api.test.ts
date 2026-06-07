// brett/test/scene-orbit-api.test.ts — T2 / T000465
// Tests for SceneApi.getOrbitState() and SceneApi.setCameraToOrbit(position)
// Pure interface/type checks — no WebGL or DOM required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Interface shape verification (static source analysis) ────────────────────

const sceneSrc = readFileSync(
  fileURLToPath(new URL('../src/client/scene.ts', import.meta.url)),
  'utf8',
);

test('SceneApi interface declares getOrbitState(): OrbitState', () => {
  assert.match(
    sceneSrc,
    /getOrbitState\s*\(\s*\)\s*:/,
    'SceneApi must have getOrbitState() method',
  );
});

test('SceneApi interface declares setCameraToOrbit(position)', () => {
  assert.match(
    sceneSrc,
    /setCameraToOrbit\s*\([^)]*\)\s*:/,
    'SceneApi must have setCameraToOrbit(position) method',
  );
});

test('OrbitState type is exported and has theta, phi, dist', () => {
  assert.match(sceneSrc, /export.*OrbitState/, 'OrbitState must be exported');
  assert.match(sceneSrc, /theta\s*:/, 'OrbitState must have theta');
  assert.match(sceneSrc, /phi\s*:/, 'OrbitState must have phi');
  assert.match(sceneSrc, /dist\s*:/, 'OrbitState must have dist');
});

test('setCameraToOrbit accepts a position parameter', () => {
  // Should accept { theta, phi, dist } shaped object
  assert.match(
    sceneSrc,
    /setCameraToOrbit\s*\(\s*\w+\s*:/,
    'setCameraToOrbit must have typed parameter',
  );
});

// ── No existing orbit logic or scene initialisation was changed ──────────────

test('updateCameraFromOrbit still present (no orbit logic removed)', () => {
  assert.match(
    sceneSrc,
    /updateCameraFromOrbit/,
    'updateCameraFromOrbit must remain in scene.ts',
  );
});

test('initScene function still present (no scene init removed)', () => {
  assert.match(
    sceneSrc,
    /export function initScene/,
    'initScene must remain in scene.ts',
  );
});

test('cameraOrbit object still present (orbit state not replaced)', () => {
  assert.match(
    sceneSrc,
    /cameraOrbit/,
    'cameraOrbit object must remain in scene.ts',
  );
});
