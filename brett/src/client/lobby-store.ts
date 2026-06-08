// brett/src/client/lobby-store.ts — Phase B / B15
//
// Pure lobby state reducer. NO DOM, NO WebGL, NO `window` — importable under
// node/tsx for unit tests and reused by the lobby screen (B16) + ws-client
// router. The reducer is immutable: it returns a fresh state and never mutates
// the input.

import type { Phase, Role, OptikSettings, LobbySettings } from '../types/state';
import type { ServerMessage } from '../types/messages';

export interface RosterEntry {
  userId: string;
  name: string;
  color: string;
  role?: Role;
  ready?: boolean;
}

export interface LobbyState {
  roster: Record<string, RosterEntry>;
  phase: Phase | null;
  sessionCode: string | null;
  settings: LobbySettings;
  /** Current admin-token holder (leader). Tracked from admin_token_changed (B14). */
  adminTokenHolder: string | null;
  /** Leader-authored coaching flow, broadcast via coaching_steps_change (D10). */
  coachingSteps: { steps: string[]; index: number } | null;
}

export function createLobbyState(): LobbyState {
  return { roster: {}, phase: null, sessionCode: null, settings: {}, adminTokenHolder: null, coachingSteps: null };
}

/**
 * Apply a server message to the lobby state, returning a NEW state object.
 * Only the lobby/presence/session-relevant variants change state; everything
 * else (board mutations, locks, info, …) is a no-op pass-through.
 */
export function applyLobbyServerMessage(state: LobbyState, msg: ServerMessage): LobbyState {
  switch (msg.type) {
    case 'presence_join': {
      const p = msg.participant;
      return {
        ...state,
        roster: { ...state.roster, [p.userId]: { userId: p.userId, name: p.name, color: p.color, role: p.role, ready: p.ready } },
      };
    }
    case 'presence_leave': {
      const next = { ...state.roster };
      delete next[msg.userId];
      return { ...state, roster: next };
    }
    case 'role_changed': {
      const existing = state.roster[msg.userId];
      if (!existing) return state;
      return { ...state, roster: { ...state.roster, [msg.userId]: { ...existing, role: msg.role } } };
    }
    case 'lobby_ready_changed': {
      const existing = state.roster[msg.userId];
      if (!existing) return state;
      return { ...state, roster: { ...state.roster, [msg.userId]: { ...existing, ready: msg.ready } } };
    }
    case 'session_phase_change':
      return { ...state, phase: msg.phase };
    case 'session_ended':
      return { ...state, phase: 'ended' };
    case 'session_created':
      return { ...state, sessionCode: msg.code };
    case 'admin_token_changed':
      // B14: track the current leader so the lobby roster can reflect the handoff
      // (no longer a silent drop — CP-3).
      return { ...state, adminTokenHolder: msg.holderPlayerId };
    case 'coaching_steps_change':
      // D10: the leader-authored coaching flow, broadcast to all boards. Stored so
      // a receiving client can render it (CP-3 — previously silently dropped).
      return { ...state, coachingSteps: { steps: msg.steps, index: msg.index } };
    case 'lobby_settings_change': {
      const settings: LobbySettings = { ...state.settings };
      if (msg.templateId !== undefined) settings.templateId = msg.templateId;
      if (msg.coachingTemplateId !== undefined) settings.coachingTemplateId = msg.coachingTemplateId;
      if (msg.optik !== undefined) settings.optik = mergeOptik(state.settings.optik, msg.optik);
      return { ...state, settings };
    }
    case 'snapshot': {
      // The join snapshot is the FIRST (often only) state a late-joiner receives.
      // It carries the authoritative phase + session code AND — since FE-2/REG-6 —
      // the full participant roster (with persisted roles), so the lobby store is
      // seeded immediately instead of waiting for peers to re-emit presence_join.
      const next: LobbyState = {
        ...state,
        phase: msg.phase ?? state.phase,
        sessionCode: msg.sessionCode ?? state.sessionCode,
      };
      if (msg.participants) {
        const roster: Record<string, RosterEntry> = {};
        for (const p of msg.participants) {
          roster[p.userId] = { userId: p.userId, name: p.name, color: p.color, role: p.role, ready: p.ready };
        }
        next.roster = roster;
      }
      return next;
    }
    default:
      return state;
  }
}

function mergeOptik(prev: OptikSettings | undefined, next: OptikSettings): OptikSettings {
  return { ...(prev ?? {}), ...next };
}
