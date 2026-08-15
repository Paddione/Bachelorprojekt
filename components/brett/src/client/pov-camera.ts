// brett/src/client/pov-camera.ts — D-spec: POV Camera
//
// Client-local first-person camera for possession. On figure_possess
// (own), lerps the camera to the figure's head position over 600ms.
// Shift+Drag temporarily exits POV; figure_release returns to default.
import * as THREE from 'three';
import { STATE, getScene } from './state';

export type PovMode = 'first-person' | 'meta';
let povMode: PovMode = 'first-person';

let povFigureId: string | null = null;
let lerpState: {
  posStart: THREE.Vector3;
  posTarget: THREE.Vector3;
  lookTarget: THREE.Vector3;
  startTime: number;
} | null = null;
const LERP_DURATION_MS = 600;

const _headWorld = new THREE.Vector3();
const _facingDir = new THREE.Vector3();
const _defaultPos = new THREE.Vector3(4, 4, 6);
const _defaultLook = new THREE.Vector3(0, 1, 0);

export function getPovFigureId(): string | null { return povFigureId; }
export function isInPov(): boolean { return povFigureId !== null && lerpState === null; }
export function getPovMode(): PovMode { return povMode; }
/** E4: Metaposition aktiv (Vogelperspektive der besessenen Figur). */
export function isMeta(): boolean { return povMode === 'meta' && povFigureId !== null; }

/** E4: Innensicht ⇄ Metaposition umschalten und Kamera neu einlerpen. */
export function setPovMode(mode: PovMode): void {
  povMode = mode;
  if (povFigureId) startPov(povFigureId);
}

export function startPov(figureId: string): void {
  const fig = STATE.figures.find(f => f.id === figureId);
  if (!fig) return;
  const { camera } = getScene();

  const headBone = fig.bones?.head;
  if (!headBone) return;
  headBone.getWorldPosition(_headWorld);

  // Figure facing direction (local -Z → world)
  _facingDir.set(0, 0, -1);
  fig.root.localToWorld(_facingDir);
  _facingDir.sub(fig.root.position).normalize();

  let posTarget: THREE.Vector3;
  let lookTarget: THREE.Vector3;
  if (povMode === 'meta') {
    // E4: ~6 Einheiten über der Figur, leicht versetzt, Blick auf die Figur.
    posTarget = _headWorld.clone().add(new THREE.Vector3(0, 6, 1.5));
    lookTarget = fig.root.position.clone();
  } else {
    posTarget = _headWorld.clone().add(new THREE.Vector3(0, 0.15, 0));
    lookTarget = _headWorld.clone().add(_facingDir.clone().multiplyScalar(2));
  }

  lerpState = {
    posStart: camera.position.clone(),
    posTarget,
    lookTarget,
    startTime: performance.now(),
  };
  povFigureId = figureId;
}

export function stopPov(): void {
  const { camera } = getScene();
  lerpState = {
    posStart: camera.position.clone(),
    posTarget: _defaultPos.clone(),
    lookTarget: _defaultLook.clone(),
    startTime: performance.now(),
  };
  povFigureId = null;
  povMode = 'first-person';
}

/** Call each frame. Drives the lerp animation. */
export function tickPov(): void {
  if (!lerpState) return;
  const { camera } = getScene();
  const now = performance.now();
  const t = Math.min(1, (now - lerpState.startTime) / LERP_DURATION_MS);
  const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic

  camera.position.lerpVectors(lerpState.posStart, lerpState.posTarget, e);
  camera.lookAt(lerpState.lookTarget);

  if (t >= 1) {
    lerpState = null;
  }
}

/**
 * Switch POV: release current and immediately possess a different figure.
 * Used when clicking another free figure while already in POV.
 */
export function switchPov(figureId: string): void {
  povFigureId = null;
  lerpState = null;
  startPov(figureId);
}
