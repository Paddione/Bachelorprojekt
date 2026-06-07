// brett/src/client/board-boot.ts — Phase A / A5 + T3 (sf-t000465)
//
// The full 3D-board boot logic, moved VERBATIM (behaviour-unchanged) out of the
// former main.ts boot(). This is the lazy chunk: it statically imports Three.js
// + scene + all board UI, so importing it pulls the whole 3D bundle. main.ts only
// ever reaches it via `import('./board-boot')` on first board-view entry, which
// keeps the Hauptmenü Three-free.
//
// T3 additions (DARK-LAUNCH: gated behind window.__brettFeatures['sf-t000465']):
//   • Free-Fly camera mode wired into tick loop with priority POV > Free-Fly > Orbit
//   • F-key toggle: only when local player owns no figure
//   • Esc exits Free-Fly first (capture phase, stopImmediatePropagation)

import * as THREE from 'three';
import { STATE, ui, getWs, isWsReady, currentUser, activeLocks } from './state';
import { initScene } from './scene';
import * as mannequin from './mannequin';
import * as wsClient from './ws-client';
import type { ClientModerationState } from './ws-client';
import * as presets from './presets';
import * as figPanel from './ui/fig-panel';
import * as hud from './ui/hud';
import * as appearance from './ui/appearance';
import * as persons from './ui/persons';
import * as povCamera from './pov-camera';
import * as freeFly from './free-fly-camera';
import * as exportUi from './ui/export';

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

  // ── Export-UI (T000466) ────────────────────────────────────────────────────
  exportUi.initExportButtons(renderer.domElement);

  // ── Auth ───────────────────────────────────────────────────────────
  let _isAdmin = false;
  try {
    const me = await (await fetch('/auth/me')).json();
    if (me.userId) {
      currentUser.userId = me.userId;
      currentUser.name = me.name;
    }
    _isAdmin = !!me.isAdmin;
    if (me.isAdmin) (window as any).__brettCurrentUserIsAdmin = true;
  } catch { /* anon */ }

  // ── UI init ────────────────────────────────────────────────────────
  figPanel.initFigPanel();
  appearance.initAppearance();
  persons.initPersons();

  // ── D-spec: Observer hint + possession release button ──────────────
  const observerHint = document.createElement('div');
  observerHint.id = 'observer-hint';
  observerHint.textContent = 'Klicke eine freie Figur, um sie zu verkörpern';
  Object.assign(observerHint.style, {
    display: 'none',
    position: 'absolute',
    bottom: '56px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--brett-font-mono), monospace',
    fontSize: '10px',
    color: 'var(--brett-brass, #c8a96e)',
    border: '1px dashed var(--brett-brass-dim, rgba(200,169,110,0.14))',
    padding: '6px 14px',
    borderRadius: 'var(--brett-radius-sm, 8px)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    zIndex: '20',
    pointerEvents: 'none',
  });
  document.body.appendChild(observerHint);

  const releaseBtn = document.createElement('button');
  releaseBtn.id = 'btn-release-possession';
  releaseBtn.textContent = '🚶 Loslassen';
  Object.assign(releaseBtn.style, {
    display: 'none',
    position: 'absolute',
    bottom: '52px',
    right: '16px',
    fontFamily: 'var(--brett-font-sans), sans-serif',
    fontSize: '12px',
    background: 'var(--brett-brass, #c8a96e)',
    color: 'var(--brett-ink-900, #0b111c)',
    border: 'none',
    borderRadius: 'var(--brett-radius-sm, 8px)',
    padding: '8px 16px',
    cursor: 'pointer',
    zIndex: '20',
    fontWeight: '600',
  });
  releaseBtn.addEventListener('click', () => {
    hud.releaseAllPossessions();
  });
  document.body.appendChild(releaseBtn);

  // T000471: Freeze-Indikator-Banner
  const freezeBanner = document.createElement('div');
  freezeBanner.id = 'freeze-indicator';
  freezeBanner.textContent = '❄ EINGEFROREN — Figuren koennen nicht bewegt werden';
  Object.assign(freezeBanner.style, {
    display: 'none',
    position: 'absolute',
    top: '44px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--brett-font-mono), monospace',
    fontSize: '10px',
    color: '#7dc8f7',
    border: '1px solid rgba(125,200,247,0.3)',
    background: 'rgba(0,16,32,0.85)',
    padding: '4px 18px',
    borderRadius: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    zIndex: '25',
    pointerEvents: 'none',
  });
  document.body.appendChild(freezeBanner);
  // ── T000468: Admin-Toolbar für Anker & Zonen (DARK-LAUNCH) ──────────────────
  if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
    // Only show for admins (isAdmin was resolved during Auth fetch above)
    const isAdmin = (window as any).__brettCurrentUserIsAdmin === true;
    if (isAdmin) {
      const toolbar = document.createElement('div');
      toolbar.id = 'ground-objects-toolbar';
      Object.assign(toolbar.style, {
        position: 'absolute',
        bottom: '96px',
        right: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: '20',
      });

      // Anker-Button
      const anchorBtn = document.createElement('button');
      anchorBtn.textContent = '⚓ Anker';
      anchorBtn.title = 'Boden-Anker setzen (Klick auf Boden)';
      Object.assign(anchorBtn.style, {
        fontFamily: 'var(--brett-font-mono, monospace)',
        fontSize: '10px',
        padding: '6px 10px',
        background: 'rgba(200,169,110,0.15)',
        border: '1px solid rgba(200,169,110,0.4)',
        color: 'var(--brett-brass, #c8a96e)',
        borderRadius: 'var(--brett-radius-sm, 8px)',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      });

      let anchorPlacingMode = false;
      anchorBtn.addEventListener('click', () => {
        anchorPlacingMode = !anchorPlacingMode;
        anchorBtn.style.background = anchorPlacingMode
          ? 'rgba(200,169,110,0.35)' : 'rgba(200,169,110,0.15)';
        anchorBtn.title = anchorPlacingMode
          ? 'Klicke auf den Boden, um einen Anker zu setzen (Esc abbrechen)'
          : 'Boden-Anker setzen';
        (window as any).__brettAnchorPlacing = anchorPlacingMode;
      });

      document.addEventListener('brett:anchor-placed', () => {
        anchorPlacingMode = false;
        anchorBtn.style.background = 'rgba(200,169,110,0.15)';
        anchorBtn.title = 'Boden-Anker setzen';
      });

      // Zonen-Button
      const zoneBtn = document.createElement('button');
      zoneBtn.textContent = '▭ Zone';
      zoneBtn.title = 'Bodenzone zeichnen';
      Object.assign(zoneBtn.style, {
        fontFamily: 'var(--brett-font-mono, monospace)',
        fontSize: '10px',
        padding: '6px 10px',
        background: 'rgba(78,161,255,0.15)',
        border: '1px solid rgba(78,161,255,0.4)',
        color: 'var(--brett-blue, #4ea1ff)',
        borderRadius: 'var(--brett-radius-sm, 8px)',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      });

      let zonePlacingMode = false;
      zoneBtn.addEventListener('click', () => {
        zonePlacingMode = !zonePlacingMode;
        zoneBtn.style.background = zonePlacingMode
          ? 'rgba(78,161,255,0.35)' : 'rgba(78,161,255,0.15)';
        (window as any).__brettZonePlacing = zonePlacingMode;
      });

      toolbar.appendChild(anchorBtn);
      toolbar.appendChild(zoneBtn);
      document.body.appendChild(toolbar);

      // Floor-click for anchor placement (wired into existing click handler)
      renderer.domElement.addEventListener('click', (e) => {
        if (!(window as any).__brettAnchorPlacing) return;
        const { floor } = sceneApi as any;
        if (!floor) return;
        mannequin.setNdc(e);
        const { ndc } = mannequin.getTickRefs();
        if (!ndc) return;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(floor);
        if (hits.length > 0) {
          const pt = hits[0].point;
          const ws = getWs();
          if (isWsReady() && ws) {
            ws.send(JSON.stringify({
              type: 'anchor_create',
              anchor: { x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10 },
            }));
          }
          (window as any).__brettAnchorPlacing = false;
          document.dispatchEvent(new CustomEvent('brett:anchor-placed'));
        }
      }, { capture: true });
    }
  }

  // ── T000470: Undo/Redo-Buttons (isAdmin-only, Dark-Launch) ────────────────
  const undoBtn = document.createElement('button');
  undoBtn.id = 'btn-undo';
  undoBtn.textContent = '↩ Rückgängig';
  Object.assign(undoBtn.style, {
    display: 'none',
    position: 'absolute',
    bottom: '52px',
    right: '160px',
    fontFamily: 'var(--brett-font-mono, monospace)',
    fontSize: '10px',
    padding: '4px 10px',
    borderRadius: 'var(--brett-radius-sm, 6px)',
    border: '1px solid var(--brett-border, rgba(255,255,255,0.12))',
    background: 'var(--brett-surface-1, rgba(0,0,0,0.45))',
    color: 'var(--brett-fg, #e8e8e8)',
    cursor: 'pointer',
    opacity: '0.4',
    pointerEvents: 'auto',
    zIndex: '20',
  });
  undoBtn.disabled = true;

  const redoBtn = document.createElement('button');
  redoBtn.id = 'btn-redo';
  redoBtn.textContent = '↪ Wiederholen';
  Object.assign(redoBtn.style, {
    display: 'none',
    position: 'absolute',
    bottom: '52px',
    right: '80px',
    fontFamily: 'var(--brett-font-mono, monospace)',
    fontSize: '10px',
    padding: '4px 10px',
    borderRadius: 'var(--brett-radius-sm, 6px)',
    border: '1px solid var(--brett-border, rgba(255,255,255,0.12))',
    background: 'var(--brett-surface-1, rgba(0,0,0,0.45))',
    color: 'var(--brett-fg, #e8e8e8)',
    cursor: 'pointer',
    opacity: '0.4',
    pointerEvents: 'auto',
    zIndex: '20',
  });
  redoBtn.disabled = true;

  document.body.appendChild(undoBtn);
  document.body.appendChild(redoBtn);

  undoBtn.addEventListener('click', () => {
    wsClient.sendUndo();
  });
  redoBtn.addEventListener('click', () => {
    wsClient.sendRedo();
  });

  // Show undo/redo buttons only for admins (T000470)
  if (_isAdmin) {
    undoBtn.style.display = 'inline-block';
    redoBtn.style.display = 'inline-block';
  }

  // Wire undo/redo state change handler to update button enabled state
  wsClient.setUndoStateChangeHandler(({ canUndo, canRedo }) => {
    hud.updateUndoRedoButtons(canUndo, canRedo);
  });

  // T000470: Keyboard shortcuts (Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      wsClient.sendUndo();
    } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      wsClient.sendRedo();
    }
  }, { capture: false });

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
    if (e.button !== 0 || e.shiftKey) {
      // D-spec: Shift+Click while in POV → exit POV for orbit
      if (e.shiftKey && povCamera.isInPov()) {
        povCamera.stopPov();
      }
      return;
    }
    const sphere = mannequin.pickContact(e);
    if (sphere) {
      const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
      if (!fig) return;

      const lock = activeLocks.get(fig.id);
      if (lock && lock.userId !== currentUser.userId) {
        e.preventDefault();
        return; // block!
      }

      // T000471: Freeze-Gate on client — show visual feedback, don't start drag
      if (currentModerationState.freeze) {
        // Leiter-check: fetch role from lobby roster
        const myRole = wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
        if (myRole !== 'leiter') {
          e.preventDefault();
          return; // Server will also reject; client skips drag start
        }
      }

      // D-spec: click on a free figure → possess it instead of locking
      const isFree = !(fig as any)._serverPossessor && !activeLocks.get(fig.id);
      if (isFree) {
        figPanel.selectFigure(fig.id);
        const ws = getWs();
        if (isWsReady() && ws) {
          ws.send(JSON.stringify({ type: 'figure_possess', figureId: fig.id }));
        }
        e.preventDefault();
        return;
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

  // T3 (DARK-LAUNCH: sf-t000465): Esc exits Free-Fly before any other Esc handler.
  // Registered with capture:true so it fires before the bubble-phase handler below.
  window.addEventListener('keydown', (e) => {
    const feats: Record<string, boolean> =
      (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
    if (!feats['sf-t000465']) return;
    if (e.key === 'Escape' && freeFly.isFreeFly()) {
      freeFly.exitFreeFly();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, { capture: true });

  // T3 (DARK-LAUNCH: sf-t000465): F-key toggles Free-Fly mode.
  // Guard: only allowed when the local player does NOT possess a figure.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF') return;
    const tag = (e.target as HTMLElement)?.tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    const feats: Record<string, boolean> =
      (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
    if (!feats['sf-t000465']) return;
    // Guard: F-key only works when local player owns no figure
    const possessedFig = STATE.figures.find(f => (f as any)._serverPossessor === currentUser.userId);
    if (possessedFig) return; // local player is in POV — disallow free-fly toggle
    if (freeFly.isFreeFly()) {
      freeFly.exitFreeFly();
    } else {
      const { camera, renderer } = sceneApi;
      freeFly.enterFreeFly(camera, renderer.domElement);
    }
    e.preventDefault();
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

  // T000471: Wire moderation change handler — update visuals on server push
  let currentModerationState: ClientModerationState = { spotlight: null, dim: null, freeze: false };
  wsClient.setModerationChangeHandler((state) => {
    currentModerationState = state;
    freezeBanner.style.display = state.freeze ? 'block' : 'none';
  });

  figPanel.addFigure({ x: 0, z: 0 });

  // ── Tick loop ──────────────────────────────────────────────────────
  // T3: Single-Writer priority for camera: POV > Free-Fly > Orbit.
  // Only one camera-writer runs per frame. isInPov() is checked first
  // (highest priority), then isFreeFly(), finally the default orbit path.
  let lastTickMs = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickMs) / 1000);
    lastTickMs = now;
    mannequin.tickSpring(dt);
    mannequin.updatePossessionVisuals(STATE.figures, currentUser.userId);
    // T000471: Moderation visuals (Spotlight/Dim/Freeze)
    mannequin.updateModerationVisuals(STATE.figures, currentModerationState);

    // T3 Single-Writer: POV has highest priority
    if (povCamera.isInPov()) {
      // POV active — pov-camera owns the camera write
      povCamera.tickPov();
    } else if (freeFly.isFreeFly()) {
      // Free-Fly active — drive the camera with free-fly tick
      // (DARK-LAUNCH: sf-t000465 — guard already enforced at entry; tick here is safe)
      freeFly.tickFreeFly(dt, camera);
    } else {
      // Default: orbit camera — tickPov still called for lerp-out animation
      povCamera.tickPov();
    }

    // D-spec: Update observer hint + release button visibility
    const possessedFig = STATE.figures.find(f => (f as any)._serverPossessor === currentUser.userId);
    const anyFree = STATE.figures.some(f => !(f as any)._serverPossessor);
    if (observerHint) {
      observerHint.style.display = (!possessedFig && anyFree) ? 'block' : 'none';
    }
    if (releaseBtn) {
      releaseBtn.style.display = possessedFig ? 'block' : 'none';
    }

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
