import { WebSocketServer } from 'ws';
export { handleAssignRole } from './ws-admin-commands';
import { handleAdminMessage } from './ws-admin-commands';
import type { MutationType, MutateContext } from './permissions';
import * as undoStack from './undo-stack';

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
  orphanFiguresForUser: Function;
  listFigureLocks: Function;
  canMutate: (ctx: MutateContext) => boolean;
  resolveRole: Function;
  validateAppearance: Function;
  readState: Function;
  schedulePersist: Function;
  flushImmediate: Function;
  /** Log a mutation event for replay recording (optional for backwards-compat). */
  logEvent?: (room: string, sessionCode: string | null, eventType: string, payload: any) => void;
  /** Flush the event buffer for a room immediately (called on session-end). */
  flushEventLog?: (room: string) => Promise<void>;
  handleAdminSessionCreate: Function;
  handleAdminHandoffMessage: Function;
  handleAdminRoundStop: Function;
  handleAdminRoundPause: Function;
  handleAdminRoundStart: Function;
  handleAdminSetOptik: Function;
  handleAdminSetTemplate: Function;
  loadSnapshotState?: Function;
  applyTemplateToRoom?: Function;
  trackPlayerInRoom: Function;
  transitionPhase: Function;
  isAdminFromClaims: Function;
  getAdminTokenHolder: Function;
  beginTokenGrace: Function;
  setRoomAdminPresence: Function;
  reclaimAdminToken: Function;
  roomAdminPresence: Map<string, Set<string>>;
  sessionMiddleware?: any;
  captureBeforeSnapshot?: (room: string, msg: any) => Map<string, any | null>;
  captureAfterSnapshot?: (before: Map<string, any | null>, room: string, msg: any) => Map<string, any | null>;
  pushUndo?: (room: string, entry: import('./undo-stack').UndoEntry) => void;
  performUndo?: (room: string) => { applied: true; entry: import('./undo-stack').UndoEntry } | { applied: false };
  performRedo?: (room: string) => { applied: true; entry: import('./undo-stack').UndoEntry } | { applied: false };
  getUndoStatus?: (room: string) => { canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number };
  clearUndoStacks?: (room: string) => void;
}

// Coaching-only relay set. `jump` (§4.5) is relayed + canMutate-gated like move,
// but has NO applyMutation case (ephemeral animation, never persisted).
export const RELAY_TYPES = new Set<string>([
  'add', 'move', 'update', 'jump', 'delete', 'clear', 'stiffness', 'snapshot', 'request_state_snapshot'
]);

// Admin message types
export const ADMIN_TYPES = new Set<string>([
  'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token', 'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set',
  'admin_round_start', 'admin_assign_role', 'admin_assign_figure',
  'admin_set_template', 'admin_set_optik',
  'figure_type_set',
  'admin_spotlight_set', 'admin_dim_set', 'admin_freeze_set',  // ← T000471
  'anchor_create', 'anchor_delete', 'zone_create', 'zone_delete',  // NEU T000468
  'session_undo', 'session_redo',   // ← T000470
  // ── Line mutations (T000467) — leiter-exklusiv ────────────────────────────
  'line_create', 'line_delete', 'line_type_set',
]);

/**
 * Canonical identity. OIDC session id wins over any client-supplied `_playerId`;
 * anon fallback only without a session. Used everywhere a stable per-user key is
 * needed: participant-map key, ws._playerId, lock owner, removeParticipant,
 * presence keying. Role-bearing identity is STRICTER (session-keyed only) — see
 * resolveRole (Phase C); this helper alone must never confer a role above
 * beobachter to an anon/_playerId-only client.
 */
export function resolvePlayerId(ws: any): string {
  return ws?._session?.userId ?? ws?._playerId ?? 'anon';
}

/** Returns the active session code for a room, or null for free-board rooms. */
export function getSessionCode(room: string, deps: Pick<WsDeps, 'buildStateFromMutations'>): string | null {
  return deps.buildStateFromMutations(room)?.sessionCode ?? null;
}

