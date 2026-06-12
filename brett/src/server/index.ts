import express from 'express';
import session from 'express-session';
import http from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { buildAuthorizationUrl, authorizationCodeGrant } from 'openid-client';

import * as db from './db';
import * as auth from './auth';
import * as figures from './figures';
import * as phases from './phases';
import * as sessions from './sessions';
import * as rooms from './rooms';
import * as presets from './presets';
import * as permissions from './permissions';
import * as wsHandler from './ws-handler';
import * as wsAdminCommands from './ws-admin-commands';
import * as undoStackModule from './undo-stack';
import * as eventLog from './event-log';
import * as shareTokens from './share-tokens';
import { attachShareRoutes } from './share-routes';
import { asyncHandler } from './helpers';
import { attachSkinsUpload } from './skins-upload';
import { listCoachingTemplates, getCoachingTemplate } from './coaching-templates';

// ── Dependency wiring (same order proven in Phase 2) ──────────────
phases.initPhases({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation });
db.initDb({ buildStateFromMutations: (room) => phases.buildStateFromMutations(room) });
// Run DB migrations on startup (idempotent). Skipped under MOCK_DB (tests).
if (process.env.MOCK_DB !== 'true') {
  db.runMigrations().catch(err => console.error('[brett] migration error:', err));
}
// Event-log initialization (Slice 5, T000472 — replay recording).
eventLog.initEventLog({ pool: db.getPool() });
sessions.initSessions({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation, transitionPhase: phases.transitionPhase });
figures.initFigures({ validateAppearance: presets.validateAppearance, buildStateFromMutations: (room) => phases.buildStateFromMutations(room) });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const SESSION_SECRET = process.env.BRETT_SESSION_SECRET || 'dev-session-secret-change-me';
export const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  },
});

app.use(sessionMiddleware);
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path !== '/' && req.path !== '/index.html') return next();
  const redirect = auth.boardAuthRedirect(req, process.env);
  if (redirect) return res.redirect(redirect);
  next();
});

// In production (after `vite build`), serve from dist/client; in dev, fall back to public/.
const distClient = path.join(__dirname, '..', '..', 'dist', 'client');
const staticDir = fs.existsSync(path.join(distClient, 'index.html'))
  ? distClient
  : path.join(__dirname, '..', '..', 'public');
app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
    }
  }
}));

export { asyncHandler } from './helpers';

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));
attachShareRoutes(app, staticDir);

app.get('/api/config', (_req, res) =>
  res.json({ ...auth.buildConfig(process.env), brand: auth.resolveBrand(process.env) }));

export function resolveJoinTarget(code: any): { redirect?: string; error?: string } {
  const room = typeof code === 'string' ? sessions.resolveSessionCode(code) : null;
  return room ? { redirect: `/?room=${room}` } : { error: 'unknown-code' };
}

app.get('/api/join', (req, res) => {
  const result = resolveJoinTarget(req.query.code);
  if (result.redirect) return res.redirect(result.redirect);
  return res.status(404).type('text/plain').send('Unbekannter oder abgelaufener Session-Code.');
});

// ─── Auth (OIDC / Keycloak) ───────────────────────────────────────────────────
const BRETT_PUBLIC_URL = process.env.BRETT_PUBLIC_URL || 'http://brett.localhost';

app.get('/auth/login', asyncHandler(async (req: any, res: any) => {
  const config = await auth.getOidcClient();
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
  const redirectUri = `${BRETT_PUBLIC_URL}/auth/callback`;
  const url = buildAuthorizationUrl(config, { scope: 'openid profile', redirect_uri: redirectUri, state });
  res.redirect(url.toString());
}));

app.get('/auth/callback', asyncHandler(async (req: any, res: any) => {
  const config = await auth.getOidcClient();
  const host = (req.headers.host as string) || 'localhost';
  const proto = (req.protocol as string) || 'http';
  const currentUrl = new URL(req.url as string, `${proto}://${host}`);
  const incomingState = currentUrl.searchParams.get('state') ?? '';
  const tokens = await authorizationCodeGrant(config, currentUrl, { expectedState: incomingState });
  const claims = tokens.claims();
  let returnTo = '/';
  try { returnTo = auth.sanitizeReturnTo(JSON.parse(Buffer.from(currentUrl.searchParams.get('state') || '', 'base64url').toString()).returnTo); } catch {}
  req.session.userId   = claims?.sub;
  req.session.name     = (claims as any)?.name || (claims as any)?.preferred_username || claims?.sub;
  req.session.isAdmin  = auth.isAdminFromClaims(claims);
  res.redirect(returnTo);
}));

