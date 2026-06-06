import { WebSocketServer, WebSocket } from 'ws';

// The full set of server-side collaborators, injected once at startup.
export interface WsDeps {
  joinRoom: Function;
  leaveRoom: Function;
  broadcast: Function;
  broadcastInfo: Function;
  addParticipant: Function;
  removeParticipant: Function;
  listParticipants: Function;
  figureMaps: Map<string, Map<string, any>>;
  rooms: Map<string, Set<any>>;
  ensureFigureMap: Function;
  seedFigureMapFromState: Function;
  applyMutation: Function;
  buildStateFromMutations: Function;
  acquireFigureLock: Function;
  releaseFigureLock: Function;
  releaseLocksForUser: Function;
  listFigureLocks: Function;
  validateAppearance: Function;
  readState: Function;
  schedulePersist: Function;
  flushImmediate: Function;
  handleAdminSessionCreate: Function;
  handleAdminHandoffMessage: Function;
  handleAdminRoundStop: Function;
  handleAdminRoundPause: Function;
  trackPlayerInRoom: Function;
  transitionPhase: Function;
  isAdminFromClaims: Function;
  sessionMiddleware?: any;
}

// Coaching-only relay set
export const RELAY_TYPES = new Set<string>([
  'add', 'move', 'update', 'delete', 'clear', 'optik', 'stiffness', 'snapshot', 'request_state_snapshot'
]);

// Admin message types
export const ADMIN_TYPES = new Set<string>([
  'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token', 'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set'
]);

export function handleDisconnect(ws: any, deps: WsDeps): void {
  const room = deps.leaveRoom(ws);
  if (room) deps.broadcastInfo(room);
}

