// brett/src/client/board-boot.ts — Phase A / A5
//
// The full 3D-board boot logic, moved VERBATIM (behaviour-unchanged) out of the
// former main.ts boot(). This is the lazy chunk: it statically imports Three.js
// + scene + all board UI, so importing it pulls the whole 3D bundle. main.ts only
// ever reaches it via `import('./board-boot')` on first board-view entry, which
// keeps the Hauptmenü Three-free.

import * as THREE from 'three';
import { STATE, ui, getWs, isWsReady, currentUser, activeLocks } from './state';
import { initScene } from './scene';
import * as mannequin from './mannequin';
import * as wsClient from './ws-client';
import * as presets from './presets';
import * as figPanel from './ui/fig-panel';
import * as hud from './ui/hud';
import * as appearance from './ui/appearance';
import * as persons from './ui/persons';

export async function bootBoard(): Promise<void> {
  // ── Scene ──────────────────────────────────────────────────────────
  const sceneApi = initScene();
  const { renderer, scene, camera } = sceneApi;

  // ── Wire dependencies ──────────────────────────────────────────────
  mannequin.setSendMove(wsClient.sendMove);
  wsClient.setApplyAppearance(appearance.applyAppearanceToFig);
  wsClient.setLockBadgeFns({
    setFigureLockBadge: hud.setFigureLockBadge,
    clearFigureLockBadge: hud.clearFigureLockBadge,
    clearLockBadgesForUser: hud.clearLockBadgesForUser,
    cancelDragFor: figPanel.cancelDragFor,
  });

  // ── Auth ───────────────────────────────────────────────────────────
  try {
    const me = await (await fetch('/auth/me')).json();
    if (me.userId) {
      currentUser.userId = me.userId;
      currentUser.name = me.name;
    }
  } catch { /* anon */ }

  // ── UI init ────────────────────────────────────────────────────────
  figPanel.initFigPanel();
  appearance.initAppearance();
  persons.initPersons();

  // ── Stiffness slider ───────────────────────────────────────────────
  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement;
  stiffSlider.addEventListener('input', () => {
    STATE.stiffness = parseFloat(stiffSlider.value);
    wsClient.sendStiffness(STATE.stiffness);
  });

  // ── Preset buttons ─────────────────────────────────────────────────
  document.getElementById('presets')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-preset]") as HTMLElement | null;
    if (!btn || !STATE.selectedId) return;
    presets.applyPreset(STATE.selectedId, btn.dataset.preset!);
  });

  // ── Drag handling ──────────────────────────────────────────────────
  const { raycaster } = mannequin.getTickRefs();

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (ui.placingMode && e.button === 0) {
      const floorPt = mannequin.pickFloor(e);
      if (floorPt) {
        const input = document.getElementById('fig-label-input') as HTMLInputElement | null;
        const label = input?.value.trim() ?? '';
        const fig = figPanel.addFigure({ x: floorPt.x, z: floorPt.z });
        mannequin.recolorFigure(fig, ui.panelColor);
        fig.root.scale.setScalar(ui.panelScale);
        if (label) fig.label = label;
      }
      ui.placingMode = false;
      document.body.classList.remove('placing-figure');
      hud.updateStatusPill();
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || e.shiftKey) return;
    const sphere = mannequin.pickContact(e);
    if (sphere) {
      const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
      if (!fig) return;

      const lock = activeLocks.get(fig.id);
      if (lock && lock.userId !== currentUser.userId) {
        e.preventDefault();
        return; // block!
      }

      figPanel.selectFigure(fig.id);
      const ws = getWs();
      if (isWsReady() && ws) {
        ws.send(JSON.stringify({ type: "figure_lock", id: fig.id, color: currentUser.color }));
      }

      const worldPos = new THREE.Vector3();
      sphere.getWorldPosition(worldPos);
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
      ui.dragging = { figId: fig.id, boneName: sphere.userData.boneName, plane };
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!ui.dragging) {
      const fig = mannequin.pickMannequinBody(e);
      STATE.hoveredId = fig ? fig.id : null;
      return;
    }
    mannequin.setNdc(e);
    const { ndc } = mannequin.getTickRefs();
    raycaster.setFromCamera(ndc, camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(ui.dragging.plane, target);
    if (!target) return;
    const fig = STATE.figures.find(f => f.id === ui.dragging!.figId);
    if (!fig) return;
    mannequin.ccdIK(fig, ui.dragging.boneName, target, 6);
    wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
    const now = performance.now();
    if (now - (fig._lastCollisionCheck || 0) > 33) {
      fig._lastCollisionCheck = now;
      mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
    }
  });

  window.addEventListener('mouseup', () => {
    if (!ui.dragging) return;
    const fig = STATE.figures.find(f => f.id === ui.dragging!.figId);
    if (fig) {
      const chain = mannequin.IK_CHAINS[ui.dragging.boneName] || [];
      for (const b of chain) delete fig.boneOverrides[b];
      delete fig.boneOverrides[ui.dragging.boneName];
      wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
      const ws = getWs();
      if (isWsReady() && ws) {
        ws.send(JSON.stringify({ type: "figure_unlock", id: fig.id }));
      }
    }
    ui.dragging = null;
  });

  renderer.domElement.addEventListener('click', (e) => {
    if (ui.dragging) return;
    if (e.shiftKey) return;
    mannequin.pickMannequinBody(e);
  });

  function easeFigure(fig: any, tx: number, tz: number, durationMs: number) {
    const sx = fig.root.position.x, sz = fig.root.position.z;
    const start = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      fig.root.position.x = sx + (tx - sx) * e;
      fig.root.position.z = sz + (tz - sz) * e;
      if (t < 1) { requestAnimationFrame(step); }
      else {
        fig.root.position.x = tx; fig.root.position.z = tz;
        const ws = getWs();
        if (isWsReady() && ws) {
          ws.send(JSON.stringify({ type: 'move', id: fig.id, x: tx, z: tz, facingY: fig.facingY }));
        }
      }
    }
    requestAnimationFrame(step);
  }

  renderer.domElement.addEventListener('dblclick', (e) => {
    const floorPt = mannequin.pickFloor(e);
    if (!floorPt) return;
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) {
      easeFigure(fig, floorPt.x, floorPt.z, 300);
    } else {
      figPanel.addFigure({ x: floorPt.x, z: floorPt.z });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement)?.tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    const id = STATE.selectedId || STATE.hoveredId;
    if (!id) return;
    const fig = STATE.figures.find(f => f.id === id);
    if (!fig || fig.jumping) return;
    e.preventDefault();
    mannequin.startJump(fig);
    wsClient.sendJump(fig.id);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (ui.placingMode) {
        ui.placingMode = false;
        document.body.classList.remove('placing-figure');
        hud.updateStatusPill();
        e.preventDefault();
        return;
      }
      STATE.selectedId = null;
      for (const f of STATE.figures) f.ring.visible = false;
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && STATE.selectedId) {
      const idx = STATE.figures.findIndex(f => f.id === STATE.selectedId);
      if (idx >= 0) {
        scene.remove(STATE.figures[idx].root);
        STATE.figures.splice(idx, 1);
        STATE.selectedId = STATE.figures[0]?.id ?? null;
        if (STATE.selectedId) figPanel.selectFigure(STATE.selectedId);
        wsClient.sendDelete();
      }
    } else if (e.key === 'Tab' && STATE.figures.length > 1) {
      e.preventDefault();
      const idx = STATE.figures.findIndex(f => f.id === STATE.selectedId);
      const next = STATE.figures[(idx + 1) % STATE.figures.length];
      figPanel.selectFigure(next.id);
    }
  });

  // ── WS connect + seed figure ───────────────────────────────────────
  wsClient.connectWS();
  figPanel.addFigure({ x: 0, z: 0 });

  // ── Tick loop ──────────────────────────────────────────────────────
  let lastTickMs = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickMs) / 1000);
    lastTickMs = now;
    mannequin.tickSpring(dt);
    hud.updateStatusPill();
    if ((window as any).__brettPostFx) {
      (window as any).__brettPostFx.render(scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  }
  tick();

  // PostFx init
  if ((window as any).BrettPostFx) {
    (window as any).__brettPostFx = (window as any).BrettPostFx.init(renderer);
  }

  console.log('[brett] scene up');
}