app.get('/auth/me', (req: any, res: any) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  res.json({ authenticated: true, userId: req.session.userId, name: req.session.name, isAdmin: !!req.session.isAdmin });
});

/**
 * Resolve the identity an /auth/e2e-login request asks for. The endpoint accepts
 * optional `userId`/`name`/`isAdmin` so two browser contexts can hold DISTINCT,
 * role-distinct identities (required by the C7 observer-gate E2E). Defaults match
 * the historical single-admin behavior. `isAdmin` defaults to true and is only
 * forced false when explicitly `false` (so a non-admin context can be created;
 * the C7 test keeps both admins to prove enforcement keys on ROLE, not isAdmin).
 */
export function resolveE2eIdentity(body: any): { userId: string; name: string; isAdmin: boolean } {
  const b = body || {};
  return {
    userId: typeof b.userId === 'string' && b.userId ? b.userId : 'e2e-admin',
    name: typeof b.name === 'string' && b.name ? b.name : 'E2E Admin',
    isAdmin: b.isAdmin === false ? false : true,
  };
}

app.post('/auth/e2e-login', (req: any, res: any) => {
  const secret = process.env.BRETT_OIDC_SECRET;
  if (!secret || req.header('x-e2e-secret') !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const ident = resolveE2eIdentity(req.body);
  req.session.userId = ident.userId;
  req.session.name = ident.name;
  req.session.isAdmin = ident.isAdmin;
  req.session.save((err: any) => {
    if (err) return res.status(500).json({ error: 'session save failed' });
    return res.json({ success: true, userId: ident.userId, isAdmin: ident.isAdmin });
  });
});

// Live state for a room.
app.get('/api/state', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const room = String(req.query.room || '');
  if (!room) return res.status(400).json({ error: 'room required' });
  const { rows } = await db.getPool().query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room]
  );
  res.json(rows[0]?.state ?? { figures: [] });
}));

// Customer dropdown source.
app.get('/api/customers', asyncHandler(async (_req: any, res: any) => {
  const { rows } = await db.getPool().query(
    'SELECT id, name FROM customers ORDER BY name ASC'
  );
  res.json(rows);
}));

// D8 — Pure: build the snapshot-list SELECT. `isTemplate:true` is a valid
// standalone filter (curated templates need no room/customer). room/customer_id
// still filter as before; an empty filter set yields `valid:false`.
export function buildSnapshotListQuery(
  opts: { room?: string | null; customerId?: string | null; isTemplate?: boolean }
): { sql: string; args: any[]; valid: boolean } {
  const where: string[] = [];
  const args: any[] = [];
  if (opts.room)       { args.push(opts.room);       where.push(`room_token = $${args.length}`); }
  if (opts.customerId) { args.push(opts.customerId); where.push(`customer_id = $${args.length}`); }
  if (opts.isTemplate) { where.push('is_template = true'); }
  const sql =
    `SELECT id, name, room_token, customer_id, is_template, created_at
       FROM brett_snapshots` +
    (where.length ? `\n      WHERE ${where.join(' AND ')}` : '') +
    `\n      ORDER BY created_at DESC
      LIMIT 200`;
  return { sql, args, valid: where.length > 0 };
}

// D8 — Pure: validate + normalize a snapshot-insert body. is_template defaults
// to false; name (≤200) and state.figures[] are required.
export function parseSnapshotInsert(
  body: any
): { valid: boolean; values?: { room_token: string | null; customer_id: string | null; name: string; state: any; is_template: boolean } } {
  const b = body || {};
  if (!b.name || typeof b.name !== 'string' || b.name.length > 200) return { valid: false };
  if (!b.state || typeof b.state !== 'object' || !Array.isArray(b.state.figures)) return { valid: false };
  return {
    valid: true,
    values: {
      room_token: b.room_token || null,
      customer_id: b.customer_id || null,
      name: b.name,
      state: b.state,
      is_template: b.is_template === true,
    },
  };
}

