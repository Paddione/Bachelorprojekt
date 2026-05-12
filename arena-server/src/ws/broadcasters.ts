import type { Server } from 'socket.io';
import { getLobby } from '../lobby/registry';
import type { ServerMsg, DiffOp, GameEvent, MatchResult, MatchState } from '../proto/messages';

export function makeBroadcasters(io: Server) {
  function to(code: string) { return io.to(`lobby:${code}`); }

  return {
    emitLobbyState(code: string) {
      const l = getLobby(code);
      if (!l) return;
      const msg: ServerMsg = {
        t: 'lobby:state', code,
        phase: l.phase,
        players: [...l.players.values()],
        expiresAt: l.expiresAt,
      };
      to(code).emit('msg', msg);
    },

    emitMatchSnapshot(code: string, matchId: string, state: MatchState) {
      const msg: ServerMsg = { t: 'match:full-snapshot', tick: state.tick, state };
      to(code).emit('msg', msg);
    },

    emitMatchDiff(code: string, matchId: string, tick: number, ops: DiffOp[]) {
      if (ops.length === 0) return;
      const msg: ServerMsg = { t: 'match:diff', tick, ops };
      to(code).emit('msg', msg);
    },

    emitMatchEvent(code: string, matchId: string, events: GameEvent[]) {
      const msg: ServerMsg = { t: 'match:event', events };
      to(code).emit('msg', msg);
    },

    emitMatchEnd(code: string, matchId: string, results: MatchResult[]) {
      const msg: ServerMsg = { t: 'match:end', results, matchId };
      to(code).emit('msg', msg);
    },
  };
}

export type Broadcasters = ReturnType<typeof makeBroadcasters>;