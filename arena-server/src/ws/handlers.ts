import type { Socket } from 'socket.io';
import type { ClientMsg, ServerMsg } from '../proto/messages';
import { isClientMsg } from '../proto/messages';
import type { Lifecycle } from '../lobby/lifecycle';
import type { ArenaClaims } from '../auth/jwt';
import { playerKey } from '../auth/jwt';

export function attachHandlers(socket: Socket, deps: { lc: Lifecycle; user: ArenaClaims }) {
  const key = playerKey(deps.user);

  socket.on('msg', (raw: unknown) => {
    if (!isClientMsg(raw)) { sendError(socket, 'bad-msg', 'unrecognised message'); return; }
    const m = raw as ClientMsg;
    try {
      switch (m.t) {
        case 'lobby:join':
          deps.lc.join(m.code, {
            key, displayName: deps.user.displayName, brand: deps.user.brand,
            characterId: 'blonde-guy', isBot: false, ready: false, alive: true,
          });
          socket.join(`lobby:${m.code}`);
          break;
        case 'lobby:leave':
          // best-effort: caller is responsible for emitting state via lifecycle
          break;
        case 'rematch:vote':
          // join+vote require the socket to know its lobby; v1: scan rooms
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.voteRematch(room.slice(6), key, m.yes);
          }
          break;
        case 'forfeit':
          // Plan 1: no game in flight. Acknowledge only.
          break;
        case 'input':
          // Plan 1: drop.
          break;
        case 'auth:refresh':
          // Plan 1: token re-validation happens on next reconnect.
          break;
      }
    } catch (e: any) {
      sendError(socket, 'cmd-failed', e.message);
    }
  });
}

function sendError(socket: Socket, code: string, message: string) {
  const m: ServerMsg = { t: 'error', code, message };
  socket.emit('msg', m);
}