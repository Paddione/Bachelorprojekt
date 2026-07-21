// brett/src/client/touch-controls.ts — T000606 board-boot helper
// Wires the TouchDeps for the T000606 pointer-events handler and calls
// initTouchHandler(). Extracted from board-boot.ts to keep it under 600 lines.

import * as THREE from 'three';
import { STATE, getWs, isWsReady, currentUser, activeLocks } from './state';
import * as mannequin from './mannequin';
import * as wsClient from './ws-client';
import * as figPanel from './ui/fig-panel';
import { initTouchHandler, type TouchDeps } from './touch-handler';
import * as snapping from './snapping';
import type { ClientModerationState } from './ws-client';
import { computeGrabOffset, applyGrabOffset, angleAround, rotateFacing, shouldSend } from './figure-drag';

export interface TouchControlsDeps {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  sceneApi: { getOrbitState: () => { dist: number }; setOrbitDist: (d: number) => void; applyOrbitDelta: (dTheta: number, dPhi: number) => void };
  getCurrentModerationState: () => ClientModerationState;
}

// T002050: single-finger touch mirrors the mouse discriminated drag state
// (bone/body/rotate) — kept local to the touch handler rather than the
// global `ui.dragging` (matches the pre-existing touch behaviour of not
// driving the mouse-only "Drag …" status pill).
type TouchDrag =
  | { kind: 'bone'; figId: string; boneName: string; plane: THREE.Plane }
  | { kind: 'body'; figId: string; grabOffset: { x: number; z: number } }
  | { kind: 'rotate'; figId: string; startAngle: number; startFacing: number };

/** Both mesh hits (userData.figureId) and pickMannequinBody's fig object (id) resolve here. */
const targetFigureId = (target: any): string | undefined => target?.userData?.figureId ?? target?.id;

