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

test('SceneApi interface declares setOrbitDist(dist)', () => {
  assert.match(
    sceneSrc,
    /setOrbitDist\s*\(\s*\w+\s*:\s*number\s*\)\s*:/,
    'SceneApi must have setOrbitDist(dist: number) method',
  );
});

test('SceneApi interface declares applyOrbitDelta(dTheta, dPhi)', () => {
  assert.match(
    sceneSrc,
    /applyOrbitDelta\s*\(\s*\w+\s*:\s*number\s*,\s*\w+\s*:\s*number\s*\)\s*:/,
    'SceneApi must have applyOrbitDelta(dTheta, dPhi)',
  );
});

// ── E3: camera-modes 2D/3D toggle (T001931) ──────────────────────────────────
import * as THREE from 'three';
import * as cameraModes from '../src/client/camera-modes';
import { setScene } from '../src/client/state';

test('camera-modes: getActiveCamera swaps ortho ⇄ perspective on toggle', () => {
  const persp = new THREE.PerspectiveCamera(50, 1.5, 0.1, 200);
  // setScene benötigt einen Renderer nicht real — Dummy reicht für den Singleton.
  setScene({ renderer: {} as any, scene: new THREE.Scene(), camera: persp, floor: {} as any });
  cameraModes.initCameraModes(persp, 800, 600);
  assert.equal(cameraModes.is2D(), false, 'startet in 3D');
  assert.ok(cameraModes.getActiveCamera() instanceof THREE.PerspectiveCamera, '3D → Perspektive');
  cameraModes.toggleMode();
  assert.equal(cameraModes.is2D(), true, 'nach toggle in 2D');
  assert.ok(cameraModes.getActiveCamera() instanceof THREE.OrthographicCamera, '2D → Ortho');
  cameraModes.toggleMode();
  assert.ok(cameraModes.getActiveCamera() instanceof THREE.PerspectiveCamera, 'zurück in 3D → Perspektive');
});
