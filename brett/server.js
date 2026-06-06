'use strict';
// tsx bridge: allow require() of .ts modules during the TS migration (Phase 2).
require('tsx/cjs');

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');




const presetsMod = require('./src/server/presets.ts');
const validateAppearance = presetsMod.validateAppearance;
const loadPresets = presetsMod.loadPresets;
const savePresets = presetsMod.savePresets;

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const session = require('express-session');
const { Issuer } = require('openid-client');

const SESSION_SECRET = process.env.BRETT_SESSION_SECRET || 'dev-session-secret-change-me';
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  },
});

const authMod = require('./src/server/auth.ts');
const getOidcClient = authMod.getOidcClient;
const isAdminFromClaims = authMod.isAdminFromClaims;
const buildConfig = authMod.buildConfig;
const resolveBrand = authMod.resolveBrand;
const boardAuthRedirect = authMod.boardAuthRedirect;
const requireAdmin = authMod.requireAdmin;

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!process.env.DATABASE_URL && require.main === module && process.env.MOCK_DB !== 'true') {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const figuresMod = require('./src/server/figures.ts');
const figureMaps = figuresMod.figureMaps;
const figureLocks = figuresMod.figureLocks;
const ensureFigureMap = figuresMod.ensureFigureMap;
const applyMutation = figuresMod.applyMutation;
const ensureFigureLocks = figuresMod.ensureFigureLocks;
const acquireFigureLock = figuresMod.acquireFigureLock;
const releaseFigureLock = figuresMod.releaseFigureLock;
const releaseLocksForUser = figuresMod.releaseLocksForUser;
const listFigureLocks = figuresMod.listFigureLocks;

const dbMod = require('./src/server/db.ts');
const phasesMod = require('./src/server/phases.ts');

const buildStateFromMutations = (room) => phasesMod.buildStateFromMutations(room);
const transitionPhase = (room, newPhase) => phasesMod.transitionPhase(room, newPhase);

dbMod.initDb({ buildStateFromMutations });
const pool = dbMod.getPool();
const readState = dbMod.readState;
const persistState = dbMod.persistState;
const schedulePersist = dbMod.schedulePersist;
const flushImmediate = dbMod.flushImmediate;
phasesMod.initPhases({ figureMaps, applyMutation });
figuresMod.initFigures({ validateAppearance });

const sessionsMod = require('./src/server/sessions.ts');
sessionsMod.initSessions({ figureMaps, applyMutation, transitionPhase });
const sessionCodeIndex = sessionsMod.sessionCodeIndex;
const tokenGraceTimers = sessionsMod.tokenGraceTimers;
const roomAdminPresence = sessionsMod.roomAdminPresence;
const roomPreviousPlayers = sessionsMod.roomPreviousPlayers;
const IDLE_TIMEOUT_MS = sessionsMod.IDLE_TIMEOUT_MS;
const generateSessionCode = sessionsMod.generateSessionCode;
const registerSessionCode = sessionsMod.registerSessionCode;
const resolveSessionCode = sessionsMod.resolveSessionCode;
const rebuildSessionCodeIndexFromStates = sessionsMod.rebuildSessionCodeIndexFromStates;
const getAdminTokenHolder = sessionsMod.getAdminTokenHolder;
const assignAdminToken = sessionsMod.assignAdminToken;
const handoffAdminToken = sessionsMod.handoffAdminToken;
const releaseAdminToken = sessionsMod.releaseAdminToken;
const setRoomAdminPresence = sessionsMod.setRoomAdminPresence;
const beginTokenGrace = sessionsMod.beginTokenGrace;
const reclaimAdminToken = sessionsMod.reclaimAdminToken;
const handleAdminSessionCreate = sessionsMod.handleAdminSessionCreate;
const handleAdminHandoffMessage = sessionsMod.handleAdminHandoffMessage;
const handleAdminRoundStop = sessionsMod.handleAdminRoundStop;
const handleAdminRoundPause = sessionsMod.handleAdminRoundPause;
const trackPlayerInRoom = sessionsMod.trackPlayerInRoom;
const wasPreviouslyInRoom = sessionsMod.wasPreviouslyInRoom;
const shouldRejectReconnect = sessionsMod.shouldRejectReconnect;
const touchSessionActivity = sessionsMod.touchSessionActivity;
const checkSessionIdle = sessionsMod.checkSessionIdle;
const checkAllSessions = sessionsMod.checkAllSessions;



const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path !== '/' && req.path !== '/index.html') return next();
  const redirect = boardAuthRedirect(req, process.env);
  if (redirect) return res.redirect(redirect);
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
    }
  }
}));

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));




app.get('/api/config', (_req, res) =>
  res.json({ ...buildConfig(process.env), brand: resolveBrand(process.env) }));

