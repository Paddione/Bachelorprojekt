import { STATE, activeLocks, getScene, currentUser } from './state';
import { initLinesFromSnapshot, applyLineMessage } from './scene-lines';
import type { ServerMessage } from '../types/messages';
import type { Phase, Participant } from '../types/state';
import { updateExportCache } from './ui/export';
import * as mannequin from './mannequin';
import { PRESETS } from './presets';
import { createLobbyState, applyLobbyServerMessage, type LobbyState } from './lobby-store';
import { applyOptikToScene } from './ui/optik';
import * as groundObjects from './ground-objects';
import { handleLobbyMessage } from './ws-lobby-handlers';
import { setMessageHandler } from './ws-connection-client';
import { applyUndoStateChange } from './ws-undo-state';
import { toExportFig, toExportLine } from './ws-export-mappers';
import { handleGroundMessage } from './ws-message-ground';

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
        mannequin.disposeMannequin(f);
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
        figures: ((msg as any).figures ?? []).map(toExportFig),
        lines: ((msg as any).lines ?? []).map(toExportLine),
        anchors: [...((msg as any).anchors ?? [])],
        zones: [...((msg as any).zones ?? [])],
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
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
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
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
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
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
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
        try {
          mannequin.disposeMannequin(STATE.figures[idx]);
          getScene().scene.remove(STATE.figures[idx].root);
        } catch { /* pre-scene */ }
        // Billboard-Cleanup (Feature-Flag sf-t000469)
        import('./ui/hud').then(m => {
          if (typeof (m as any).clearFigureNoteBillboard === 'function') {
            (m as any).clearFigureNoteBillboard(msg.id);
          }
        }).catch(() => {});
        STATE.figures.splice(idx, 1);
      }
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
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

