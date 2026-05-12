import type { Socket } from 'socket.io';
import type { ClientMsg, ServerMsg } from '../proto/messages';
import { isClientMsg } from '../proto/messages';
import type { Lifecycle } from '../lobby/lifecycle';
import type { ArenaClaims } from '../auth/jwt';
import { playerKey } from '../auth/jwt';
import { getLobby } from '../lobby/registry';

export function attachHandlers(socket: Socket, deps: { lc: Lifecycle; user: ArenaClaims }) {
  const key = playerKey(deps.user);

  socket.on('msg', (raw: unknown) => {
    if (!isClientMsg(raw)) { sendError(socket, 'bad-msg', 'unrecognised message'); return; }
    const m = raw as ClientMsg;
    try {
      switch (m.t) {
        case 'lobby:join': {
          const targetLobby = getLobby(m.code);
          if (targetLobby && (targetLobby.phase === 'in-match' || targetLobby.phase === 'slow-mo')) {
            socket.join(`lobby:${m.code}`);
            const stateMsg: ServerMsg = {
              t: 'lobby:state', code: m.code, phase: targetLobby.phase,
              players: [...targetLobby.players.values()], expiresAt: targetLobby.expiresAt,
            };
            socket.emit('msg', stateMsg);
          } else {
            deps.lc.join(m.code, {
              key, displayName: deps.user.displayName, brand: deps.user.brand,
              characterId: 'blonde-guy', isBot: false, ready: false, alive: true,
            });
            socket.join(`lobby:${m.code}`);
          }
          break;
        }
        case 'lobby:leave':
          // best-effort: caller is responsible for emitting state via lifecycle
          break;
        case 'lobby:character':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.setCharacter(room.slice(6), key, m.characterId);
          }
          break;
        case 'rematch:vote':
          // join+vote require the socket to know its lobby; v1: scan rooms
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.voteRematch(room.slice(6), key, m.yes);
          }
          break;
        case 'forfeit':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) {
              deps.lc.forfeit(room.slice(6), key);
            }
          }
          break;
        case 'input':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) {
              getLobby(room.slice(6))?.tick?.pushInput(key, m);
            }
          }
          break;
        case 'spectator:join': {
          const specLobby = getLobby(m.code);
          if (!specLobby) { sendError(socket, 'not-found', 'lobby not found'); break; }
          if (specLobby.phase !== 'in-match' && specLobby.phase !== 'slow-mo') {
            sendError(socket, 'not-in-match', 'match not in progress'); break;
          }
          if (!specLobby.spectators) specLobby.spectators = new Set();
          specLobby.spectators.add(key);
          const currentState = specLobby.tick?.getState();
          if (currentState) {
            const snap: ServerMsg = { t: 'match:full-snapshot', tick: currentState.tick, state: currentState };
            socket.emit('msg', snap);
          }
          break;
        }
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