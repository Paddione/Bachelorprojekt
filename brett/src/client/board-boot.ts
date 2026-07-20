// brett/src/client/board-boot.ts — Full 3D-board boot logic (lazy chunk).
// main.ts reaches it via `import('./board-boot')` on first board-view entry,
// keeping the Hauptmenü Three-free.

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
import * as appearanceBadge from './ui/appearance-badge';
import * as persons from './ui/persons';
import * as povCamera from './pov-camera';
import * as freeFly from './free-fly-camera';
import { initBoardTouchControls } from './touch-controls';
import * as exportUi from './ui/export';
import * as importUi from './ui/import';
import * as groundObjects from './ground-objects';
import { initZoneEditing } from './ui/zone-editor';
import * as cameraModes from './camera-modes';
import * as viewCone from './view-cone';
import * as snapping from './snapping';
import { t, initLang, applyTranslations } from './i18n';
import { maybeStartOnboarding } from './ui/onboarding';
import { initUndoRedo } from './ui/undo-redo-ui';
import { updateLinePositions } from './scene-lines';
import { createModerationElements } from './board-moderation-ui';
import { maybeStartReplayMode } from './replay-board';
export { maybeStartReplayMode, applyReplayStateToScene } from './replay-board';
import { mountInviteButton } from './ui/topbar-invite';
import { mountShareButton } from './ui/topbar-share';
import { mountTemplateSaveButton } from './ui/board-template-save';
import { mountParticipantsButton } from './ui/topbar-participants';
import { showLateJoinToast } from './ui/late-join-toast';
import { initExportToast } from './ui/export-toast';
import { mountFilterInput, getFilterQuery, updateFilterVisuals } from './ui/topbar-filter';
import { dblclickFloorAction } from './board-dblclick';