export function initBoardTouchControls(deps: TouchControlsDeps): void {
  const { renderer, camera, raycaster, sceneApi, getCurrentModerationState } = deps;
  let touchDrag: TouchDrag | null = null;

  const canDragFigure = (target: any): boolean => {
    const fig = STATE.figures.find(f => f.id === targetFigureId(target));
    if (!fig) return false;
    const lock = activeLocks.get(fig.id);
    if (lock && lock.userId !== currentUser.userId) return false;
    if (getCurrentModerationState().freeze) {
      const myRole = wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
      if (myRole !== 'leiter') return false;
    }
    return true;
  };

  const lockAndSelect = (figId: string): boolean => {
    const fig = STATE.figures.find(f => f.id === figId);
    if (!fig) return false;
    const isFree = !(fig as any)._serverPossessor && !activeLocks.get(fig.id);
    figPanel.selectFigure(fig.id);
    const ws = getWs();
    if (isFree) {
      if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_possess', figureId: fig.id }));
      return false; // possess only — do not start a drag
    }
    if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_lock', id: fig.id, color: currentUser.color }));
    return true;
  };

  const touchDeps: TouchDeps = {
    pickContactAt: (x, y) => mannequin.pickContact({ clientX: x, clientY: y }),
    pickRotateRingAt: (x, y) => mannequin.pickRotateRing({ clientX: x, clientY: y }),
    pickBodyAt: (x, y) => mannequin.pickMannequinBody({ clientX: x, clientY: y }),
    canDragFigure,
    startFigureDrag: (target, x, y) => {
      const figId = targetFigureId(target);
      const fig = STATE.figures.find(f => f.id === figId);
      if (!fig) return;

      if (target.userData?.isContact) {
        if (!lockAndSelect(figId!)) { touchDrag = null; return; }
        const worldPos = new THREE.Vector3();
        target.getWorldPosition(worldPos);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
        touchDrag = { kind: 'bone', figId: figId!, boneName: target.userData.boneName, plane };
        return;
      }

      if (target.userData?.isRotateRing) {
        if (!lockAndSelect(figId!)) { touchDrag = null; return; }
        const floorHit = mannequin.pickFloor({ clientX: x, clientY: y });
        const root = { x: fig.root.position.x, z: fig.root.position.z };
        const startAngle = floorHit ? angleAround(root, { x: floorHit.x, z: floorHit.z }) : 0;
        touchDrag = { kind: 'rotate', figId: figId!, startAngle, startFacing: fig.facingY };
        return;
      }

      // T002050: whole-figure body drag (pickBodyAt returns the fig object itself).
      if (!lockAndSelect(figId!)) { touchDrag = null; return; }
      const floorHit = mannequin.pickFloor({ clientX: x, clientY: y });
      if (!floorHit) { touchDrag = null; return; }
      const root = { x: fig.root.position.x, z: fig.root.position.z };
      const grabOffset = computeGrabOffset({ x: floorHit.x, z: floorHit.z }, root);
      touchDrag = { kind: 'body', figId: figId!, grabOffset };
    },
    moveFigureDrag: (x, y) => {
      if (!touchDrag) return;
      const fig = STATE.figures.find(f => f.id === touchDrag!.figId);
      if (!fig) return;

      if (touchDrag.kind === 'bone') {
        mannequin.setNdcFromPoint(x, y);
        const { ndc } = mannequin.getTickRefs();
        raycaster.setFromCamera(ndc, camera);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(touchDrag.plane, target);
        if (!target) return;
        mannequin.ccdIK(fig, touchDrag.boneName, target, 6);
        wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
        const now = performance.now();
        if (now - (fig._lastCollisionCheck || 0) > 33) {
          fig._lastCollisionCheck = now;
          mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
        }
        return;
      }

      if (touchDrag.kind === 'body') {
        const hit = mannequin.pickFloor({ clientX: x, clientY: y });
        if (!hit) return;
        const p = applyGrabOffset({ x: hit.x, z: hit.z }, touchDrag.grabOffset);
        fig.root.position.x = p.x;
        fig.root.position.z = p.z;
        const now = performance.now();
        if (shouldSend(now, fig._lastMoveSent || 0)) {
          fig._lastMoveSent = now;
          wsClient.sendMove(fig.id, p.x, p.z, fig.facingY);
        }
        return;
      }

      if (touchDrag.kind === 'rotate') {
        const hit = mannequin.pickFloor({ clientX: x, clientY: y });
        if (!hit) return;
        const root = { x: fig.root.position.x, z: fig.root.position.z };
        const currentAngle = angleAround(root, { x: hit.x, z: hit.z });
        const facingY = rotateFacing(touchDrag.startFacing, touchDrag.startAngle, currentAngle);
        fig.facingY = facingY;
        fig.root.rotation.y = facingY;
        const now = performance.now();
        if (shouldSend(now, fig._lastMoveSent || 0)) {
          fig._lastMoveSent = now;
          wsClient.sendMove(fig.id, fig.root.position.x, fig.root.position.z, facingY);
        }
      }
    },
    endFigureDrag: () => {
      if (!touchDrag) return;
      const d = touchDrag;
      const fig = STATE.figures.find(f => f.id === d.figId);
      if (fig) {
        if (d.kind === 'bone') {
          const chain = mannequin.IK_CHAINS[d.boneName] || [];
          for (const b of chain) delete fig.boneOverrides[b];
          delete fig.boneOverrides[d.boneName];
          wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
          // E7: Touch teilt denselben Snap-Hook wie die Maus.
          snapping.finishDrag(fig);
        } else if (d.kind === 'body') {
          snapping.finishDrag(fig);
        } else if (d.kind === 'rotate') {
          wsClient.sendMove(fig.id, fig.root.position.x, fig.root.position.z, fig.facingY);
        }
        const ws = getWs();
        if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_unlock', id: fig.id }));
      }
      touchDrag = null;
    },
    getOrbitDist: () => sceneApi.getOrbitState().dist,
    setOrbitDist: (d) => sceneApi.setOrbitDist(d),
    applyOrbitDelta: (dTheta, dPhi) => sceneApi.applyOrbitDelta(dTheta, dPhi),
    capturePointer: (id) => { try { renderer.domElement.setPointerCapture(id); } catch { /* ignore */ } },
    releasePointer: (id) => { try { renderer.domElement.releasePointerCapture(id); } catch { /* ignore */ } },
  };

  initTouchHandler({ canvas: renderer.domElement, deps: touchDeps });
}
