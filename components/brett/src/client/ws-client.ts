import { STATE, activeLocks } from './state';
import { applyLineMessage } from './scene-lines';
import type { ServerMessage } from '../types/messages';
import type { Phase, Participant } from '../types/state';
import { updateExportCache } from './ui/export';
import { createLobbyState, type LobbyState } from './lobby-store';
import { showExportToast } from './ui/export-toast';
import { handleLobbyMessage } from './ws-lobby-handlers';
import { setMessageHandler } from './ws-connection-client';
import { applyUndoStateChange } from './ws-undo-state';
import { toExportLine } from './ws-export-mappers';
import { handleGroundMessage } from './ws-message-ground';
import { handleSnapshotMessage } from './ws-message-snapshot';
import { handleFigureMessage } from './ws-message-figures';

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

  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement | null;

  switch (msg.type) {
    case 'snapshot':
      handleSnapshotMessage(msg, {
        getLobbyState: () => lobbyState,
        setLobbyState: (s) => { lobbyState = s; },
        onLobbyChange,
        onPhaseChange,
        setModerationState: (s) => { moderationState = s; },
        onModerationChange,
        applyAppearance: applyAppearanceToFig,
        setLockBadge: setFigureLockBadge,
        clearLockBadge: clearFigureLockBadge,
        stiffSlider,
      });
      break;

    case 'stiffness':
      STATE.stiffness = msg.value;
      if (stiffSlider) {
        stiffSlider.value = String(msg.value);
      }
      updateExportCache({ stiffness: msg.value ?? STATE.stiffness });
      break;

    case 'add':
    case 'update':
    case 'move':
    case 'jump':
    case 'delete':
    case 'figure_possessed':
    case 'figure_released':
    case 'figure_note_changed':
    case 'figure_hidden_changed':
      handleFigureMessage(msg, { applyAppearance: applyAppearanceToFig });
      break;

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

    case 'info': {
      STATE.online = msg.count || 1;
      const onlineCountEl = document.getElementById('online-count');
      if (onlineCountEl) {
        onlineCountEl.textContent = String(STATE.online);
      }
      break;
    }

    // ── Lobby / presence / session routing (§6c) ────────────────────────────
    case 'lobby_settings_change':
    case 'presence_join':
    case 'presence_leave':
    case 'role_changed':
    case 'lobby_ready_changed':
    case 'session_created':
    case 'session_phase_change':
    case 'session_ended':
    case 'admin_token_changed':
    case 'coaching_steps_change':
      handleLobbyMessage(msg, {
        getLobbyState: () => lobbyState,
        setLobbyState: (s) => { lobbyState = s; },
        onLobbyChange,
        onPhaseChange,
        decideLateJoin,
        lateJoinHandler,
      });
      break;

    case 'figure_owner_changed':
      // Routed/stored only in B — ownership badge apply lands in Phase C.
      break;

    case 'figure_type_changed':
      // Figure type change — no local action needed (lobby roster re-renders from store)
      break;

    case 'moderation_state': {
      moderationState = { spotlight: msg.spotlight, dim: msg.dim, freeze: msg.freeze };
      onModerationChange(moderationState);
      break;
    }

    case 'undo_stack_changed':
      applyUndoStateChange(msg.canUndo, msg.canRedo, msg.undoCount, msg.redoCount);
      break;

    case 'error':
      // Non-fatal protocol error from the server (e.g. forbidden / not-ready).
      console.warn('[brett] server error:', msg.reason);
      if (msg.reason === 'session-active') {
        showExportToast('Es läuft bereits eine Sitzung. Bitte beende diese zuerst.', 'error');
      } else if (msg.reason === 'unknown-board-template') {
        // T900361: Lobby-Dropdown mit unbekannter Template-ID.
        showExportToast('Vorlage nicht gefunden.', 'error');
      } else {
        showExportToast(`Server-Fehler: ${msg.reason ?? 'unbekannt'}`, 'error');
      }
      break;

    // ── T000468: Boden-Anker & Zonen (DARK-LAUNCH-Rendering, Cache immer pflegen) ─
    case 'anchor_added':
    case 'anchor_removed':
    case 'zone_added':
    case 'zone_updated':
    case 'zone_removed':
      handleGroundMessage(msg);
      break;

    // ── T000467: Beziehungs-/Spannungslinien (delegiert an scene-lines.ts) ──
    case 'line_created':
    case 'line_deleted':
    case 'line_type_changed':
      applyLineMessage(msg);
      // Export-Cache mit aktuellem STATE.lines synchronisieren (scene-lines.ts
      // mutiert STATE.lines, hat aber keinen Export-Cache-Zugriff — T000605):
      updateExportCache({ lines: STATE.lines.map(toExportLine) });
      break;

    default:
      break;
  }
}

setMessageHandler(onWsMessage);

// Re-exports für Rückwärtskompatibilität
export { undoState, setUndoStateChangeHandler } from './ws-undo-state';
export {
  sendClient, isWsOpen, sendMove, sendJump, sendUpdate, sendStiffness,
  sendDelete, sendUndo, sendRedo, sendAddFigure, setWsOpenHandler, connectWS,
  buildSyncUrl,
} from './ws-connection-client';
