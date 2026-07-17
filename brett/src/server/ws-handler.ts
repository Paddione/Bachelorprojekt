export { handleAssignRole } from './ws-admin-commands';
import type { MutationType, MutateContext } from './permissions';
import type { UndoEntry } from './undo-stack';
import type { Role, Phase, FigureAppearance, OptikSettings, Participant, FigureLock, RoomState } from '../types/state';
import type { ServerMessage } from '../types/messages';

// The full set of server-side collaborators, injected once at startup.
export interface WsDeps {
  // ── Room management ────────────────────────────────────────────────
  joinRoom: (ws: any, room: string) => void;
  leaveRoom: (ws: any) => string | undefined;
  broadcast: (room: string, msg: any, exclude?: any) => void;
  broadcastRoleAware: (room: string, msg: any, resolveRoleForWs: (ws: any) => Role, translate: (msg: any, role: Role) => any | null, exclude?: any) => void;
  broadcastInfo: (room: string) => void;

  // ── Participant roster ─────────────────────────────────────────────
  addParticipant: (room: string, p: { userId: string; name: string }) => Participant | null;
  removeParticipant: (room: string, userId: string) => void;
  clearParticipants: (room: string) => void;
  listParticipants: (room: string) => Participant[];

  // ── Figure state ───────────────────────────────────────────────────
  figureMaps: Map<string, Map<string, any>>;
  rooms: Map<string, Set<any>>;
  ensureFigureMap: (room: string) => Map<string, any>;
  seedFigureMapFromState: (map: Map<string, any>, state: any) => void;
  applyMutation: (room: string, msg: any) => void;
  buildStateFromMutations: (room: string) => any;

  // ── Figure locks ───────────────────────────────────────────────────
  acquireFigureLock: (room: string, id: string, owner: { userId: string; name: string; color: string }) => boolean;
  releaseFigureLock: (room: string, id: string, userId: string) => boolean;
  releaseLocksForUser: (room: string, userId: string) => void;
  orphanFiguresForUser: (room: string, userId: string) => string[];
  listFigureLocks: (room: string) => FigureLock[];

  // ── Permissions ────────────────────────────────────────────────────
  canMutate: (ctx: MutateContext) => boolean;
  resolveRole: (ws: any, roles: Record<string, Role>) => Role;
  validateAppearance: (appearance: FigureAppearance) => string | null;

  // ── Persistence ────────────────────────────────────────────────────
  readState: (room: string) => Promise<RoomState>;
  schedulePersist: (room: string) => void;
  flushImmediate: (room: string) => Promise<void>;

  // ── Event log (optional — backwards-compat) ────────────────────────
  /** Log a mutation event for replay recording. */
  logEvent?: (room: string, sessionCode: string | null, eventType: string, payload: any) => void;
  /** Flush the event buffer for a room immediately (called on session-end). */
  flushEventLog?: (room: string) => Promise<void>;

  // ── Admin / session commands ───────────────────────────────────────
  handleAdminSessionCreate: (room: string, adminPlayerId: string) => { ok: boolean; code?: string };
  handleAdminHandoffMessage: (room: string, fromPlayerId: string, toPlayerId: string, broadcastFn: (m: ServerMessage) => void) => { ok: boolean; reason?: string };
  handleAdminRoundStart: (room: string, broadcastFn: (m: ServerMessage) => void) => { ok: boolean; reason?: string; noop?: boolean };
  handleAdminRoundStop: (room: string, broadcastFn: (m: ServerMessage) => void) => { ok: boolean; reason?: string };
  handleAdminRoundPause: (room: string, broadcastFn: (m: ServerMessage) => void) => { ok: boolean; reason?: string };
  handleAdminSetOptik: (room: string, settings: OptikSettings, broadcastFn: (m: ServerMessage) => void) => { ok: boolean };
  handleAdminSetTemplate: (room: string, templateId: string, broadcastFn: (m: ServerMessage) => void) => { ok: boolean };

  // ── Snapshot & template ────────────────────────────────────────────
  loadSnapshotState?: (snapshotId: string) => Promise<RoomState>;
  applyTemplateToRoom?: (room: string, templateState: RoomState, broadcastFn: (m: ServerMessage) => void) => void;

  // ── Player tracking ────────────────────────────────────────────────
  trackPlayerInRoom: (room: string, playerId: string) => void;
  transitionPhase: (room: string, phase: Phase) => { ok: boolean; from?: Phase | null; to?: Phase; reason?: string };

  // ── Admin token ────────────────────────────────────────────────────
  isAdminFromClaims: (claims: any) => boolean;
  getAdminTokenHolder: (room: string) => string | null;
  beginTokenGrace: (room: string, playerId: string) => void;
  setRoomAdminPresence: (room: string, admins: string[]) => void;
  reclaimAdminToken: (room: string, playerId: string) => void;
  roomAdminPresence: Map<string, Set<string>>;

  // ── Session middleware ─────────────────────────────────────────────
  sessionMiddleware?: any;

  // ── Undo/Redo (optional — T000470) ────────────────────────────────
  captureBeforeSnapshot?: (room: string, msg: any) => Map<string, any | null>;
  captureAfterSnapshot?: (before: Map<string, any | null>, room: string, msg: any) => Map<string, any | null>;
  pushUndo?: (room: string, entry: UndoEntry) => void;
  performUndo?: (room: string) => { applied: true; entry: UndoEntry } | { applied: false };
  performRedo?: (room: string) => { applied: true; entry: UndoEntry } | { applied: false };
  getUndoStatus?: (room: string) => { canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number };
  clearUndoStacks?: (room: string) => void;
  cleanupRoomTracking?: (room: string) => void;
  resolveShareToken?: (token: string) => Promise<string | null>;
  resolveZuschauerToken?: (token: string) => Promise<string | null>;
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
  'anchor_create', 'anchor_delete', 'zone_create', 'zone_update', 'zone_delete',  // NEU T000468 + zone_update (E1)
  'figure_hide_set',  // E9 verdecktes Arbeiten — leiter-exklusiv
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
  if (ws?._isGuest) {
    return msgType === 'request_state_snapshot';
  }
  if (ws?._isZuschauer) {
    return msgType === 'request_state_snapshot';
  }
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

export { attachWsServer, handleDisconnect, startHeartbeat } from './ws-connection';
