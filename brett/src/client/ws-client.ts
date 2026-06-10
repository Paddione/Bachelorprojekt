import { STATE, getWs, setWs, setWsReady, activeLocks, getScene, currentUser } from './state';
import { initLinesFromSnapshot, applyLineMessage } from './scene-lines';
import type { ClientMessage, ServerMessage } from '../types/messages';
import type { Phase, Participant } from '../types/state';
import { updateExportCache, type ExportFigure } from './ui/export';
import * as mannequin from './mannequin';
import { PRESETS } from './presets';
import { createLobbyState, applyLobbyServerMessage, type LobbyState } from './lobby-store';
import { applyOptikToScene } from './ui/optik';
import * as groundObjects from './ground-objects';
/** Mappt eine runtime-Figure auf das serialisierbare ExportFigure-Format. */
function _toExportFig(fig: any): ExportFigure {
  return {
    id: fig.id,
    label: fig.label,
    x: fig.root?.position?.x ?? fig.x ?? 0,
    z: fig.root?.position?.z ?? fig.z ?? 0,
    facingY: fig.facingY ?? 0,
    color: fig.appearance?.color ?? fig.color,
    figureType: fig.figureType,
    ownerId: fig.ownerId,
  };
}
// ── T000470: Undo/Redo-Stack-Status ─────────────────────────────────────
export const undoState = {
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
};
let onUndoStateChange: ((state: typeof undoState) => void) | null = null;
export function setUndoStateChangeHandler(fn: typeof onUndoStateChange): void {
  onUndoStateChange = fn;
}

function applyUndoStateChange(
  canUndo: boolean, canRedo: boolean, undoCount: number, redoCount: number,
): void {
  undoState.canUndo = canUndo;
  undoState.canRedo = canRedo;
  undoState.undoCount = undoCount;
  undoState.redoCount = redoCount;
  if (onUndoStateChange) onUndoStateChange({ ...undoState });
}
// ── Lobby/presence/session state (pure reducer) ─────────────────────────────
let lobbyState: LobbyState = createLobbyState();
export function getLobbyState(): LobbyState { return lobbyState; }

// Moderation-State (T000471): Spotlight / Dim / Freeze
export interface ClientModerationState {
  spotlight: string | null;
  dim: string | null;
  freeze: boolean;
}
let moderationState: ClientModerationState = { spotlight: null, dim: null, freeze: false };
export function getModerationState(): ClientModerationState { return moderationState; }
// Injected callback: fired when moderation state changes (board-boot wires this)
let onModerationChange: (state: ClientModerationState) => void = () => {};
export function setModerationChangeHandler(fn: (state: ClientModerationState) => void): void {
  onModerationChange = fn;
}

// View-machine notifier — injected by board-boot / app-shell wiring. Fires on
// every server-driven phase change so menu→lobby→board routing stays in sync.
let onPhaseChange: (phase: Phase | null) => void = () => {};
export function setPhaseChangeHandler(fn: (phase: Phase | null) => void): void {
  onPhaseChange = fn;
}
// Lobby roster/settings change notifier — injected by the lobby screen (B16).
let onLobbyChange: (state: LobbyState) => void = () => {};
export function setLobbyChangeHandler(fn: (state: LobbyState) => void): void {
  onLobbyChange = fn;
}
export function getLobbyChangeHandler(): (state: LobbyState) => void {
  return onLobbyChange;
}

// T000555: Late-join notification hook (leader toast + panel refresh)
export function decideLateJoin(
  phase: Phase | null,
  participant: Participant | undefined,
): { notify: boolean; name: string } {
  const name = participant?.name ?? 'Unbekannt';
  const inSession = phase === 'active' || phase === 'warmup' || phase === 'paused';
  return { notify: inSession, name };
}
let lateJoinHandler: ((name: string) => void) | null = null;
export function setLateJoinHandler(cb: ((name: string) => void) | null): void {
  lateJoinHandler = cb;
}

