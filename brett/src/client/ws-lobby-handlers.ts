import type { ServerMessage } from '../types/messages';
import type { Phase, Participant } from '../types/state';
import type { LobbyState } from './lobby-store';
import { applyLobbyServerMessage } from './lobby-store';
import { applyOptikToScene } from './ui/optik';
import { updateExportCache } from './ui/export';

export interface LobbyHandlerDeps {
  getLobbyState: () => LobbyState;
  setLobbyState: (s: LobbyState) => void;
  onLobbyChange: (s: LobbyState) => void;
  onPhaseChange: (phase: Phase | null) => void;
  decideLateJoin: (phase: Phase | null, p: Participant | undefined) => { notify: boolean; name: string };
  lateJoinHandler: ((name: string) => void) | null;
}

export function handleLobbyMessage(msg: ServerMessage, deps: LobbyHandlerDeps): boolean {
  const { getLobbyState, setLobbyState, onLobbyChange, onPhaseChange, decideLateJoin, lateJoinHandler } = deps;

  switch (msg.type) {
    case 'lobby_settings_change': {
      const prevPhase = getLobbyState().phase;
      const next = applyLobbyServerMessage(getLobbyState(), msg);
      setLobbyState(next);
      onLobbyChange(next);
      if (next.phase !== prevPhase) onPhaseChange(next.phase);
      if (msg.optik) applyOptikToScene(msg.optik);
      return true;
    }
    case 'presence_join': {
      const prevPhase = getLobbyState().phase;
      const next = applyLobbyServerMessage(getLobbyState(), msg);
      setLobbyState(next);
      onLobbyChange(next);
      if (next.phase !== prevPhase) onPhaseChange(next.phase);
      const decision = decideLateJoin(next.phase, msg.participant);
      if (decision.notify) lateJoinHandler?.(decision.name);
      return true;
    }
    case 'presence_leave':
    case 'role_changed':
    case 'lobby_ready_changed':
    case 'session_created': {
      const prevPhase = getLobbyState().phase;
      const next = applyLobbyServerMessage(getLobbyState(), msg);
      setLobbyState(next);
      onLobbyChange(next);
      if (next.phase !== prevPhase) onPhaseChange(next.phase);
      return true;
    }
    case 'session_phase_change':
    case 'session_ended': {
      const next = applyLobbyServerMessage(getLobbyState(), msg);
      setLobbyState(next);
      onLobbyChange(next);
      onPhaseChange(next.phase);
      if (msg.type === 'session_phase_change') {
        updateExportCache({ phase: (msg as any).phase });
      }
      return true;
    }
    case 'admin_token_changed':
    case 'coaching_steps_change': {
      const next = applyLobbyServerMessage(getLobbyState(), msg);
      setLobbyState(next);
      onLobbyChange(next);
      return true;
    }
    default:
      return false;
  }
}
