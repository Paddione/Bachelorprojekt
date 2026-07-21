import type * as THREE from 'three';
import type { BrettLine, Anchor, Zone } from '../types/state';

// ── App state (mirrors window.STATE from index.html line 310) ─────
export interface AppState {
  figures: any[];          // runtime figure objects (THREE groups + metadata)
  selectedId: string | null;
  hoveredId: string | null;
  stiffness: number;
  online: number;
  lines: BrettLine[];  // ← NEU (T000467)
  anchors: Anchor[];   // ← NEU (T000605) — Plain-Data-Spiegel der anchorMeshes
  zones: Zone[];       // ← NEU (T000605) — Plain-Data-Spiegel der zoneMeshes
}
export const STATE: AppState = {
  figures: [],
  selectedId: null,
  hoveredId: null,
  stiffness: 0.65,
  online: 1,
  lines: [],  // ← NEU
  anchors: [], // ← NEU (T000605)
  zones: [],   // ← NEU (T000605)
};

// ── Three.js singletons, registered by scene.ts ───────────────────
interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  // E3: kann die Orbit-Perspektive ODER die 2D-Ortho-Kamera sein (aktiver Modus).
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  floor: THREE.Mesh;
}
let sceneRefs: SceneRefs | null = null;
export function setScene(refs: SceneRefs): void { sceneRefs = refs; }
export function getScene(): SceneRefs {
  if (!sceneRefs) throw new Error('scene not initialized');
  return sceneRefs;
}
/** E3: aktive Kamera (2D/3D) in den Singleton tauschen — Render + Picking folgen. */
export function setActiveCamera(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera): void {
  if (sceneRefs) sceneRefs.camera = cam;
}

// ── WebSocket handle (registered by ws-client.ts) ─────────────────
let ws: WebSocket | null = null;
let wsReady = false;
export function setWs(w: WebSocket | null): void { ws = w; }
export function getWs(): WebSocket | null { return ws; }
export function setWsReady(v: boolean): void { wsReady = v; }
export function isWsReady(): boolean { return wsReady; }

// ── Current user (from /auth/me) ──────────────────────────────────
export const currentUser = { userId: 'anon', name: 'Teilnehmer', color: '#4ea1ff' };

// ── Appearance spec + texture cache (registered by appearance.ts) ─
export const PLACEMENT_SPEC: { faces: Record<string, any>; bodies: Record<string, any>; accessories: Record<string, any> } =
  { faces: {}, bodies: {}, accessories: {} };

// ── Lock maps (shared between ws-client and hud) ──────────────────
export const lockSprites = new Map<string, THREE.Sprite>();
export const activeLocks = new Map<string, { userId: string; name: string; color: string }>();

// ── Note billboard sprites (Slice 5, T000469) ─────────────────────
export const noteSprites = new Map<string, THREE.Sprite>();

// ── Drag/placement cross-cutting flags ────────────────────────────
export const ui = {
  dragging: null as null
    | { kind: 'bone'; figId: string; boneName: string; plane: THREE.Plane }
    | { kind: 'body'; figId: string; grabOffset: { x: number; z: number } }
    | { kind: 'rotate'; figId: string; startAngle: number; startFacing: number },
  placingMode: false,
  panelColor: '#b8c0a8',
  panelScale: 1.0,
};