export function attachWsServer(wss: WebSocketServer, deps: WsDeps): void {
  wss.on('connection', (ws: any, req: any) => {
    if (deps.sessionMiddleware && req) {
      deps.sessionMiddleware(req, {}, () => {
        ws._session = req.session;
      });
    }
    ws.isAlive = true;

    ws.on('message', async (raw: any) => {
      try {
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (ws._room) {
          // In the original, touchSessionActivity is called if ws._room exists.
          // Since ws_room is only set after join, we check if it is set.
        }

        if (msg.type === 'pong') {
          ws.isAlive = true;
          return;
        }

        if (msg.type === 'join' && typeof msg.room === 'string') {
          const room = msg.room;
          deps.joinRoom(ws, room);

          const state = await deps.readState(room);
          const map = deps.ensureFigureMap(room);

          // Seed state into in-memory figureMaps via the pure, unit-tested seeder.
          // (§4.6: reads state.sessionPhase / sessionCreatedAt / sessionLastActivity —
          // the field names buildStateFromMutations emits — not the dead state.phase.)
          if (map.size === 0) deps.seedFigureMapFromState(map, state);

          // Handle player presence if session is active
          const activeState = deps.buildStateFromMutations(room);
          let participant: any = null;
          if (activeState && activeState.sessionCode) {
            const playerId = msg.playerId || ws._session?.userId || 'anon';
            const playerName = msg.name || ws._session?.name || 'Teilnehmer';
            participant = deps.addParticipant(room, { userId: playerId, name: playerName });
            if (participant) {
              // Ensure ws has reference to participant properties for admin token checks
              ws._playerId = participant.userId;
              deps.broadcast(room, { type: 'presence_join', participant });
            }
          }

          const freshState = deps.buildStateFromMutations(room);
          if (freshState) {
            freshState.participants = deps.listParticipants(room);
            const locks = deps.listFigureLocks(room);
            const snaps = Object.values(freshState.figures);
            try {
              ws.send(JSON.stringify({
                type: 'snapshot',
                figures: snaps,
                stiffness: freshState.stiffness,
                locks: locks,
                phase: freshState.sessionPhase,
                sessionCode: freshState.sessionCode
              }));
            } catch {}
          }

          deps.broadcastInfo(room);
          return;
        }

        const room = ws._room;
        if (!room) return;

        // Appearance validation for add / update
        if (msg.type === 'add' && (msg.figure ?? msg.fig)?.appearance) {
          const appErr = deps.validateAppearance((msg.figure ?? msg.fig).appearance);
          if (appErr) {
            try {
              ws.send(JSON.stringify({ type: 'error', reason: appErr }));
            } catch {}
            return;
          }
        }
        if (msg.type === 'update' && msg.changes?.appearance) {
          const appErr = deps.validateAppearance(msg.changes.appearance);
          if (appErr) {
            try {
              ws.send(JSON.stringify({ type: 'error', reason: appErr }));
            } catch {}
            return;
          }
        }

        if (msg.type === 'figure_lock' && typeof msg.id === 'string') {
          const owner = {
            userId: ws._session?.userId || ws._playerId || 'anon',
            name: ws._session?.name || 'Teilnehmer',
            color: msg.color || '#4ea1ff',
          };
          if (deps.acquireFigureLock(room, msg.id, owner)) {
            deps.broadcast(room, { type: 'figure_locked', id: msg.id, userId: owner.userId, name: owner.name, color: owner.color });
          } else {
            try {
              ws.send(JSON.stringify({ type: 'figure_lock_denied', id: msg.id }));
            } catch {}
          }
          return;
        }
        if (msg.type === 'figure_unlock' && typeof msg.id === 'string') {
          const uid = ws._session?.userId || ws._playerId || 'anon';
          if (deps.releaseFigureLock(room, msg.id, uid)) {
            deps.broadcast(room, { type: 'figure_unlocked', id: msg.id });
          }
          return;
        }

        if (RELAY_TYPES.has(msg.type)) {
          deps.applyMutation(room, msg);
          deps.broadcast(room, msg, ws);
          if (msg.type === 'player_join' && typeof msg.playerId === 'string') {
            ws._playerId = msg.playerId;
            deps.trackPlayerInRoom(room, msg.playerId);
          } else if (msg.type === 'clear') {
            deps.flushImmediate(room).catch((err: any) => console.error('[brett] flush:', err));
          }
          if (msg.type !== 'clear') {
            deps.schedulePersist(room);
          }
        }

        if (ADMIN_TYPES.has(msg.type)) {
          if (!ws._session?.isAdmin) return;
          const adminRoom = ws._room;
          if (!adminRoom) return;

          switch (msg.type) {
            case 'admin_kick': {
              if (typeof msg.playerId !== 'string') return;
              for (const sock of deps.rooms.get(adminRoom) || []) {
                if (sock._playerId === msg.playerId) {
                  try {
                    sock.close();
                  } catch {}
                  break;
                }
              }
              break;
            }
            case 'admin_broadcast': {
              const websiteUrl = process.env.WEBSITE_INTERNAL_URL || 'http://website.website.svc.cluster.local:4321';
              fetch(`${websiteUrl}/api/admin/brett/broadcast`, {
                method: 'POST',
                headers: { 'x-internal-admin': process.env.BRETT_INTERNAL_ADMIN_SECRET || '' },
              }).catch((err: any) => console.error('[brett] admin_broadcast failed:', err.message));
              break;
            }
            case 'admin_session_create': {
              const playerId = ws._playerId || ws._session?.name;
              if (!playerId) return;
              const result = deps.handleAdminSessionCreate(adminRoom, playerId);
              deps.broadcast(adminRoom, {
                type: 'session_phase_change',
                phase: 'lobby',
                transitionedAt: new Date().toISOString(),
                reason: 'admin-create',
              });
              deps.broadcast(adminRoom, {
                type: 'admin_token_changed',
                holderPlayerId: playerId,
                reason: 'handoff',
              });
              deps.schedulePersist(adminRoom);
              // Echo session code to creator
              try {
                ws.send(JSON.stringify({ type: 'session_created', code: result.code }));
              } catch {}
              break;
            }
            case 'admin_handoff_token': {
              if (typeof msg.targetPlayerId !== 'string') return;
              const fromPlayerId = ws._playerId || ws._session?.name;
              if (!fromPlayerId) return;
              deps.handleAdminHandoffMessage(adminRoom, fromPlayerId, msg.targetPlayerId, (out: any) => deps.broadcast(adminRoom, out));
              deps.schedulePersist(adminRoom);
              break;
            }
            case 'admin_round_stop': {
              deps.handleAdminRoundStop(adminRoom, (m: any) => deps.broadcast(adminRoom, m));
              deps.schedulePersist(adminRoom);
              break;
            }
            case 'admin_round_pause': {
              deps.handleAdminRoundPause(adminRoom, (m: any) => deps.broadcast(adminRoom, m));
              deps.schedulePersist(adminRoom);
              break;
            }
            case 'admin_coaching_steps_set': {
              deps.applyMutation(adminRoom, { type: 'coaching_steps_set', steps: msg.steps, index: msg.index });
              deps.broadcast(adminRoom, { type: 'coaching_steps_change', steps: msg.steps, index: msg.index });
              deps.schedulePersist(adminRoom);
              break;
            }
          }
          return;
        }
      } catch (err: any) {
        console.error('[brett] ws message handler error:', err.message);
      }
    });

    ws.on('close', async () => {
      handleDisconnect(ws, deps);
      const room = ws._room;
      if (!room) return;
      const uid = ws._session?.userId || ws._playerId;
      if (uid) {
        deps.releaseLocksForUser(room, uid);
        deps.broadcast(room, { type: 'locks_released_for', userId: uid });
      }
      if (uid && ws._session?.userId) {
        deps.removeParticipant(room, ws._session.userId);
        deps.broadcast(room, { type: 'presence_leave', userId: ws._session.userId });
      }
      if (deps.rooms.has(room)) {
        deps.broadcastInfo(room);
      } else {
        try {
          await deps.flushImmediate(room);
        } finally {
          if (!deps.rooms.has(room)) deps.figureMaps.delete(room);
        }
      }
    });

    ws.on('error', (err: any) => console.error('[brett] ws error:', err.message));
  });
}

export function startHeartbeat(wss: WebSocketServer): NodeJS.Timeout {
  const HEARTBEAT_INTERVAL_MS = 30_000;
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        try {
          ws.terminate();
        } catch {}
        return;
      }
      ws.isAlive = false;
      try {
        ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      } catch {}
    });
  }, HEARTBEAT_INTERVAL_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
  return heartbeatTimer;
}

export function startIdleSweep(deps: { checkAllSessions: Function; broadcast: Function; schedulePersist: Function }): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (process.env.MOCK_DB === 'true') return;
    const results = deps.checkAllSessions();
    for (const r of results) {
      if (r.ended) {
        deps.broadcast(r.room, {
          type: 'session_phase_change',
          phase: 'ended',
          transitionedAt: new Date().toISOString(),
          reason: 'idle-timeout',
        });
        deps.broadcast(r.room, { type: 'session_ended', reason: 'idle-timeout' });
        deps.schedulePersist(r.room);
      }
    }
  }, 60_000);
  if (timer.unref) timer.unref();
  return timer;
}