// List snapshots, optionally filtered (incl. curated templates via is_template).
app.get('/api/snapshots', asyncHandler(async (req: any, res: any) => {
  const room = req.query.room ? String(req.query.room) : null;
  const customerId = req.query.customer_id ? String(req.query.customer_id) : null;
  const isTemplate = req.query.is_template === 'true';
  const q = buildSnapshotListQuery({ room, customerId, isTemplate });
  if (!q.valid) {
    return res.status(400).json({ error: 'room, customer_id or is_template required' });
  }
  const { rows } = await db.getPool().query(q.sql, q.args);
  res.json(rows);
}));

// Load one snapshot.
app.get('/api/snapshots/:id', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT id, name, state, customer_id, room_token, created_at
       FROM brett_snapshots WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

// Coaching-step templates surfaced in the lobby. Public read (no admin gate) —
// they contain only generic coaching prompts, no client data.
app.get('/api/templates', asyncHandler(async (_req: any, res: any) => {
  const brand = process.env.BRAND || 'mentolder';
  const rows = await listCoachingTemplates(db.getPool() as any, brand);
  res.json(rows);
}));

app.get('/api/templates/:id', asyncHandler(async (req: any, res: any) => {
  const tpl = await getCoachingTemplate(db.getPool() as any, req.params.id);
  if (!tpl) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(tpl);
}));

// ── Replay / Event-Log API (Slice 5, T000472) ───────────────────────────────

/** GET /api/sessions/:room/events — liefert alle Events einer Session (admin only). */
app.get('/api/sessions/:room/events', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { room } = req.params;
  const sinceSeqRaw = parseInt(req.query.sinceSeq as string, 10);
  const sinceSeq = req.query.sinceSeq && !isNaN(sinceSeqRaw) ? sinceSeqRaw : undefined;
  const limitRaw = parseInt(req.query.limit as string, 10);
  const limit = req.query.limit && !isNaN(limitRaw) ? Math.min(limitRaw, 10_000) : undefined;
  const events = await eventLog.loadEvents(room, { sinceSeq, limit });
  res.json({ events });
}));

/** GET /api/sessions/:room/snapshot — liefert den initial gespeicherten State (admin only). */
app.get('/api/sessions/:room/snapshot', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { room } = req.params;
  const state = await db.readState(room);
  res.json({ state, recordedAt: new Date().toISOString() });
}));

/** GET /api/sessions — listet Sessions eines Rooms (admin only). */
app.get('/api/sessions', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const room = req.query.room as string;
  if (!room) { return res.status(400).json({ error: 'room required' }); }
  const sessions = await eventLog.loadSessionMetas(room);
  res.json({ sessions });
}));

// Admin room list.
app.get('/api/admin/rooms', auth.requireAdmin, asyncHandler(async (_req: any, res: any) => {
  const liveTokens = Array.from(rooms.rooms.keys());
  let nameMap: Record<string, string> = {};
  if (liveTokens.length > 0) {
    const placeholders = liveTokens.map((_, i) => `$${i + 1}`).join(',');
    const rows = await db.getPool().query(
      `SELECT room_token, state->>'name' AS name FROM brett_rooms WHERE room_token = ANY(ARRAY[${placeholders}])`,
      liveTokens
    ).catch(() => ({ rows: [] }));
    for (const r of rows.rows) nameMap[r.room_token] = r.name;
  }
  const result = liveTokens.map(token => {
    const playerCount = Array.from(rooms.rooms.get(token) || []).length;
    return {
      token,
      name:        nameMap[token] || token,
      playerCount,
      maxPlayers:  4,
      lastActive:  new Date().toISOString(),
    };
  });
  res.json(result);
}));