/**
 * The SINGLE rights chokepoint (§5d). Computes the canonical MutateContext from
 * authenticated identity + persisted roles + figure ownership + lobby settings,
 * then delegates the decision to the pure `canMutate`. Returns true iff the
 * mutation is permitted; the caller is responsible for the forbidden response
 * and for NOT applying/broadcasting on a false result.
 *
 * - role: resolved STRICTLY from ws._session.userId via __roles__ (resolveRole);
 *   anon/session-less → beobachter (never above).
 * - playerId: canonical identity (resolvePlayerId).
 * - figureOwnerId: the target figure's server-authoritative ownerId (or null).
 * - allowRepresentativeAdd: from lobbySettings (Phase D); absent ⇒ false.
 */
export function gateMutation(
  ws: any,
  room: string,
  msgType: MutationType,
  figureId: string | undefined,
  deps: Pick<WsDeps, 'buildStateFromMutations' | 'figureMaps' | 'canMutate' | 'resolveRole'>,
): boolean {
  const state = deps.buildStateFromMutations(room) || {};
  const roles = state.roles || {};
  // Legacy free-board bypass (REG-1): a room that has NEITHER a session code NOR
  // any assigned roles is the standalone `?room=` deep-link / legacy coaching
  // board. origin/main relayed every mutation there unconditionally, so the
  // role-gate must NOT apply — otherwise such boards turn globally read-only
  // (resolveRole → beobachter for everyone → every write denied). Enforcement
  // kicks in the moment a session exists: `admin_session_create` sets the code
  // AND seeds the creator as `leiter` in __roles__, so a sessioned room always
  // trips one of these guards and stays fully gated.
  if (!state.sessionCode && (!roles || Object.keys(roles).length === 0)) {
    return true;
  }
  // Freeze-Gate: block move/update/jump for non-leaders when room is frozen.
  // Leiter bypass: the leiter may still demonstrate figure movement when frozen.
  const FREEZE_BLOCKED: MutationType[] = ['move', 'update', 'jump'];
  if (state.moderation?.freeze && FREEZE_BLOCKED.includes(msgType)) {
    const freezeRole = deps.resolveRole(ws, roles);
    if (freezeRole !== 'leiter') return false;
  }
  const role = deps.resolveRole(ws, roles);
  const playerId = resolvePlayerId(ws);
  const figureOwnerId = (figureId != null ? deps.figureMaps.get(room)?.get(figureId)?.ownerId : null) ?? null;
  const allowRepresentativeAdd = !!state.lobbySettings?.allowRepresentativeAdd;
  return deps.canMutate({ msgType, role, playerId, figureOwnerId, allowRepresentativeAdd });
}

/**
 * Non-privileged participant self-report of lobby readiness. Ephemeral: NO
 * applyMutation, NO persist, NOT in ADMIN_TYPES or RELAY_TYPES. Keyed on the
 * canonical identity (never client-supplied msg.playerId).
 */
export function handleLobbySetReady(
  ws: any,
  msg: any,
  deps: Pick<WsDeps, 'broadcast'>
): void {
  const room = ws._room;
  if (!room) return;
  deps.broadcast(room, { type: 'lobby_ready_changed', userId: resolvePlayerId(ws), ready: !!msg.ready });
}

/**
 * Gate that guarantees the session has been wired (`ws._session` resolved) before
 * any isAdmin/role resolution runs. Returns false + sends `error:not-ready` while
 * the session is still pending. Pure: only reads `ws._sessionReady` and calls `send`.
 */
export function gateSessionReady(ws: any, send: (m: any) => void): boolean {
  if (!ws._sessionReady) {
    send({ type: 'error', reason: 'not-ready' });
    return false;
  }
  return true;
}

/**
 * When the current admin-token holder leaves while the session is non-terminal,
 * start the grace timer so the token can be reassigned to another present admin
 * (or released) on expiry — instead of being stranded. No-op for non-holders and
 * for terminal (`ended`) phases.
 */