export async function bootBoard(): Promise<void> {
  // ── Scene ──────────────────────────────────────────────────────────
  // ── E8: Sprache initialisieren, bevor UI-Elemente montieren ────────────────
  initLang();

  const sceneApi = initScene();
  const { renderer, scene, camera } = sceneApi;

  // ── E3: 2D/3D-Kameramodus (Ortho top-down ⇄ Orbit-Perspektive) ─────────────
  cameraModes.initCameraModes(camera, window.innerWidth, window.innerHeight - 36);
  window.addEventListener('resize', () => cameraModes.onResize(window.innerWidth, window.innerHeight - 36));
  hud.mountViewToggle({
    id: 'btn-view-2d', label: t('topbar.view2d'), i18nKey: 'topbar.view2d', initialOn: false,
    onToggle: () => {
      const is2D = cameraModes.toggleMode() === '2d';
      const btn = document.getElementById('btn-view-2d');
      if (btn) { btn.textContent = is2D ? t('topbar.view3d') : t('topbar.view2d'); btn.dataset.on = is2D ? '1' : '0'; }
    },
  });
  // ── E6: Sichtkegel-Toggle (default an) ─────────────────────────────────────
  hud.mountViewToggle({
    id: 'btn-view-cone', label: t('topbar.viewCone'), i18nKey: 'topbar.viewCone', initialOn: true,
    onToggle: (on) => viewCone.setEnabled(on),
  });
  // ── E7: Magnet-/Snapping-Toggle (default aus) ──────────────────────────────
  hud.mountViewToggle({
    id: 'btn-magnet', label: t('topbar.magnet'), i18nKey: 'topbar.magnet', initialOn: false,
    onToggle: (on) => snapping.setMagnet(on),
  });
  hud.mountLangSelect(); // E8: Sprachumschalter DE/EN/FR/ES


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
  initExportToast();

  // ── Import-UI (00899a42) ────────────────────────────────────────────────────
  importUi.initImportButton();

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

  if ((window as any).__brettIsZuschauer) {
    _isAdmin = false;
  }

  // ── UI init ────────────────────────────────────────────────────────
  figPanel.initFigPanel();
  appearance.initAppearance();
  persons.initPersons();

  // ── Coachee late-join UI (T000555) ─────────────────────────────────
  const inviteSlot = document.getElementById('topbar-invite-slot');
  const participantsSlot = document.getElementById('topbar-participants-slot');
  const filterSlot = document.getElementById('topbar-filter-slot');
  const myRole = () => wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
  let inviteCtl: { refresh: () => void } | null = null;
  if (inviteSlot) {
    inviteCtl = mountInviteButton(inviteSlot, () => wsClient.getLobbyState()?.sessionCode ?? null);
  }
  let participantsPanel: { update: () => void } | null = null;
  if (participantsSlot) {
    participantsPanel = mountParticipantsButton(participantsSlot, {
      getLobbyState: wsClient.getLobbyState,
      sendClient: wsClient.sendClient,
      isLeiter: () => myRole() === 'leiter',
    });
  }
  if (filterSlot) {
    mountFilterInput(filterSlot, {
      onChange: (_q) => { /* tick loop reads getFilterQuery() directly */ },
    });
  }
  mountShareButton(document.getElementById('topbar-share-slot'), {
    roomToken: new URLSearchParams(location.search).get('room') || 'default',
    role: myRole(),
    isAdmin: _isAdmin,
  });
  const topbarShareSlot = document.getElementById('topbar-share-slot');
  if (topbarShareSlot && myRole() === 'leiter') {
    mountTemplateSaveButton(topbarShareSlot.parentElement!, {
      getState: () => ({ figures: STATE.figures.map(f => ({ id: f.id, label: f.label, x: f.root.position.x, z: f.root.position.z, facingY: f.facingY })) }),
      onSaved: () => {},
    });
  }

  wsClient.setLateJoinHandler((name) => {
    if (myRole() === 'leiter') showLateJoinToast(name);
    participantsPanel?.update();
  });

  // Keep invite-button visibility + panel in sync when the roster/session code
  // changes. Chain onto any existing lobbyChange consumer rather than clobbering.
  const prevLobbyChange = wsClient.getLobbyChangeHandler?.() ?? null;
  wsClient.setLobbyChangeHandler((state) => {
    prevLobbyChange?.(state);
    inviteCtl?.refresh();
    participantsPanel?.update();
  });

  // ── D-spec: Observer hint + possession release button ──────────────
  const { observerHint, releaseBtn, freezeBanner } = createModerationElements();
  releaseBtn.addEventListener('click', () => {
    hud.releaseAllPossessions();
  });

  initUndoRedo(wsClient, hud, _isAdmin);

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

  // ── T000468: Admin-Toolbar für Anker & Zonen (DARK-LAUNCH) ──────────────────
  if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
    groundObjects.initGroundObjectsToolbar(renderer, sceneApi, camera, raycaster, mannequin);
    // E1: Zonen-Editor (Drag verschieben + Doppelklick-Edit-Popover).
    initZoneEditing({ renderer, raycaster, mannequin, floor: sceneApi.floor });
  }

  // ── T000606: Touch / Pointer-Events handler ────────────────────────────────
  initBoardTouchControls({
    renderer,
    camera,
    raycaster,
    sceneApi,
    getCurrentModerationState: () => currentModerationState,
  });

  (window as any).__brettScene = sceneApi;

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
    raycaster.setFromCamera(ndc, cameraModes.getActiveCamera());
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
      // E7: bei aktivem Magnet die Figur aufs Raster/Achsen einrasten (+ move).
      snapping.finishDrag(fig);
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

  renderer.domElement.addEventListener('dblclick', (e) => {
    // Feature 2: dblclick on a figure → open the appearance drawer directly.
    const contact = mannequin.pickContact(e);
    if (contact) {
      const fig = STATE.figures.find(f => f.id === contact.userData.figureId);
      if (fig) {
        const lock = activeLocks.get(fig.id);
        if (lock && lock.userId !== currentUser.userId) { e.preventDefault(); return; }
        figPanel.selectFigure(fig.id);
        appearance.openAppearanceDrawer();
        appearanceBadge.hideBadge();
      }
      return;
    }
    // No figure hit → D1: dblclick on free floor always spawns a new figure.
    const floorPt = mannequin.pickFloor(e);
    if (!floorPt) return;
    // E7: Magnet snappt auch den Doppelklick-Platzierungspunkt.
    const others = STATE.figures.filter(f => f.id !== STATE.selectedId).map(f => ({ x: f.x, z: f.z }));
    const target = snapping.snap({ x: floorPt.x, z: floorPt.z }, others);
    const action = dblclickFloorAction(target);
    figPanel.addFigure({ x: action.x, z: action.z });
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

  // T000471: Wire moderation change handler — update visuals on server push
  // Declared before the async gap (maybeStartReplayMode) to prevent TDZ errors
  // if a mousedown fires during the async fetch in replay mode.
  let currentModerationState: ClientModerationState = { spotlight: null, dim: null, freeze: false };

  // ── WS connect + seed figure ───────────────────────────────────────
  // Replay mode (Slice 5, T000472) takes precedence over a live WS connection:
  // it reconstructs board state locally from recorded events and never connects.
  const isReplayMode = await maybeStartReplayMode();
  if (!isReplayMode) {
    wsClient.connectWS();
  }
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
    if (!isReplayMode) updateLinePositions();
    mannequin.updatePossessionVisuals(STATE.figures, currentUser.userId);
    // T000471: Moderation visuals (Spotlight/Dim/Freeze)
    mannequin.updateModerationVisuals(STATE.figures, currentModerationState);
    // T000607: Filter visuals (dim non-matching figures)
    updateFilterVisuals(STATE.figures, getFilterQuery());
    // E6: Sichtkegel live an Position/Blickrichtung ausrichten.
    viewCone.refreshAll(STATE.figures);

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

    // Feature 2: update the floating appearance badge each frame.
    appearanceBadge.updateBadge(camera, renderer, (figId) => {
      const fig = STATE.figures.find((f: any) => f.id === figId) as any;
      if (!fig || !fig.root) return null;
      const v = new THREE.Vector3();
      const headGroup = fig.root.getObjectByName('head');
      const src = headGroup ?? fig.headMesh ?? fig.root;
      src.getWorldPosition(v);
      v.y += 0.15;
      return v;
    });

    const activeCam = cameraModes.getActiveCamera();
    if ((window as any).__brettPostFx) {
      (window as any).__brettPostFx.render(scene, activeCam);
    } else {
      renderer.render(scene, activeCam);
    }
  }
  tick();

  // PostFx init
  if ((window as any).BrettPostFx) {
    (window as any).__brettPostFx = (window as any).BrettPostFx.init(renderer);
  }

  // Feature 3: one-time onboarding for the coach (leiter). Delayed so the scene
  // is visible first. Role is read lazily inside the delay — the WS roster may not
  // be populated yet when bootBoard() first runs (snapshot arrives asynchronously).
  maybeStartOnboarding({
    role: () => wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role,
  });

  // ── E8: Übersetzungen auf alle montierten [data-i18n]-Elemente anwenden ─────
  applyTranslations();

  console.log('[brett] scene up');
}