// D8 / SEC-2 — Pure: may this request create a curated TEMPLATE (is_template=true)?
// Admin-only — allowed iff the OIDC session is admin OR the request carries the
// valid x-e2e-secret (E2E bypass). Extracted so the admin gate is unit-testable
// against the real route logic, not a copy.
export function canCreateTemplate(req: { session?: { isAdmin?: boolean }; header: (n: string) => string | undefined }): boolean {
  if (req.session?.isAdmin) return true;
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  return !!e2eSecret && req.header('x-e2e-secret') === e2eSecret;
}

// SEC T000660: re-export for direct unit-test access (snapshots-route.test.ts)
export { requireSession } from './auth';

// Create a snapshot. Template creation (is_template=true) is admin-only —
// curated Vorlagen may only be authored by admins (§5c / D8 guardrail).
app.post('/api/snapshots', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const parsed = parseSnapshotInsert(req.body);
  if (!parsed.valid || !parsed.values) {
    return res.status(400).json({ error: 'name (≤200 chars) + state.figures[] required' });
  }
  const v = parsed.values;
  if (v.is_template && !canCreateTemplate(req)) {
    return res.status(403).json({ error: 'forbidden: template creation is admin-only' });
  }
  const { rows } = await db.getPool().query(
    `INSERT INTO brett_snapshots (room_token, customer_id, name, state, is_template)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [v.room_token, v.customer_id, v.name, v.state, v.is_template]
  );
  res.status(201).json({ id: rows[0].id });
}));

// ─── Presets ─────────────────────────────────────────────────────────────────
app.get('/presets', (_req, res) => {
  res.json(presets.loadPresets());
});

app.post('/presets', asyncHandler(async (req: any, res: any) => {
  const { name, appearance } = req.body || {};
  if (!name || typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'name required (≤100 chars)' });
  }
  const err = presets.validateAppearance(appearance);
  if (err) return res.status(400).json({ error: err });
  const preset = {
    id: randomUUID(),
    name,
    appearance,
    createdAt: new Date().toISOString(),
  };
  const list = presets.loadPresets();
  list.push(preset);
  presets.savePresets(list);
  res.status(201).json(preset);
}));

app.delete('/presets/:id', (req, res) => {
  const list = presets.loadPresets();
  const idx = list.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  list.splice(idx, 1);
  presets.savePresets(list);
  res.status(204).end();
});

// ─── Skins upload (3D asset-generation pipeline target) ───────────────────────
attachSkinsUpload(app);

// Generic error handler so we never leak stack traces.
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[brett] error:', err);
  res.status(500).json({ error: 'internal_error' });
});

export const server = http.createServer(app);
export const wss = new WebSocketServer({
  server,
  path: '/sync',
  maxPayload: 64 * 1024,
  verifyClient: (info: any, cb: any) => {
    try {
      const url = new URL(info.req.url, 'http://x');
      const room = url.searchParams.get('room');
      if (!room) return cb(true);
      const decision = sessions.shouldRejectReconnect(room, url.searchParams.get('playerId'));
      if (decision.reject) {
        return cb(false, decision.code, decision.message);
      }
      cb(true);
    } catch (err) {
      console.error('[brett] verifyClient error:', err);
      cb(true);
    }
  },
});

// T000470: Undo/Redo wrapper functions (figureMaps-injection)
function captureBeforeSnapshot(room: string, msg: any): Map<string, any | null> {
  return undoStackModule.captureBeforeSnapshot(room, msg, figures.figureMaps);
}
function captureAfterSnapshot(before: Map<string, any | null>, room: string, msg: any): Map<string, any | null> {
  return undoStackModule.captureAfterSnapshot(before, figures.figureMaps, room, msg);
}
function pushUndo(room: string, entry: undoStackModule.UndoEntry): void {
  undoStackModule.pushUndo(room, entry);
}
function performUndo(room: string) {
  return undoStackModule.performUndo(room, figures.figureMaps);
}
function performRedo(room: string) {
  return undoStackModule.performRedo(room, figures.figureMaps);
}
function getUndoStatus(room: string) {
  return undoStackModule.getUndoStatus(room);
}
function clearUndoStacks(room: string): void {
  undoStackModule.clearStacks(room);
}

const wsDeps = {
  joinRoom: rooms.joinRoom,
  leaveRoom: rooms.leaveRoom,
  broadcast: rooms.broadcast,
  broadcastInfo: rooms.broadcastInfo,
  addParticipant: rooms.addParticipant,
  removeParticipant: rooms.removeParticipant,
  clearParticipants: rooms.clearParticipants,
  listParticipants: rooms.listParticipants,
  figureMaps: figures.figureMaps,
  rooms: rooms.rooms,
  ensureFigureMap: figures.ensureFigureMap,
  seedFigureMapFromState: figures.seedFigureMapFromState,
  applyMutation: figures.applyMutation,
  buildStateFromMutations: phases.buildStateFromMutations,
  acquireFigureLock: figures.acquireFigureLock,
  releaseFigureLock: figures.releaseFigureLock,
  releaseLocksForUser: figures.releaseLocksForUser,
  orphanFiguresForUser: figures.orphanFiguresForUser,
  listFigureLocks: figures.listFigureLocks,
  canMutate: permissions.canMutate,
  resolveRole: permissions.resolveRole,
  validateAppearance: presets.validateAppearance,
  readState: db.readState,
  schedulePersist: db.schedulePersist,
  flushImmediate: db.flushImmediate,
  logEvent: eventLog.appendEvent,
  flushEventLog: eventLog.flushEventBuffer,
  handleAdminSessionCreate: sessions.handleAdminSessionCreate,
  handleAdminHandoffMessage: sessions.handleAdminHandoffMessage,
  handleAdminRoundStop: sessions.handleAdminRoundStop,
  handleAdminRoundPause: sessions.handleAdminRoundPause,
  handleAdminRoundStart: sessions.handleAdminRoundStart,
  handleAdminSetOptik: sessions.handleAdminSetOptik,
  handleAdminSetTemplate: sessions.handleAdminSetTemplate,
  loadSnapshotState: db.loadSnapshotState,
  applyTemplateToRoom: figures.applyTemplateToRoom,
  trackPlayerInRoom: sessions.trackPlayerInRoom,
  cleanupRoomTracking: sessions.cleanupRoomTracking,
  transitionPhase: phases.transitionPhase,
  isAdminFromClaims: auth.isAdminFromClaims,
  getAdminTokenHolder: sessions.getAdminTokenHolder,
  beginTokenGrace: sessions.beginTokenGrace,
  setRoomAdminPresence: sessions.setRoomAdminPresence,
  reclaimAdminToken: sessions.reclaimAdminToken,
  roomAdminPresence: sessions.roomAdminPresence,
  sessionMiddleware,
  captureBeforeSnapshot,
  captureAfterSnapshot,
  pushUndo,
  performUndo,
  performRedo,
  getUndoStatus,
  clearUndoStacks,
  resolveShareToken: shareTokens.resolveShareToken,
};

wsHandler.attachWsServer(wss, wsDeps);
wsHandler.startHeartbeat(wss);
wsAdminCommands.startIdleSweep({ checkAllSessions: sessions.checkAllSessions, broadcast: rooms.broadcast, schedulePersist: db.schedulePersist });

let shuttingDown = false;
export async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[brett] ${signal} received, flushing...`);
  // Flush event-log buffers before state (events should land before the snapshot).
  try { await eventLog.flushAll(); } catch (err) { console.error('[brett] shutdown event-log flush:', err); }
  const pending = db.getPending();
  for (const room of pending.keys()) {
    try { await db.flushImmediate(room); } catch (err) { console.error('[brett] shutdown flush:', err); }
  }
  server.close(() => {
    db.getPool().end()
      .catch((err: any) => console.error('[brett] pool.end:', err.message))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 25_000).unref();   // safety net under 30s grace
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const isMain = typeof require !== 'undefined' && require.main === module;
if (process.env.NODE_ENV !== 'test' && isMain) {
  server.listen(PORT, () => console.log(`brett listening on :${PORT}`));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

// Re-export every symbol the test suite imports.
export {
  figures, phases, sessions, rooms, presets, permissions, auth, db, wsHandler
};
export const canMutate = permissions.canMutate;
export const resolveRole = permissions.resolveRole;
export const figureMaps = figures.figureMaps;
export const applyMutation = figures.applyMutation;
export const buildStateFromMutations = phases.buildStateFromMutations;
export const validateAppearance = presets.validateAppearance;
export const transitionPhase = phases.transitionPhase;
export const sessionCodeIndex = sessions.sessionCodeIndex;
export const RELAY_TYPES = Array.from(wsHandler.RELAY_TYPES);
export const ADMIN_TYPES = wsHandler.ADMIN_TYPES;
export const pool = db.getPool();
export const handleDisconnect = (ws: any) => wsHandler.handleDisconnect(ws, wsDeps);
export const resolvePlayerId = wsHandler.resolvePlayerId;
export const handleAssignRole = wsHandler.handleAssignRole;
export const handleLobbySetReady = wsHandler.handleLobbySetReady;
export const gateSessionReady = wsHandler.gateSessionReady;
export const onLeaderDisconnect = wsHandler.onLeaderDisconnect;
export const TRANSIENT_TYPES = new Set([]);

export const assignAdminToken = sessions.assignAdminToken;
export const handoffAdminToken = sessions.handoffAdminToken;
export const releaseAdminToken = sessions.releaseAdminToken;
export const getAdminTokenHolder = sessions.getAdminTokenHolder;
export const beginTokenGrace = sessions.beginTokenGrace;
export const reclaimAdminToken = sessions.reclaimAdminToken;
export const setRoomAdminPresence = sessions.setRoomAdminPresence;
export const handleAdminHandoffMessage = sessions.handleAdminHandoffMessage;
export const boardAuthRedirect = auth.boardAuthRedirect;
// resolveE2eIdentity is declared above with `export function`; no re-export needed.
export const resolveBrand = auth.resolveBrand;
export const buildConfig = auth.buildConfig;
export const isAdminFromClaims = auth.isAdminFromClaims;
export const touchSessionActivity = sessions.touchSessionActivity;
export const checkSessionIdle = sessions.checkSessionIdle;
export const checkAllSessions = sessions.checkAllSessions;
export const registerSessionCode = sessions.registerSessionCode;
export const generateSessionCode = sessions.generateSessionCode;
export const resolveSessionCode = sessions.resolveSessionCode;
export const rebuildSessionCodeIndexFromStates = sessions.rebuildSessionCodeIndexFromStates;
export const acquireFigureLock = figures.acquireFigureLock;
export const releaseFigureLock = figures.releaseFigureLock;
export const releaseLocksForUser = figures.releaseLocksForUser;
export const orphanFiguresForUser = figures.orphanFiguresForUser;
export const listFigureLocks = figures.listFigureLocks;
export const seedFigureMapFromState = figures.seedFigureMapFromState;
export const seedFiguresFromTemplate = figures.seedFiguresFromTemplate;
export const applyTemplateToRoom = figures.applyTemplateToRoom;
export const addParticipant = rooms.addParticipant;
export const removeParticipant = rooms.removeParticipant;
export const clearParticipants = rooms.clearParticipants;
export const listParticipants = rooms.listParticipants;
export const colorForIndex = rooms.colorForIndex;
export const trackPlayerInRoom = sessions.trackPlayerInRoom;
export const wasPreviouslyInRoom = sessions.wasPreviouslyInRoom;
export const shouldRejectReconnect = sessions.shouldRejectReconnect;
export const handleAdminSessionCreate = sessions.handleAdminSessionCreate;
export const handleAdminRoundStop = sessions.handleAdminRoundStop;
export const handleAdminRoundPause = sessions.handleAdminRoundPause;
export const handleAdminRoundStart = sessions.handleAdminRoundStart;
export const handleAdminSetOptik = sessions.handleAdminSetOptik;
export const handleAdminSetTemplate = sessions.handleAdminSetTemplate;
export const loadSnapshotState = db.loadSnapshotState;
export const tokenGraceTimers = sessions.tokenGraceTimers;
export const roomAdminPresence = sessions.roomAdminPresence;

export { app };

// T000470: Re-exports for test suite
export const undoStacks = undoStackModule.undoStacks;
export const redoStacks = undoStackModule.redoStacks;
export const UNDOABLE_TYPES = undoStackModule.UNDOABLE_TYPES;
export { undoStackModule };

