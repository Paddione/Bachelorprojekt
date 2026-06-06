import express from 'express';
import session from 'express-session';
import http from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { Issuer } from 'openid-client';

import * as db from './db';
import * as auth from './auth';
import * as figures from './figures';
import * as phases from './phases';
import * as sessions from './sessions';
import * as rooms from './rooms';
import * as presets from './presets';
import * as wsHandler from './ws-handler';

// ── Dependency wiring (same order proven in Phase 2) ──────────────
phases.initPhases({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation });
db.initDb({ buildStateFromMutations: (room) => phases.buildStateFromMutations(room) });
sessions.initSessions({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation, transitionPhase: phases.transitionPhase });
figures.initFigures({ validateAppearance: presets.validateAppearance });

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

app.use(express.static(path.join(__dirname, '..', '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
    }
  }
}));

export function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

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
  const client = await auth.getOidcClient();
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
  const redirectUri = `${BRETT_PUBLIC_URL}/auth/callback`;
  const url = client.authorizationUrl({ scope: 'openid profile', redirect_uri: redirectUri, state });
  res.redirect(url);
}));

app.get('/auth/callback', asyncHandler(async (req: any, res: any) => {
  const client = await auth.getOidcClient();
  const redirectUri = `${BRETT_PUBLIC_URL}/auth/callback`;
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(redirectUri, params, { state: params.state });
  const claims = tokenSet.claims();
  let returnTo = '/';
  try { returnTo = JSON.parse(Buffer.from(params.state, 'base64url').toString()).returnTo || '/'; } catch {}
  req.session.userId   = claims.sub;
  req.session.name     = claims.name || claims.preferred_username || claims.sub;
  req.session.isAdmin  = auth.isAdminFromClaims(claims);
  res.redirect(returnTo);
}));

app.get('/auth/me', (req: any, res: any) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  res.json({ authenticated: true, userId: req.session.userId, name: req.session.name, isAdmin: !!req.session.isAdmin });
});

app.post('/auth/e2e-login', (req: any, res: any) => {
  const secret = process.env.BRETT_OIDC_SECRET;
  if (!secret || req.header('x-e2e-secret') !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.session.userId = 'e2e-admin';
  req.session.name = 'E2E Admin';
  req.session.isAdmin = true;
  req.session.save((err: any) => {
    if (err) return res.status(500).json({ error: 'session save failed' });
    return res.json({ success: true });
  });
});

// Live state for a room.
app.get('/api/state', asyncHandler(async (req: any, res: any) => {
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

// List snapshots, optionally filtered.
app.get('/api/snapshots', asyncHandler(async (req: any, res: any) => {
  const room = req.query.room ? String(req.query.room) : null;
  const customerId = req.query.customer_id ? String(req.query.customer_id) : null;
  if (!room && !customerId) {
    return res.status(400).json({ error: 'room or customer_id required' });
  }
  const where = [];
  const args = [];
  if (room)       { args.push(room);       where.push(`room_token = $${args.length}`); }
  if (customerId) { args.push(customerId); where.push(`customer_id = $${args.length}`); }
  const { rows } = await db.getPool().query(
    `SELECT id, name, room_token, customer_id, created_at
       FROM brett_snapshots
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 200`,
    args
  );
  res.json(rows);
}));

// Load one snapshot.
app.get('/api/snapshots/:id', asyncHandler(async (req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT id, name, state, customer_id, room_token, created_at
       FROM brett_snapshots WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

// Admin room list.
app.get('/api/admin/rooms', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
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

// Create a snapshot.
app.post('/api/snapshots', asyncHandler(async (req: any, res: any) => {
  const { room_token, customer_id, name, state } = req.body || {};
  if (!name || typeof name !== 'string' || name.length > 200) {
    return res.status(400).json({ error: 'name required (≤200 chars)' });
  }
  if (!state || typeof state !== 'object' || !Array.isArray(state.figures)) {
    return res.status(400).json({ error: 'state.figures[] required' });
  }
  const { rows } = await db.getPool().query(
    `INSERT INTO brett_snapshots (room_token, customer_id, name, state)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [room_token || null, customer_id || null, name, state]
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
      const decision = sessions.shouldRejectReconnect(room, null);
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

const wsDeps = {
  joinRoom: rooms.joinRoom,
  leaveRoom: rooms.leaveRoom,
  broadcast: rooms.broadcast,
  broadcastInfo: rooms.broadcastInfo,
  addParticipant: rooms.addParticipant,
  removeParticipant: rooms.removeParticipant,
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
  listFigureLocks: figures.listFigureLocks,
  validateAppearance: presets.validateAppearance,
  readState: db.readState,
  schedulePersist: db.schedulePersist,
  flushImmediate: db.flushImmediate,
  handleAdminSessionCreate: sessions.handleAdminSessionCreate,
  handleAdminHandoffMessage: sessions.handleAdminHandoffMessage,
  handleAdminRoundStop: sessions.handleAdminRoundStop,
  handleAdminRoundPause: sessions.handleAdminRoundPause,
  trackPlayerInRoom: sessions.trackPlayerInRoom,
  transitionPhase: phases.transitionPhase,
  isAdminFromClaims: auth.isAdminFromClaims,
  sessionMiddleware,
};

wsHandler.attachWsServer(wss, wsDeps);
wsHandler.startHeartbeat(wss);
wsHandler.startIdleSweep({ checkAllSessions: sessions.checkAllSessions, broadcast: rooms.broadcast, schedulePersist: db.schedulePersist });

let shuttingDown = false;
export async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[brett] ${signal} received, flushing...`);
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
  figures, phases, sessions, rooms, presets, auth, db, wsHandler
};
export const figureMaps = figures.figureMaps;
export const applyMutation = figures.applyMutation;
export const buildStateFromMutations = phases.buildStateFromMutations;
export const validateAppearance = presets.validateAppearance;
export const transitionPhase = phases.transitionPhase;
export const sessionCodeIndex = sessions.sessionCodeIndex;
export const RELAY_TYPES = Array.from(wsHandler.RELAY_TYPES);
export const pool = db.getPool();
export const handleDisconnect = (ws: any) => wsHandler.handleDisconnect(ws, wsDeps);
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
export const listFigureLocks = figures.listFigureLocks;
export const addParticipant = rooms.addParticipant;
export const removeParticipant = rooms.removeParticipant;
export const listParticipants = rooms.listParticipants;
export const trackPlayerInRoom = sessions.trackPlayerInRoom;
export const wasPreviouslyInRoom = sessions.wasPreviouslyInRoom;
export const shouldRejectReconnect = sessions.shouldRejectReconnect;
export const handleAdminSessionCreate = sessions.handleAdminSessionCreate;
export const handleAdminRoundStop = sessions.handleAdminRoundStop;
export const handleAdminRoundPause = sessions.handleAdminRoundPause;
export const tokenGraceTimers = sessions.tokenGraceTimers;
export const roomAdminPresence = sessions.roomAdminPresence;

export { app };
