// brett/src/client/camera-modes.ts — E3 client-lokaler 2D/3D-Kameramodus.
// Besitzt eine top-down OrthographicCamera (2D) neben der Orbit-PerspectiveCamera
// (3D). Der Umschalter tauscht die aktive Kamera in den Szenen-Singleton, sodass
// sowohl Rendering als auch Raycast/Picking konsistent dieselbe Kamera nutzen.
// Alle neue Logik lebt hier, um board-boot.ts (enges S1-Budget) zu schonen.
import * as THREE from 'three';
import { setActiveCamera } from './state';

export type CameraMode = '2d' | '3d';

let perspective: THREE.PerspectiveCamera | null = null;
let ortho: THREE.OrthographicCamera | null = null;
let mode: CameraMode = '3d';
let halfView = 8; // halbe Ansichtsgröße in Welt-Einheiten (Ortho-Zoom)

function buildOrtho(width: number, height: number): THREE.OrthographicCamera {
  const aspect = width / Math.max(1, height);
  const cam = new THREE.OrthographicCamera(
    -halfView * aspect, halfView * aspect, halfView, -halfView, 0.1, 500,
  );
  cam.position.set(0, 60, 0);
  cam.up.set(0, 0, -1);      // Welt +Z zeigt am Bildschirm nach oben
  cam.lookAt(0, 0, 0);        // senkrecht nach unten
  cam.updateProjectionMatrix();
  return cam;
}

/** Initialisiert den Modus mit der bestehenden Perspektiv-(Orbit-)Kamera. */
export function initCameraModes(persp: THREE.PerspectiveCamera, width: number, height: number): void {
  perspective = persp;
  ortho = buildOrtho(width, height);
  mode = '3d';
  setActiveCamera(persp);
}

export function getActiveCamera(): THREE.Camera {
  return (mode === '2d' && ortho) ? ortho : (perspective as THREE.Camera);
}

export function is2D(): boolean {
  return mode === '2d';
}

export function getMode(): CameraMode {
  return mode;
}

/** Setzt den Modus explizit und aktiviert die zugehörige Kamera im Singleton. */
export function setMode(next: CameraMode): CameraMode {
  mode = next;
  const cam = getActiveCamera();
  if (cam) setActiveCamera(cam as THREE.PerspectiveCamera | THREE.OrthographicCamera);
  return mode;
}

/** Wechselt zwischen 2D (Ortho, top-down) und 3D (Perspektive/Orbit). */
export function toggleMode(): CameraMode {
  return setMode(mode === '2d' ? '3d' : '2d');
}

/** Passt das Ortho-Frustum an eine neue Viewport-Größe an. */
export function onResize(width: number, height: number): void {
  if (!ortho) return;
  const aspect = width / Math.max(1, height);
  ortho.left = -halfView * aspect;
  ortho.right = halfView * aspect;
  ortho.top = halfView;
  ortho.bottom = -halfView;
  ortho.updateProjectionMatrix();
}

/** Ortho-Zoom (kleiner halfView = näher). Geklemmt wie der Orbit-Zoom. */
export function setOrthoZoom(half: number, width = window.innerWidth, height = window.innerHeight): void {
  halfView = Math.max(2, Math.min(30, half));
  onResize(width, height);
}