function send(msg: ClientMessage): void {
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
/** Public send for lobby/admin protocol messages. */
export function sendClient(msg: ClientMessage): void {
  send(msg);
}
/** True iff a socket exists and is OPEN (used to decide sync-send vs open-hook). */
export function isWsOpen(): boolean {
  const ws = getWs();
  return !!ws && ws.readyState === WebSocket.OPEN;
}

export function sendMove(id: string, x: number, z: number, facingY: number): void {
  send({ type: 'move', id, x, z, facingY });
}
export function sendJump(id: string): void {
  send({ type: 'jump', id });
}
export function sendUpdate(fig: any, changes: any): void {
  send({ type: 'update', id: fig.id, changes });
}
export function sendStiffness(value: number): void {
  send({ type: 'stiffness', value });
}
export function sendDelete(): void {
  if (STATE.selectedId) {
    send({ type: 'delete', id: STATE.selectedId });
  }
}
export function sendUndo(): void {
  send({ type: 'session_undo' });
}
export function sendRedo(): void {
  send({ type: 'session_redo' });
}
export function sendAddFigure(fig: any): void {
  send({
    type: 'add',
    figure: {
      id: fig.id,
      x: fig.root.position.x,
      z: fig.root.position.z,
      facingY: fig.facingY,
      label: fig.label,
      color: fig.color,
      appearance: fig.appearance
    }
  });
}

// One-shot callback after WS OPEN + `join` frame (FE-1/REG-4 bootstrap)
let onWsOpen: (() => void) | null = null;
export function setWsOpenHandler(fn: (() => void) | null): void {
  onWsOpen = fn;
}
export function connectWS(): void {
  // REG-2: idempotent — never open a second socket if one is already
  // CONNECTING/OPEN. The lobby bootstrap (main.ts) opens the socket as soon as the
  // room is known, and bootBoard() later also calls connectWS() when the board
  // mounts; without this guard that would create a duplicate connection.
  const existing = getWs();
  if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
    return;
  }
  // Thread room + (when known) the canonical identity into the /sync handshake so
  // the late-join guard (shouldRejectReconnect) can distinguish a true reconnect
  // of an already-active player from a genuine late-joiner. Omit playerId when
  // unknown/anon (server treats null as "not previously in room" → admit).
  const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
  const params = new URLSearchParams({ room: roomFromUrl });
  if (currentUser.userId && currentUser.userId !== 'anon') {
    params.set('playerId', currentUser.userId);
  }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/sync?${params.toString()}`);
  setWs(ws);
  (window as any).__brettWS = ws;
  ws.addEventListener('open', () => {
    setWsReady(true);
    send({ type: 'join', room: roomFromUrl });
    // FE-1/REG-4: fire the bootstrap's one-shot hook (e.g. admin_session_create)
    // only AFTER the socket is OPEN and `join` is sent, so it never races the
    // handshake.
    if (onWsOpen) onWsOpen();
  });
  ws.addEventListener('close', () => {
    setWsReady(false);
    setTimeout(connectWS, 2000);
  });
  ws.addEventListener('message', onWsMessage);
}
// Injected to avoid cycle with appearance.ts.
let applyAppearanceToFig: (fig: any, a: any) => void = () => {};
export function setApplyAppearance(fn: typeof applyAppearanceToFig): void {
  applyAppearanceToFig = fn;
}

let setFigureLockBadge: (id: string, name: string, color: string) => void = () => {};
let clearFigureLockBadge: (id: string) => void = () => {};
let clearLockBadgesForUser: (userId: string) => void = () => {};
let cancelDragFor: (id: string) => void = () => {};
export function setLockBadgeFns(fns: {
  setFigureLockBadge: typeof setFigureLockBadge;
  clearFigureLockBadge: typeof clearFigureLockBadge;
  clearLockBadgesForUser: typeof clearLockBadgesForUser;
  cancelDragFor: typeof cancelDragFor;
}): void {
  setFigureLockBadge = fns.setFigureLockBadge;
  clearFigureLockBadge = fns.clearFigureLockBadge;
  clearLockBadgesForUser = fns.clearLockBadgesForUser;
  cancelDragFor = fns.cancelDragFor;
}
export function onWsMessage(evt: MessageEvent): void {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(evt.data);
  } catch {
    return;
  }

  const presets = PRESETS;
  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement | null;

  switch (msg.type) {
    case 'snapshot': {
      // scene may not be initialized yet when main.ts connects the WS early
      // (before bootBoard()/initScene()). Process lobby/phase parts regardless;
      // skip scene-graph mutations until the scene is ready.
      let sceneForSnapshot: ReturnType<typeof getScene> | null = null;
      try { sceneForSnapshot = getScene(); } catch { /* pre-scene lobby snapshot */ }
      // Reset world from server state
      for (const f of STATE.figures) {
        sceneForSnapshot?.scene.remove(f.root);
      }
      STATE.figures.length = 0;
      STATE.selectedId = null;
      for (const f of (msg.figures || [])) {
        const fig = mannequin.makeMannequin(f.id, { x: f.x ?? 0, z: f.z ?? 0 });
        fig.facingY = f.facingY ?? 0;
        fig.root.rotation.y = fig.facingY;
        if (f.preset && presets[f.preset]) {
          for (const name of mannequin.BONE_NAMES) {
            fig.bone[name].targetRot.x = presets[f.preset][name].x;
            fig.bone[name].targetRot.z = presets[f.preset][name].z;
          }
        }
        if (f.boneOverrides) {
          fig.boneOverrides = { ...f.boneOverrides };
        }
        (fig as any)._serverPossessor = (f as any).possessor ?? null;
        // Notizen aus Snapshot wiederherstellen (Slice 5, T000469)
        if ((f as any).note !== undefined) {
          (fig as any).note = (f as any).note;
        }
        STATE.figures.push(fig);
        if (f.appearance) {
          applyAppearanceToFig(fig, f.appearance);
        }
      }
      if (typeof msg.stiffness === 'number') {
        STATE.stiffness = msg.stiffness;
        if (stiffSlider) {
          stiffSlider.value = String(msg.stiffness);
        }
      }
      if (STATE.figures[0]) {
        (window as any).selectFigure(STATE.figures[0].id);
      }

      // Clear all visual lock badges first
      for (const figId of activeLocks.keys()) {
        clearFigureLockBadge(figId);
      }
      activeLocks.clear();
      // Rehydrate locks
      for (const l of (msg.locks || [])) {
        activeLocks.set(l.figureId, { userId: l.userId, name: l.name, color: l.color });
        setFigureLockBadge(l.figureId, l.name, l.color);
      }
      // Apply persisted board-optik on mount so late-joiners/reloads render the
      // saved look (§4.1 dead seam closed end-to-end, D11).
      if (msg.optik) applyOptikToScene(msg.optik);
      // NEU T000468: Ground-Objects aus Snapshot initialisieren (DARK-LAUNCH)
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.initGroundObjectsFromSnapshot(msg.anchors ?? [], msg.zones ?? []);
      }

      initLinesFromSnapshot(msg.lines ?? []);  // T000467
      // T000471: rehydrate moderation state from join snapshot
      if ((msg as any).moderation) {
        moderationState = {
          spotlight: (msg as any).moderation.spotlight ?? null,
          dim: (msg as any).moderation.dim ?? null,
          freeze: (msg as any).moderation.freeze ?? false,
        };
        onModerationChange(moderationState);
      }

      // Billboard-Wiederherstellung für alle Figuren mit Notizen (Feature-Flag sf-t000469)
      {
        const feats: Record<string, boolean> =
          (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
        if (feats['sf-t000469']) {
          import('./ui/hud').then(m => {
            if (typeof (m as any).setFigureNoteBillboard === 'function') {
              for (const f of STATE.figures) {
                if ((f as any).note) {
                  (m as any).setFigureNoteBillboard(f.id, (f as any).note);
                }
              }
            }
          }).catch(() => {});
        }
      }
      // FE-2: the join snapshot is the FIRST (often ONLY) state a client gets on
      // connect, and it carries the authoritative phase/sessionCode/roster. Route
      // it through the lobby reducer and drive the view-machine on a phase change
      // — exactly like the presence/session cases below — so a `?room=`/`/api/join`
      // joiner into a `lobby`-phase session lands on the lobby screen instead of
      // staring at empty board chrome.
      {
        const prevPhase = lobbyState.phase;
        lobbyState = applyLobbyServerMessage(lobbyState, msg);
        onLobbyChange(lobbyState);
        if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      }
      // Export-Cache aktualisieren:
      updateExportCache({
        phase: (msg as any).phase ?? 'lobby',
        sessionCode: (msg as any).sessionCode ?? null,
        stiffness: (msg as any).stiffness ?? STATE.stiffness,
        figures: ((msg as any).figures ?? []).map(_toExportFig),
        optik: (msg as any).optik ?? null,
      });
      break;
    }

    case 'stiffness':
      STATE.stiffness = msg.value;
      if (stiffSlider) {
        stiffSlider.value = String(msg.value);
      }
      updateExportCache({ stiffness: msg.value ?? STATE.stiffness });
      break;

    case 'add': {
      if (STATE.figures.find(f => f.id === msg.figure.id)) break;
      const fig = mannequin.makeMannequin(msg.figure.id, { x: msg.figure.x, z: msg.figure.z });
      (fig as any)._serverPossessor = (msg.figure as any).possessor ?? null;
      if (msg.figure.appearance) {
        applyAppearanceToFig(fig, msg.figure.appearance);
      }
      STATE.figures.push(fig);
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(_toExportFig) });
      break;
    }
    case 'update': {
      const fig = STATE.figures.find(f => f.id === msg.id);
      if (!fig) break;
      const c = msg.changes || {};
      if (c.preset && presets[c.preset]) {
        for (const name of mannequin.BONE_NAMES) {
          fig.bone[name].targetRot.x = presets[c.preset][name].x;
          fig.bone[name].targetRot.z = presets[c.preset][name].z;
        }
      }
      if (c.boneOverrides !== undefined) {
        fig.boneOverrides = { ...c.boneOverrides };
      }
      if (c.appearance !== undefined) {
        applyAppearanceToFig(fig, c.appearance);
      }
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(_toExportFig) });
      break;
    }
    case 'figure_locked': {
      activeLocks.set(msg.id, { userId: msg.userId, name: msg.name, color: msg.color });
      setFigureLockBadge(msg.id, msg.name, msg.color);
      break;
    }

    case 'figure_unlocked': {
      clearFigureLockBadge(msg.id);
      break;
    }

    case 'figure_lock_denied': {
      cancelDragFor(msg.id);
      break;
    }

    case 'locks_released_for': {
      clearLockBadgesForUser(msg.userId);
      break;
    }

    case 'move': {
      const fig = STATE.figures.find(f => f.id === msg.id);
      if (!fig) break;
      fig.root.position.x = msg.x;
      fig.root.position.z = msg.z;
      if (typeof msg.facingY === 'number') {
        fig.facingY = msg.facingY;
        fig.root.rotation.y = fig.facingY;
      }
      mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(_toExportFig) });
      break;
    }

    case 'jump': {
      const fig = STATE.figures.find(f => f.id === msg.id);
      if (fig && !fig.jumping) {
        mannequin.startJump(fig);
      }
      break;
    }

    case 'delete': {
      const idx = STATE.figures.findIndex(f => f.id === msg.id);
      if (idx >= 0) {
        try { getScene().scene.remove(STATE.figures[idx].root); } catch { /* pre-scene */ }
        // Billboard-Cleanup (Feature-Flag sf-t000469)
        import('./ui/hud').then(m => {
          if (typeof (m as any).clearFigureNoteBillboard === 'function') {
            (m as any).clearFigureNoteBillboard(msg.id);
          }
        }).catch(() => {});
        STATE.figures.splice(idx, 1);
      }
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(_toExportFig) });
      break;
    }

    case 'info':
      STATE.online = msg.count || 1;
      const onlineCountEl = document.getElementById('online-count');
      if (onlineCountEl) {
        onlineCountEl.textContent = String(STATE.online);
      }
      break;

    // ── Lobby / presence / session routing (§6c) ────────────────────────────
    // Each delegates to the pure reducer, notifies the lobby UI, and (on a phase
    // change) drives the view-machine. figure_owner_changed + the optik part of
    // lobby_settings_change are routed/stored only in B (badge/optik apply = C/D);
    // the case existing prevents silent drops.
    case 'lobby_settings_change': {
      // Reducer keeps the lobby store (templateId/optik) in sync → lobby UI
      // re-renders via onLobbyChange (this is the templateId UI update, §13).
      // ALSO apply optik to the live scene so it works IN-BOARD, not just the
      // lobby (no-ops if the scene isn't mounted yet).
      const prevPhase = lobbyState.phase;
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      if (msg.optik) applyOptikToScene(msg.optik);
      break;
    }
    case 'presence_join': {
      const prevPhase = lobbyState.phase;
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      const decision = decideLateJoin(lobbyState.phase, msg.participant);
      if (decision.notify) lateJoinHandler?.(decision.name);
      break;
    }
    case 'presence_leave':
    case 'role_changed':
    case 'lobby_ready_changed':
    case 'session_created': {
      const prevPhase = lobbyState.phase;
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      break;
    }
    case 'session_phase_change':
    case 'session_ended': {
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      onPhaseChange(lobbyState.phase);
      if (msg.type === 'session_phase_change') {
        updateExportCache({ phase: (msg as any).phase });
      }
      break;
    }

    case 'admin_token_changed':
    case 'coaching_steps_change':
      // CP-3: route through the lobby reducer so the leader handoff (B14) and the
      // broadcast coaching flow (D10) are actually tracked in the store and the
      // lobby UI re-renders via onLobbyChange — instead of being silently dropped.
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      break;

    case 'figure_owner_changed':
      // Routed/stored only in B — ownership badge apply lands in Phase C.
      break;

    case 'figure_possessed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) (fig as any)._serverPossessor = msg.playerId;
      // Start POV if it's our own possession
      if (msg.playerId === currentUser.userId) {
        import('./pov-camera').then(m => m.startPov(msg.figureId));
      }
      break;
    }
    case 'figure_released': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) (fig as any)._serverPossessor = null;
      // Stop POV if it was our possession
      if (msg.playerId === currentUser.userId) {
        import('./pov-camera').then(m => m.stopPov());
      }
      break;
    }
    case 'figure_type_changed':
      // Figure type change — no local action needed (lobby roster re-renders from store)
      break;

    case 'moderation_state': {
      moderationState = { spotlight: msg.spotlight, dim: msg.dim, freeze: msg.freeze };
      onModerationChange(moderationState);
      break;
    }

    case 'figure_note_changed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) {
        (fig as any).note = msg.note;
        // Panel aktualisieren wenn diese Figur gerade selektiert ist
        if (STATE.selectedId === msg.figureId) {
          const noteArea = document.getElementById('fig-note-textarea') as HTMLTextAreaElement | null;
          if (noteArea) noteArea.value = msg.note;
        }
        // Billboard update (Feature-Flag sf-t000469)
        const feats: Record<string, boolean> =
          (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
        if (feats['sf-t000469']) {
          import('./ui/hud').then(m => {
            if (typeof (m as any).setFigureNoteBillboard === 'function') {
              (m as any).setFigureNoteBillboard(msg.figureId, msg.note);
            }
          }).catch(() => {});
        }
      }
      break;
    }

    case 'undo_stack_changed':
      applyUndoStateChange(msg.canUndo, msg.canRedo, msg.undoCount, msg.redoCount);
      break;

    case 'error':
      // Non-fatal protocol error from the server (e.g. forbidden / not-ready).
      console.warn('[brett] server error:', msg.reason);
      break;

    // ── T000468: Boden-Anker & Zonen (DARK-LAUNCH) ──────────────────────────
    case 'anchor_added': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyAnchorAdded(msg.anchor);
      }
      break;
    }
    case 'anchor_removed': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyAnchorRemoved(msg.anchorId);
      }
      break;
    }
    case 'zone_added': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneAdded(msg.zone);
      }
      break;
    }
    case 'zone_removed': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneRemoved(msg.zoneId);
      }
      break;
    }

    // ── T000467: Beziehungs-/Spannungslinien (delegiert an scene-lines.ts) ──
    case 'line_created':
    case 'line_deleted':
    case 'line_type_changed':
      applyLineMessage(msg);
      break;

    default:
      break;
  }
}
