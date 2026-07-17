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

export interface TouchControlsDeps {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  sceneApi: { getOrbitState: () => { dist: number }; setOrbitDist: (d: number) => void; applyOrbitDelta: (dTheta: number, dPhi: number) => void };
  getCurrentModerationState: () => ClientModerationState;
}

export function initBoardTouchControls(deps: TouchControlsDeps): void {
  const { renderer, camera, raycaster, sceneApi, getCurrentModerationState } = deps;
  let touchDrag: { figId: string; boneName: string; plane: THREE.Plane } | null = null;

  const canDragFigure = (sphere: any): boolean => {
    const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
    if (!fig) return false;
    const lock = activeLocks.get(fig.id);
    if (lock && lock.userId !== currentUser.userId) return false;
    if (getCurrentModerationState().freeze) {
      const myRole = wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
      if (myRole !== 'leiter') return false;
    }
    return true;
  };

  const touchDeps: TouchDeps = {
    pickContactAt: (x, y) => mannequin.pickContact({ clientX: x, clientY: y }),
    canDragFigure,
    startFigureDrag: (sphere, _x, _y) => {
      const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
      if (!fig) return;
      const isFree = !(fig as any)._serverPossessor && !activeLocks.get(fig.id);
      figPanel.selectFigure(fig.id);
      const ws = getWs();
      if (isFree) {
        if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_possess', figureId: fig.id }));
        touchDrag = null;
        return;
      }
      if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_lock', id: fig.id, color: currentUser.color }));
      const worldPos = new THREE.Vector3();
      sphere.getWorldPosition(worldPos);
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
      touchDrag = { figId: fig.id, boneName: sphere.userData.boneName, plane };
    },
    moveFigureDrag: (x, y) => {
      if (!touchDrag) return;
      mannequin.setNdcFromPoint(x, y);
      const { ndc } = mannequin.getTickRefs();
      raycaster.setFromCamera(ndc, camera);
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(touchDrag.plane, target);
      if (!target) return;
      const fig = STATE.figures.find(f => f.id === touchDrag!.figId);
      if (!fig) return;
      mannequin.ccdIK(fig, touchDrag.boneName, target, 6);
      wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
      const now = performance.now();
      if (now - (fig._lastCollisionCheck || 0) > 33) {
        fig._lastCollisionCheck = now;
        mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
      }
    },
    endFigureDrag: () => {
      if (!touchDrag) return;
      const fig = STATE.figures.find(f => f.id === touchDrag!.figId);
      if (fig) {
        const chain = mannequin.IK_CHAINS[touchDrag.boneName] || [];
        for (const b of chain) delete fig.boneOverrides[b];
        delete fig.boneOverrides[touchDrag.boneName];
        wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
        // E7: Touch teilt denselben Snap-Hook wie die Maus.
        snapping.finishDrag(fig);
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
