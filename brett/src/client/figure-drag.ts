// brett/src/client/figure-drag.ts — T002050
// Pure, dependency-free helpers for whole-figure floor drag and 360° Y
// rotation, plus the orchestration wiring board-boot.ts delegates to.
// The pure helpers below have NO THREE/state import — unit-testable in
// isolation. initFigureDrag() (bottom of the file) does the real DOM/THREE
// wiring and is exercised only via the live board (not unit-tested).

export interface Vec2 { x: number; z: number; }

/** Grab-offset captured on body-drag start so the figure never jumps to the cursor. */
export function computeGrabOffset(hit: Vec2, root: Vec2): Vec2 {
  return { x: hit.x - root.x, z: hit.z - root.z };
}
/** New root position from a raw floor hit minus the captured grab-offset. */
export function applyGrabOffset(hit: Vec2, offset: Vec2): Vec2 {
  return { x: hit.x - offset.x, z: hit.z - offset.z };
}
/** Angle (radians) of a floor point around the figure root — matches the facingY convention. */
export function angleAround(root: Vec2, point: Vec2): number {
  return Math.atan2(point.x - root.x, point.z - root.z);
}
/** Ring-drag facing: start facing plus the pointer's angular delta around the root. */
export function rotateFacing(startFacing: number, startAngle: number, currentAngle: number): number {
  return startFacing + (currentAngle - startAngle);
}
/** Wrap radians into [0, 2π). */
export function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}
export function degToRad(deg: number): number { return (deg * Math.PI) / 180; }
export function radToDeg(rad: number): number { return (normalizeAngle(rad) * 180) / Math.PI; }
/** Edge-tab visibility predicate: only when a figure is selected and the panel is closed. */
export function edgeTabVisible(selectedId: string | null, panelHidden: boolean): boolean {
  return selectedId !== null && panelHidden;
}
/** ~33 ms throttle decision for sendMove during drag/rotate. */
export function shouldSend(now: number, last: number, intervalMs = 33): boolean {
  return now - last >= intervalMs;
}

// ── Orchestration wiring (Task 3) ──────────────────────────────────────────
// initFigureDrag() extracts the mousedown/mousemove/mouseup figure-drag
// handler bodies out of board-boot.ts. Pick priority per mousedown:
//   contact sphere (IK bone drag, unchanged) → rotate-ring → body mesh.
// Body and rotate reuse the same lock/freeze gates as the bone path and
// stream throttled `move` updates via the pure helpers above.

import * as THREE from 'three';
import { STATE, ui, getWs, isWsReady, currentUser, activeLocks } from './state';

export interface FigureDragDeps {
  renderer: { domElement: HTMLElement };
  /** Accessor rather than a static camera — E3 lets the user swap 2D/3D mid-session. */
  getCamera: () => THREE.Camera;
  raycaster: THREE.Raycaster;
  mannequin: {
    pickContact: (ev: { clientX: number; clientY: number }) => any;
    pickRotateRing: (ev: { clientX: number; clientY: number }) => any;
    pickMannequinBody: (ev: { clientX: number; clientY: number }) => any;
    pickFloor: (ev: { clientX: number; clientY: number }) => THREE.Vector3 | null;
    setNdc: (ev: { clientX: number; clientY: number }) => void;
    getTickRefs: () => { ndc: THREE.Vector2 };
    ccdIK: (fig: any, boneName: string, target: THREE.Vector3, iterations?: number) => void;
    resolveCollisions: (fig: any, k: number) => void;
    IK_CHAINS: Record<string, string[]>;
    BOUNCE_K_DRAG: number;
  };
  wsClient: {
    sendMove: (id: string, x: number, z: number, facingY: number) => void;
    sendUpdate: (fig: any, changes: any) => void;
    getLobbyState: () => any;
  };
  figPanel: { selectFigure: (id: string | null) => void };
  snapping: { finishDrag: (fig: any) => void };
  getModerationState: () => { freeze: boolean };
}

const lockedByOther = (figId: string): boolean => {
  const lock = activeLocks.get(figId);
  return !!lock && lock.userId !== currentUser.userId;
};

function frozenForMe(deps: FigureDragDeps): boolean {
  if (!deps.getModerationState().freeze) return false;
  const myRole = deps.wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
  return myRole !== 'leiter';
}

function lockAndSelect(deps: FigureDragDeps, figId: string): void {
  deps.figPanel.selectFigure(figId);
  const ws = getWs();
  if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_lock', id: figId, color: currentUser.color }));
}

/**
 * Wires mousedown/mousemove/mouseup for the three drag kinds (bone/body/
 * rotate) onto the renderer element + window. Called once from bootBoard();
 * the existing bone-drag behaviour (IK, boneOverrides, snapping.finishDrag)
 * is preserved verbatim — only the body/rotate branches are new.
 */