function resolveJoinTarget(code) {
  const room = typeof code === 'string' ? resolveSessionCode(code) : null;
  return room ? { redirect: `/?room=${room}` } : { error: 'unknown-code' };
}

app.get('/api/join', (req, res) => {
  const result = resolveJoinTarget(req.query.code);
  if (result.redirect) return res.redirect(result.redirect);
  return res.status(404).type('text/plain').send('Unbekannter oder abgelaufener Session-Code.');
});

// ─── Auth (OIDC / Keycloak) ───────────────────────────────────────────────────
const BRETT_PUBLIC_URL = process.env.BRETT_PUBLIC_URL || 'http://brett.localhost';

app.get('/auth/login', asyncHandler(async (req, res) => {
  const client = await getOidcClient();
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
  const redirectUri = `${BRETT_PUBLIC_URL}/auth/callback`;
  const url = client.authorizationUrl({ scope: 'openid profile', redirect_uri: redirectUri, state });
  res.redirect(url);
}));

app.get('/auth/callback', asyncHandler(async (req, res) => {
  const client = await getOidcClient();
  const redirectUri = `${BRETT_PUBLIC_URL}/auth/callback`;
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(redirectUri, params, { state: params.state });
  const claims = tokenSet.claims();
  let returnTo = '/';
  try { returnTo = JSON.parse(Buffer.from(params.state, 'base64url').toString()).returnTo || '/'; } catch {}
  req.session.userId   = claims.sub;
  req.session.name     = claims.name || claims.preferred_username || claims.sub;
  req.session.isAdmin  = isAdminFromClaims(claims);
  res.redirect(returnTo);
}));

app.get('/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  res.json({ authenticated: true, userId: req.session.userId, name: req.session.name, isAdmin: !!req.session.isAdmin });
});



app.post('/auth/e2e-login', (req, res) => {
  const secret = process.env.BRETT_OIDC_SECRET;
  if (!secret || req.header('x-e2e-secret') !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.session.userId = 'e2e-admin';
  req.session.name = 'E2E Admin';
  req.session.isAdmin = true;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'session save failed' });
    return res.json({ success: true });
  });
});

// Live state for a room.
app.get('/api/state', asyncHandler(async (req, res) => {
  const room = String(req.query.room || '');
  if (!room) return res.status(400).json({ error: 'room required' });
  const { rows } = await pool.query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room]
  );
  res.json(rows[0]?.state ?? { figures: [] });
}));

// Customer dropdown source.
app.get('/api/customers', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name FROM customers ORDER BY name ASC'
  );
  res.json(rows);
}));

