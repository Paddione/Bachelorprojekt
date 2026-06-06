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
}

export function createLobbyState(): LobbyState {
  return { roster: {}, phase: null, sessionCode: null, settings: {} };
}

/**
 * Apply a server message to the lobby state, returning a NEW state object.
 * Only the lobby/presence/session-relevant variants change state; everything
 * else (board mutations, locks, info, …) is a no-op pass-through.
 */
export function applyLobbyServerMessage(state: LobbyState, msg: ServerMessage): LobbyState {
  switch (msg.type) {
    case 'init': {
      // Seed roster + phase from a full state snapshot.
      const roster: Record<string, RosterEntry> = {};
      for (const p of msg.state.participants ?? []) {
        roster[p.userId] = { userId: p.userId, name: p.name, color: p.color, role: p.role, ready: p.ready };
      }
      return {
        ...state,
        roster,
        phase: msg.state.phase ?? state.phase,
        sessionCode: msg.state.sessionCode ?? state.sessionCode,
      };
    }
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
    case 'lobby_settings_change': {
      const settings: LobbySettings = { ...state.settings };
      if (msg.templateId !== undefined) settings.templateId = msg.templateId;
      if (msg.optik !== undefined) settings.optik = mergeOptik(state.settings.optik, msg.optik);
      return { ...state, settings };
    }
    case 'snapshot':
      // The board snapshot also carries the authoritative phase + session code.
      return {
        ...state,
        phase: msg.phase ?? state.phase,
        sessionCode: msg.sessionCode ?? state.sessionCode,
      };
    default:
      return state;
  }
}

function mergeOptik(prev: OptikSettings | undefined, next: OptikSettings): OptikSettings {
  return { ...(prev ?? {}), ...next };
}