export function initFigureDrag(deps: FigureDragDeps): void {
  const { renderer, raycaster, mannequin, wsClient, snapping } = deps;

  renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0 || e.shiftKey) return;

    // Priority 1: contact sphere → IK bone drag (unchanged behaviour).
    const sphere = mannequin.pickContact(e);
    if (sphere) {
      const fig = STATE.figures.find((f) => f.id === sphere.userData.figureId);
      if (!fig) return;
      if (lockedByOther(fig.id) || frozenForMe(deps)) { e.preventDefault(); return; }

      lockAndSelect(deps, fig.id);
      const worldPos = new THREE.Vector3();
      sphere.getWorldPosition(worldPos);
      const camDir = new THREE.Vector3();
      deps.getCamera().getWorldDirection(camDir);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
      ui.dragging = { kind: 'bone', figId: fig.id, boneName: sphere.userData.boneName, plane };
      e.preventDefault();
      return;
    }

    // Priority 2: rotate-ring hit region → 360° facing rotation.
    const ring = mannequin.pickRotateRing(e);
    if (ring) {
      const fig = STATE.figures.find((f) => f.id === ring.userData.figureId);
      if (!fig) return;
      if (lockedByOther(fig.id) || frozenForMe(deps)) { e.preventDefault(); return; }

      lockAndSelect(deps, fig.id);
      const floorHit = mannequin.pickFloor(e);
      const root = { x: fig.root.position.x, z: fig.root.position.z };
      const startAngle = floorHit ? angleAround(root, { x: floorHit.x, z: floorHit.z }) : 0;
      ui.dragging = { kind: 'rotate', figId: fig.id, startAngle, startFacing: fig.facingY };
      e.preventDefault();
      return;
    }

    // Priority 3: figure body mesh → whole-figure floor drag.
    const bodyFig = mannequin.pickMannequinBody(e);
    if (bodyFig) {
      if (lockedByOther(bodyFig.id) || frozenForMe(deps)) { e.preventDefault(); return; }

      const floorHit = mannequin.pickFloor(e);
      if (!floorHit) return;
      lockAndSelect(deps, bodyFig.id);
      const root = { x: bodyFig.root.position.x, z: bodyFig.root.position.z };
      const grabOffset = computeGrabOffset({ x: floorHit.x, z: floorHit.z }, root);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      ui.dragging = { kind: 'body', figId: bodyFig.id, plane, grabOffset };
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!ui.dragging) {
      const fig = mannequin.pickMannequinBody(e);
      STATE.hoveredId = fig ? fig.id : null;
      return;
    }
    const d = ui.dragging;
    const fig = STATE.figures.find((f) => f.id === d.figId);
    if (!fig) return;

    if (d.kind === 'bone') {
      mannequin.setNdc(e);
      const { ndc } = mannequin.getTickRefs();
      raycaster.setFromCamera(ndc, deps.getCamera());
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(d.plane, target);
      if (!target) return;
      mannequin.ccdIK(fig, d.boneName, target, 6);
      wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
      const now = performance.now();
      if (now - (fig._lastCollisionCheck || 0) > 33) {
        fig._lastCollisionCheck = now;
        mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
      }
      return;
    }

    if (d.kind === 'body') {
      const hit = mannequin.pickFloor(e);
      if (!hit) return;
      const p = applyGrabOffset({ x: hit.x, z: hit.z }, d.grabOffset);
      fig.root.position.x = p.x;
      fig.root.position.z = p.z;
      const now = performance.now();
      if (shouldSend(now, fig._lastMoveSent || 0)) {
        fig._lastMoveSent = now;
        wsClient.sendMove(fig.id, p.x, p.z, fig.facingY);
      }
      return;
    }

    if (d.kind === 'rotate') {
      const hit = mannequin.pickFloor(e);
      if (!hit) return;
      const root = { x: fig.root.position.x, z: fig.root.position.z };
      const currentAngle = angleAround(root, { x: hit.x, z: hit.z });
      const facingY = rotateFacing(d.startFacing, d.startAngle, currentAngle);
      fig.facingY = facingY;
      fig.root.rotation.y = facingY;
      const now = performance.now();
      if (shouldSend(now, fig._lastMoveSent || 0)) {
        fig._lastMoveSent = now;
        wsClient.sendMove(fig.id, fig.root.position.x, fig.root.position.z, facingY);
      }
    }
  });

  window.addEventListener('mouseup', () => {
    const d = ui.dragging;
    if (!d) return;
    const fig = STATE.figures.find((f) => f.id === d.figId);
    if (fig) {
      if (d.kind === 'bone') {
        const chain = mannequin.IK_CHAINS[d.boneName] || [];
        for (const b of chain) delete fig.boneOverrides[b];
        delete fig.boneOverrides[d.boneName];
        wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
        snapping.finishDrag(fig);
      } else if (d.kind === 'body') {
        snapping.finishDrag(fig);
      } else if (d.kind === 'rotate') {
        wsClient.sendMove(fig.id, fig.root.position.x, fig.root.position.z, fig.facingY);
      }
      const ws = getWs();
      if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_unlock', id: fig.id }));
    }
    ui.dragging = null;
  });
}