// List snapshots, optionally filtered.
app.get('/api/snapshots', asyncHandler(async (req, res) => {
  const room = req.query.room ? String(req.query.room) : null;
  const customerId = req.query.customer_id ? String(req.query.customer_id) : null;
  if (!room && !customerId) {
    return res.status(400).json({ error: 'room or customer_id required' });
  }
  const where = [];
  const args = [];
  if (room)       { args.push(room);       where.push(`room_token = $${args.length}`); }
  if (customerId) { args.push(customerId); where.push(`customer_id = $${args.length}`); }
  const { rows } = await pool.query(
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
app.get('/api/snapshots/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, state, customer_id, room_token, created_at
       FROM brett_snapshots WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));



// Admin room list.
app.get('/api/admin/rooms', requireAdmin, asyncHandler(async (req, res) => {
  const liveTokens = Array.from(rooms.keys());
  let nameMap = {};
  if (liveTokens.length > 0) {
    const placeholders = liveTokens.map((_, i) => `$${i + 1}`).join(',');
    const rows = await pool.query(
      `SELECT room_token, state->>'name' AS name FROM brett_rooms WHERE room_token = ANY(ARRAY[${placeholders}])`,
      liveTokens
    ).catch(() => ({ rows: [] }));
    for (const r of rows.rows) nameMap[r.room_token] = r.name;
  }
  const result = liveTokens.map(token => {
    const playerCount = Array.from(rooms.get(token) || []).length;
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
app.post('/api/snapshots', asyncHandler(async (req, res) => {
  const { room_token, customer_id, name, state } = req.body || {};
  if (!name || typeof name !== 'string' || name.length > 200) {
    return res.status(400).json({ error: 'name required (≤200 chars)' });
  }
  if (!state || typeof state !== 'object' || !Array.isArray(state.figures)) {
    return res.status(400).json({ error: 'state.figures[] required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO brett_snapshots (room_token, customer_id, name, state)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [room_token || null, customer_id || null, name, state]
  );
  res.status(201).json({ id: rows[0].id });
}));

// ─── Presets ─────────────────────────────────────────────────────────────────
app.get('/presets', (_req, res) => {
  res.json(loadPresets());
});

app.post('/presets', asyncHandler(async (req, res) => {
  const { name, appearance } = req.body || {};
  if (!name || typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'name required (≤100 chars)' });
  }
  const err = validateAppearance(appearance);
  if (err) return res.status(400).json({ error: err });
  const preset = {
    id: randomUUID(),
    name,
    appearance,
    createdAt: new Date().toISOString(),
  };
  const presets = loadPresets();
  presets.push(preset);
  savePresets(presets);
  res.status(201).json(preset);
}));

app.delete('/presets/:id', (req, res) => {
  const presets = loadPresets();
  const idx = presets.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  presets.splice(idx, 1);
  savePresets(presets);
  res.status(204).end();
});

// Generic error handler so we never leak stack traces.
app.use((err, _req, res, _next) => {
  console.error('[brett] error:', err);
  res.status(500).json({ error: 'internal_error' });
});

const server = require.main === module
  ? app.listen(PORT, () => { console.log(`brett listening on :${PORT}`); })
  : (() => { const s = require('http').createServer(app); if (process.env.MOCK_DB !== 'true') s.listen(0); return s; })();

// ─── WebSocket sync ──────────────────────────────────────────────
const WebSocket = require('ws');

const wss = new WebSocket.Server({
  server,
  path: '/sync',
  maxPayload: 64 * 1024,
  verifyClient: (info, cb) => {
    try {
      const url = new URL(info.req.url, 'http://x');
      const room = url.searchParams.get('room');
      if (!room) return cb(true);
      const decision = shouldRejectReconnect(room, null);
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

const roomsMod = require('./src/server/rooms.ts');
const rooms = roomsMod.rooms;
const roomParticipants = roomsMod.roomParticipants;
const joinRoom = roomsMod.joinRoom;
const leaveRoom = roomsMod.leaveRoom;
const broadcast = roomsMod.broadcast;
const broadcastInfo = roomsMod.broadcastInfo;
const addParticipant = roomsMod.addParticipant;
const removeParticipant = roomsMod.removeParticipant;
const listParticipants = roomsMod.listParticipants;

// roomToken -> NodeJS.Timeout (debounced persistence)
const pending = dbMod.getPending();

const wsHandlerMod = require('./src/server/ws-handler.ts');
const RELAY_TYPES = Array.from(wsHandlerMod.RELAY_TYPES);
const ADMIN_TYPES = Array.from(wsHandlerMod.ADMIN_TYPES);
const TRANSIENT_TYPES = new Set([]);

const wsDeps = {
  joinRoom, leaveRoom, broadcast, broadcastInfo,
  addParticipant, removeParticipant, listParticipants,
  figureMaps, rooms, ensureFigureMap, applyMutation, buildStateFromMutations,
  acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks,
  validateAppearance, readState, schedulePersist, flushImmediate,
  handleAdminSessionCreate, handleAdminHandoffMessage,
  handleAdminRoundStop, handleAdminRoundPause,
  trackPlayerInRoom, transitionPhase, isAdminFromClaims,
  sessionMiddleware,
};

wsHandlerMod.attachWsServer(wss, wsDeps);
const handleDisconnect = (ws) => wsHandlerMod.handleDisconnect(ws, wsDeps);
wsHandlerMod.startHeartbeat(wss);
wsHandlerMod.startIdleSweep({ checkAllSessions, broadcast, schedulePersist });

// ─── Graceful Shutdown ───────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[brett] ${signal} received, flushing...`);
  for (const room of pending.keys()) {
    try { await flushImmediate(room); } catch (err) { console.error('[brett] shutdown flush:', err); }
  }
  server.close(() => {
    pool.end()
      .catch(err => console.error('[brett] pool.end:', err.message))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 25_000).unref();   // safety net under 30s grace
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = {
  app, server, pool, wss,
  applyMutation, buildStateFromMutations, figureMaps,
  handleDisconnect,
  RELAY_TYPES, TRANSIENT_TYPES,
  isAdminFromClaims,
  validateAppearance,
  buildConfig,
  resolveBrand,
  boardAuthRedirect,
  acquireFigureLock,
  releaseFigureLock,
  releaseLocksForUser,
  listFigureLocks,
  addParticipant,
  removeParticipant,
  listParticipants,
  transitionPhase,
  generateSessionCode,
  registerSessionCode,
  resolveSessionCode,
  resolveJoinTarget,
  sessionCodeIndex,
  rebuildSessionCodeIndexFromStates,
  assignAdminToken,
  handoffAdminToken,
  releaseAdminToken,
  getAdminTokenHolder,
  beginTokenGrace,
  reclaimAdminToken,
  setRoomAdminPresence,
  roomAdminPresence,
  tokenGraceTimers,
  handleAdminSessionCreate,
  handleAdminHandoffMessage,
  handleAdminRoundStop,
  handleAdminRoundPause,
  trackPlayerInRoom,
  wasPreviouslyInRoom,
  shouldRejectReconnect,
  touchSessionActivity,
  checkSessionIdle,
  checkAllSessions,
};