export function onLeaderDisconnect(
  room: string,
  leavingPlayerId: string,
  phase: string | null | undefined,
  deps: Pick<WsDeps, 'getAdminTokenHolder' | 'beginTokenGrace'>
): void {
  if (phase === 'ended') return;
  if (leavingPlayerId && leavingPlayerId === deps.getAdminTokenHolder(room)) {
    deps.beginTokenGrace(room, leavingPlayerId);
  }
}

export function handleDisconnect(ws: any, deps: WsDeps): void {
  const room = deps.leaveRoom(ws);
  if (room) deps.broadcastInfo(room);
}

export function attachWsServer(wss: WebSocketServer, deps: WsDeps): void {
  wss.on('connection', (ws: any, req: any) => {
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

          // Maintain admin presence for grace reassignment (B14). Accumulate any
          // OIDC-admin into roomAdminPresence; if the (re)joining admin is the
          // current token holder, cancel a pending grace timer.
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
            // REG-6: merge the persisted __roles__ into each participant so the
            // late-joiner's roster (seeded from this snapshot) shows assigned roles
            // — not just {userId,name,color}. `ready` is ephemeral (never persisted)
            // and defaults to false until the peer re-emits lobby_ready_changed.
            const persistedRoles = freshState.roles || {};
            freshState.participants = deps.listParticipants(room).map((p: any) => ({
              ...p,
              role: persistedRoles[p.userId],
            }));
            const locks = deps.listFigureLocks(room);
            const snaps = Object.values(freshState.figures);
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
          if (!gateMutation(ws, room, 'figure_possess', msg.figureId, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          // Gate: figure must not already have a possessor
          const figMap = deps.figureMaps.get(room);
          const existingFig = figMap?.get(msg.figureId);
          if (existingFig?.possessor) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'figure_already_possessed' })); } catch {}
            return;
          }
          const playerId = resolvePlayerId(ws);
          deps.applyMutation(room, { type: 'figure_possess', figureId: msg.figureId, playerId });
          deps.broadcast(room, {
            type: 'figure_possessed',
            figureId: msg.figureId,
            playerId,
            playerName: ws._session?.name || 'Teilnehmer',
          });
          deps.schedulePersist(room);
          return;
        }
        if (msg.type === 'figure_release') {
          const targetId = msg.figureId;
          if (!gateMutation(ws, room, 'figure_release', targetId, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          const playerId = resolvePlayerId(ws);
          if (typeof targetId === 'string') {
            // Release specific figure — must be own possession (or leiter override)
            const figMap = deps.figureMaps.get(room);
            const fig = figMap?.get(targetId);
            const role = deps.resolveRole(ws, deps.buildStateFromMutations(room)?.roles || {});
            if (fig?.possessor !== playerId && role !== 'leiter') {
              try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
              return;
            }
            deps.applyMutation(room, { type: 'figure_release', figureId: targetId, playerId });
            deps.broadcast(room, { type: 'figure_released', figureId: targetId, playerId });
          } else {
            // Release ALL possessions for this player
            const figMap = deps.figureMaps.get(room);
            if (figMap) {
              for (const [fid, f] of figMap.entries()) {
                if (f.possessor === playerId) {
                  deps.applyMutation(room, { type: 'figure_release', figureId: fid, playerId });
                  deps.broadcast(room, { type: 'figure_released', figureId: fid, playerId });
                }
              }
            }
          }
          deps.schedulePersist(room);
          return;
        }

        if (msg.type === 'figure_note_set') {
          if (typeof msg.figureId !== 'string' || typeof msg.note !== 'string') return;
          if (!gateMutation(ws, room, 'figure_note_set', msg.figureId, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          deps.applyMutation(room, {
            type: 'figure_note_set',
            figureId: msg.figureId,
            note: msg.note,
          });
          deps.broadcast(room, {
            type: 'figure_note_changed',
            figureId: msg.figureId,
            note: msg.note.slice(0, 1000),
          });
          deps.schedulePersist(room);
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
          deps.broadcast(room, msg, ws);

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
          // Late-join tracking is done in the `join` handler (SEC-1/REG-3), not via
          // a relay `player_join` (which was never in RELAY_TYPES nor sent by any
          // client — dead code, removed).
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
