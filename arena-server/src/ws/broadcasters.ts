import type { Server } from 'socket.io';
import { getLobby } from '../lobby/registry';
import type { ServerMsg } from '../proto/messages';

export function makeBroadcasters(io: Server) {
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
      io.to(`lobby:${code}`).emit('msg', msg);
    },
  };
}