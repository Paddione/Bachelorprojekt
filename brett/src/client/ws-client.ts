import { STATE, getWs, setWs, isWsReady, setWsReady, activeLocks, lockSprites, getScene, currentUser } from './state';
import type { ClientMessage, ServerMessage } from '../types/messages';
import type { Phase } from '../types/state';
import * as mannequin from './mannequin';
import { PRESETS } from './presets';
import { createLobbyState, applyLobbyServerMessage, type LobbyState } from './lobby-store';
import { applyOptikToScene } from './ui/optik';

// ── Lobby/presence/session state (pure reducer; see lobby-store.ts) ──────────
let lobbyState: LobbyState = createLobbyState();
export function getLobbyState(): LobbyState { return lobbyState; }

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

const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';

function send(msg: ClientMessage): void {
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** Public send for lobby/admin protocol messages (e.g. admin_round_start, lobby_set_ready). */
export function sendClient(msg: ClientMessage): void {
  send(msg);
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

export function connectWS(): void {
  // Thread room + (when known) the canonical identity into the /sync handshake so
  // the late-join guard (shouldRejectReconnect) can distinguish a true reconnect
  // of an already-active player from a genuine late-joiner. Omit playerId when
  // unknown/anon (server treats null as "not previously in room" → admit).
  const params = new URLSearchParams({ room: roomFromUrl });
  if (currentUser.userId && currentUser.userId !== 'anon') {
    params.set('playerId', currentUser.userId);
  }
  const ws = new WebSocket(`${wsProto}//${location.host}/sync?${params.toString()}`);
  setWs(ws);
  (window as any).__brettWS = ws;
  ws.addEventListener('open', () => {
    setWsReady(true);
    send({ type: 'join', room: roomFromUrl });
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

  const { scene } = getScene();
  const presets = PRESETS;
  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement | null;

  switch (msg.type) {
    case 'snapshot':
      // Reset world from server state
      for (const f of STATE.figures) {
        scene.remove(f.root);
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
      break;

    case 'stiffness':
      STATE.stiffness = msg.value;
      if (stiffSlider) {
        stiffSlider.value = String(msg.value);
      }
      break;

    case 'add': {
      if (STATE.figures.find(f => f.id === msg.figure.id)) break;
      const fig = mannequin.makeMannequin(msg.figure.id, { x: msg.figure.x, z: msg.figure.z });
      if (msg.figure.appearance) {
        applyAppearanceToFig(fig, msg.figure.appearance);
      }
      STATE.figures.push(fig);
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
        scene.remove(STATE.figures[idx].root);
        STATE.figures.splice(idx, 1);
      }
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

    case 'init':
    case 'presence_join':
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
      break;
    }

    case 'admin_token_changed':
    case 'coaching_steps_change':
      // Routed (no silent drop); board-side handlers consume these elsewhere.
      break;

    case 'figure_owner_changed':
      // Routed/stored only in B — ownership badge apply lands in Phase C.
      break;

    case 'error':
      // Non-fatal protocol error from the server (e.g. forbidden / not-ready).
      console.warn('[brett] server error:', msg.reason);
      break;

    default:
      break;
  }
}
