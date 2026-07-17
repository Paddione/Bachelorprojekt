// brett/src/server/ws-connection.ts
// WebSocket-Lebenszyklus: Verbindungsauf- und -abbau, Heartbeat.
// Reine Orchestrierung — Logik lebt in ws-handler (Message-Dispatcher).

import { WebSocketServer } from 'ws';
import type { WsDeps } from './ws-handler';
import {
  gateSessionReady,
  gateMutation,
  handleLobbySetReady,
  onLeaderDisconnect,
  resolvePlayerId,
  getSessionCode,
  RELAY_TYPES,
  ADMIN_TYPES,
} from './ws-handler';
import { handleAdminMessage } from './ws-admin-commands';
import { handleFigurePossess, handleFigureRelease, handleFigureNoteSet } from './ws-figure-commands';
import { filterSnapshotFigures, broadcastFigureAware } from './hidden-filter';
import * as undoStack from './undo-stack';

export function handleDisconnect(ws: any, deps: WsDeps): void {
  const room = deps.leaveRoom(ws);
  if (room) {
    if (ws._isZuschauer && ws._playerId) {
      deps.broadcast(room, { type: 'presence_leave', userId: ws._playerId });
    }
    deps.broadcastInfo(room);
  }
}

export function attachWsServer(wss: WebSocketServer, deps: WsDeps): void {
  wss.on('connection', async (ws: any, req: any) => {
    // T000608: View-only-Share-Link — ein gültiger share_token macht die
    // Verbindung zum read-only-Gast (ws._isGuest), ungültige Tokens werden
    // mit 4403 geschlossen.
    try {
      const wsUrl = new URL(req?.url ?? '/', `http://${req?.headers?.host ?? 'x'}`);
      const shareToken = wsUrl.searchParams.get('share_token');
      if (shareToken && deps.resolveShareToken) {
        const roomToken = await deps.resolveShareToken(shareToken);
        if (!roomToken) { ws.close(4403, 'invalid_share_token'); return; }
        ws._shareRoom = roomToken;
        ws._isGuest = true;
      }
      const zuschauerToken = wsUrl.searchParams.get('zuschauer_token');
      if (zuschauerToken && deps.resolveZuschauerToken) {
        const roomToken = await deps.resolveZuschauerToken(zuschauerToken);
        if (!roomToken) { ws.close(4403, 'invalid_zuschauer_token'); return; }
        ws._shareRoom = roomToken;
        ws._isZuschauer = true;
      }
    } catch (err) {
      console.error('[brett] share-token resolve error:', err);
    }
    if (deps.sessionMiddleware && req) {
      deps.sessionMiddleware(req, {}, () => {
        ws._session = req.session;
        ws._sessionReady = true;
      });
    } else {
      // No middleware (tests / unauthenticated transport) → session resolution
      // is trivially complete.
      ws._sessionReady = true;
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
        if (msg.type === 'pong') {
          ws.isAlive = true;
          return;
        }
        // Block any non-pong message until the session is wired, so isAdmin/role
        // resolution never runs against an undefined session.
        if (!gateSessionReady(ws, (m: any) => ws.send(JSON.stringify(m)))) {
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
          // Presence is emitted whenever a session exists (sessionCode is already
          // set in `lobby`), keyed on the CANONICAL identity (session-first), so
          // roster liveness works in the lobby — not only once the round is active.
          const activeState = deps.buildStateFromMutations(room);
          let participant: any = null;
          if (activeState && activeState.sessionCode) {
            // Session-first identity; client msg.playerId is honored only without a session.
            const playerId = ws._session?.userId ?? msg.playerId ?? 'anon';
            const playerName = msg.name || ws._session?.name || 'Teilnehmer';
            ws._playerId = playerId;
            participant = deps.addParticipant(room, { userId: playerId, name: playerName });
            if (participant) {
              deps.broadcast(room, { type: 'presence_join', participant });
            }
            // Late-join reconnect guard (SEC-1/REG-3): record this player as having
            // been present in the room. On a SUBSEQUENT connect with the same
            // ?playerId= during an active/paused round, verifyClient →
            // shouldRejectReconnect now sees `wasPreviouslyInRoom` and rejects the
            // true reconnect (409). The canonical, session-first id MUST match the
            // ?playerId the client threads into the /sync handshake (ws-client.ts).
            if (playerId && playerId !== 'anon') {
              deps.trackPlayerInRoom(room, playerId);
            }
          }

          if (ws._isZuschauer) {
            const pid = ws._session?.userId ?? `zuschauer-${Math.random().toString(36).slice(2)}`;
            ws._playerId = pid;
            deps.broadcast(room, {
              type: 'presence_join',
              participant: { userId: pid, name: ws._session?.name ?? 'Zuschauer', role: 'zuschauer' },
            });
          }

          if (ws._session?.isAdmin) {
            const pid = resolvePlayerId(ws);
            const existing = [...(deps.roomAdminPresence.get(room) ?? [])];
            if (!existing.includes(pid)) existing.push(pid);
            deps.setRoomAdminPresence(room, existing);
            if (deps.getAdminTokenHolder(room) === pid) {
              deps.reclaimAdminToken(room, pid);
            }
          }

          const freshState = deps.buildStateFromMutations(room);
          if (freshState) {
            // REG-6: merge persisted __roles__ into participants for late-joiner roster.
            const persistedRoles = freshState.roles || {};
            freshState.participants = deps.listParticipants(room).map((p: any) => ({
              ...p,
              role: persistedRoles[p.userId],
            }));
            const locks = deps.listFigureLocks(room);
            // E9: hidden-Figuren nur für den Leiter im Snapshot — jede andere
            // Rolle (inkl. Guest/Zuschauer) erhält sie nie.
            const recipientRole: any = (ws._isGuest || ws._isZuschauer)
              ? 'zuschauer'
              : (ws._session?.isAdmin ? 'leiter' : deps.resolveRole(ws, persistedRoles));
            const snaps = filterSnapshotFigures(Object.values(freshState.figures) as any, recipientRole);
            try {
              ws.send(JSON.stringify({
                type: 'snapshot',
                figures: snaps,
                stiffness: freshState.stiffness,
                locks: locks,
                phase: freshState.sessionPhase,
                sessionCode: freshState.sessionCode,
                // FE-2/FE-3/REG-6: the join snapshot is the FIRST (often only) state
                // a client receives — carry the roster (with roles) so the lobby
                // store seeds it immediately instead of waiting for peers to
                // re-emit presence_join.
                participants: freshState.participants,
                // Late-joiners/reloads receive the persisted board-optik (§4.1
                // end-to-end) so the scene renders it on mount (D11).
                optik: freshState.optik,
                // T000471: include moderation state so late-joiners/reloads
                // get the current spotlight/dim/freeze without a separate broadcast.
                moderation: freshState.moderation ?? null,
                anchors: freshState.anchors ?? [],   // NEU T000468
                zones: freshState.zones ?? [],       // NEU T000468
                lines: freshState.lines ?? [],       // NEU T000467
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
          // Rights gate BEFORE acquiring the lock. Denial → forbidden to sender,
          // no broadcast (NOT figure_lock_denied — that is reserved for lock
          // contention, i.e. a lock already held by someone else).
          if (!gateMutation(ws, room, 'figure_lock', msg.id, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          const owner = {
            userId: resolvePlayerId(ws),
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
          const uid = resolvePlayerId(ws);
          if (deps.releaseFigureLock(room, msg.id, uid)) {
            deps.broadcast(room, { type: 'figure_unlocked', id: msg.id });
          }
          return;
        }

        if (msg.type === 'figure_possess' && typeof msg.figureId === 'string') {
          handleFigurePossess(ws, msg, room, deps);
          return;
        }
        if (msg.type === 'figure_release') {
          handleFigureRelease(ws, msg, room, deps);
          return;
        }

        if (msg.type === 'figure_note_set') {
          handleFigureNoteSet(ws, msg, room, deps);
          return;
        }

        // Non-privileged, ephemeral live-lobby readiness self-report.
        if (msg.type === 'lobby_set_ready') {
          handleLobbySetReady(ws, msg, deps);
          return;
        }

        if (RELAY_TYPES.has(msg.type)) {
          // ── The chokepoint: gate EVERY relay type (fail-closed Default-Deny)
          // BEFORE any apply/broadcast. Denial → forbidden to sender, no state
          // change, no broadcast.
          if (!gateMutation(ws, room, msg.type, msg.id, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          // request_state_snapshot is a read: never applied, never broadcast.
          if (msg.type === 'request_state_snapshot') {
            return;
          }

          deps.applyMutation(room, msg);
          // E9: figurenbezogene Relays role-aware broadcasten, damit Mutationen an
          // hidden-Figuren Nicht-Leiter nie erreichen. Nicht-Figuren-Relays
          // (clear/stiffness/snapshot) reicht translateBroadcastForRole unverändert durch.
          broadcastFigureAware(deps, room, msg, ws);

          if (deps.logEvent) {
            const { type: _type, ...safePayload } = msg;
            deps.logEvent(room, getSessionCode(room, deps), msg.type, safePayload);
          }

          if (deps.captureBeforeSnapshot && deps.captureAfterSnapshot && deps.pushUndo && deps.getUndoStatus) {
            undoStack.tryRecordMutation(room, msg, deps.captureBeforeSnapshot, deps.captureAfterSnapshot,
              deps.pushUndo, deps.getUndoStatus, (r, m) => deps.broadcast(r, m));
          }

          // A permitted stellvertreter `add` stamps ownership server-side so the
          // new figure is mutable by its creator (owner-scoped enforcement).
          if (msg.type === 'add') {
            const newId = (msg.figure ?? msg.fig)?.id;
            const playerId = resolvePlayerId(ws);
            const role = deps.resolveRole(ws, deps.buildStateFromMutations(room)?.roles || {});
            if (role === 'stellvertreter' && typeof newId === 'string') {
              deps.applyMutation(room, { type: 'figure_owner_set', figureId: newId, ownerId: playerId });
              deps.broadcast(room, { type: 'figure_owner_changed', figureId: newId, ownerId: playerId });
            }
          }
          if (msg.type === 'clear') {
            deps.flushImmediate(room).catch((err: any) => console.error('[brett] flush:', err));
          }
          if (msg.type !== 'clear') {
            deps.schedulePersist(room);
          }
        }

        if (ADMIN_TYPES.has(msg.type)) {
          const adminRoom = ws._room;
          if (!adminRoom) return;
          const isKcAdmin = !!ws._session?.isAdmin;
          if (msg.type === 'admin_session_create') {
            // Any authenticated user may start a session and become its host.
            if (!ws._session?.userId) return;
          } else if (msg.type === 'admin_broadcast') {
            // Internal website notification — Keycloak-admin only.
            if (!isKcAdmin) return;
          } else {
            // All other host actions: Keycloak-admin OR current room leiter.
            const roomRoles = deps.buildStateFromMutations(adminRoom)?.roles ?? {};
            const isLeiter = deps.resolveRole(ws, roomRoles) === 'leiter';
            if (!isKcAdmin && !isLeiter) return;
          }
          await handleAdminMessage(ws, msg, adminRoom, deps);
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
      const pid = resolvePlayerId(ws);
      if (pid !== 'anon') {
        deps.releaseLocksForUser(room, pid);
        deps.broadcast(room, { type: 'locks_released_for', userId: pid });
        // Owner-orphan (C6): figures owned by the leaver are released (ownerId →
        // null) so a permitted role can take over; broadcast per changed figure.
        const orphaned = deps.orphanFiguresForUser(room, pid);
        for (const fid of orphaned) {
          deps.broadcast(room, { type: 'figure_owner_changed', figureId: fid, ownerId: null });
        }
        if (orphaned.length) deps.schedulePersist(room);
        // Auto-release possessions on disconnect: every figure this player
        // was embodying is freed so another participant can take over.
        const figMap = deps.figureMaps.get(room);
        if (figMap) {
          const releasedIds: string[] = [];
          for (const [fid, f] of figMap.entries()) {
            if (f.possessor === pid) {
              deps.applyMutation(room, { type: 'figure_release', figureId: fid, playerId: pid });
              releasedIds.push(fid);
            }
          }
          for (const fid of releasedIds) {
            deps.broadcast(room, { type: 'figure_released', figureId: fid, playerId: pid });
          }
          if (releasedIds.length) deps.schedulePersist(room);
        }
        // Remove from roster for ANY canonical identity (incl. late-joiners
        // tracked only via ws._playerId), not just OIDC-session users.
        deps.removeParticipant(room, pid);
        deps.broadcast(room, { type: 'presence_leave', userId: pid });
        // If the departing player holds the admin token in a non-terminal phase,
        // start the grace timer for reassignment (B14).
        const phase = deps.buildStateFromMutations(room)?.sessionPhase;
        onLeaderDisconnect(room, pid, phase, deps);
      }
      if (deps.rooms.has(room)) {
        deps.broadcastInfo(room);
      } else {
        try {
          await deps.flushImmediate(room);
        } finally {
          if (!deps.rooms.has(room)) {
            deps.figureMaps.delete(room);
            deps.clearUndoStacks?.(room);  // T000470: Stacks beim Last-Leave bereinigen
            deps.cleanupRoomTracking?.(room);  // T000660: Server-Map-Leaks bereinigen
          }
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
