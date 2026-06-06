'use strict';
// tsx bridge: allow require() of .ts modules during the TS migration (Phase 2).
require('tsx/cjs');

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');




const PRESETS_FILE = process.env.BRETT_PRESETS_PATH || path.join(__dirname, 'presets.json');

const SPEC_PATH = path.join(__dirname, 'public', 'assets', 'figure-pack', 'placement_spec.json');
let SPEC = { faces: {}, accessories: {}, bodies: {} };
try {
  SPEC = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const fc = Object.keys(SPEC.faces || {}).filter(k => !k.startsWith('_')).length;
  const ac = Object.keys(SPEC.accessories || {}).filter(k => !k.startsWith('_')).length;
  const bc = Object.keys(SPEC.bodies || {}).filter(k => !k.startsWith('_')).length;
  console.log(`[figure-pack] loaded spec: ${fc} faces, ${ac} accessories, ${bc} bodies`);
} catch (err) {
  console.warn(`[figure-pack] no spec at ${SPEC_PATH} — appearance validation disabled`);
}

const FACE_NAMES = () => Object.keys(SPEC.faces || {}).filter(k => !k.startsWith('_'));
const BODY_NAMES = () => Object.keys(SPEC.bodies || {}).filter(k => !k.startsWith('_'));
const ACC_NAMES  = () => Object.keys(SPEC.accessories || {}).filter(k => !k.startsWith('_'));

function validateAppearance(a) {
  if (!a || typeof a !== 'object') return 'appearance required';
  const faces = FACE_NAMES();
  const bodies = BODY_NAMES();
  const accs   = ACC_NAMES();
  if (a.face !== null && a.face !== undefined) {
    if (typeof a.face !== 'string') return 'face must be string or null';
    if (faces.length && !faces.includes(a.face)) return `unknown face: ${a.face}`;
  }
  if (a.body !== null && a.body !== undefined) {
    if (typeof a.body !== 'string') return 'body must be string or null';
    if (bodies.length && !bodies.includes(a.body)) return `unknown body: ${a.body}`;
  }
  if (a.accessories !== undefined && a.accessories !== null) {
    if (typeof a.accessories !== 'object' || Array.isArray(a.accessories)) return 'accessories must be object';
    const { head, upper, feet } = a.accessories;
    for (const [slot, val] of [['head', head], ['upper', upper], ['feet', feet]]) {
      if (val !== null && val !== undefined) {
        if (typeof val !== 'string') return `accessories.${slot} must be string or null`;
        if (accs.length && !accs.includes(val)) return `unknown accessory: ${val}`;
      }
    }
  }
  return null;
}

function loadPresets() {
  try {
    const raw = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
    if (!Array.isArray(raw)) return [];
    const migrated = raw.filter(p => p && p.appearance && !p.outfit);
    if (migrated.length !== raw.length) {
      console.log(`[presets] dropped ${raw.length - migrated.length} legacy preset(s) with old outfit schema`);
      savePresets(migrated);
    }
    return migrated;
  } catch { return []; }
}

function savePresets(presets) {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

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

const dbMod = require('./src/server/db.ts');
dbMod.initDb({ buildStateFromMutations: (room) => buildStateFromMutations(room) });
const pool = dbMod.getPool();
const readState = dbMod.readState;
const persistState = dbMod.persistState;
const schedulePersist = dbMod.schedulePersist;
const flushImmediate = dbMod.flushImmediate;



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

// roomToken -> Set<WebSocket>
const rooms = new Map();

// roomToken -> sessionCode (reverse map for lookups)
const sessionCodeIndex = new Map();  // sessionCode -> roomToken

const CROCKFORD = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, excludes I,L,O,0,1

function generateSessionCode() {
  let attempt = 0;
  while (attempt < 16) {
    let chars = '';
    for (let i = 0; i < 6; i++) {
      chars += CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)];
    }
    const code = chars.slice(0, 3) + '-' + chars.slice(3);
    if (!sessionCodeIndex.has(code)) return code;
    attempt++;
  }
  throw new Error('session-code: 16 collisions in a row — population too dense');
}

function registerSessionCode(code, roomToken) {
  sessionCodeIndex.set(code, roomToken);
}

function resolveSessionCode(code) {
  return sessionCodeIndex.get(code) || null;
}

function rebuildSessionCodeIndexFromStates(rows) {
  for (const row of rows) {
    const code = row.state?.sessionCode;
    if (code) sessionCodeIndex.set(code, row.room_token);
  }
}

function getAdminTokenHolder(room) {
  return figureMaps.get(room)?.get('__admin_token_holder__')?.playerId || null;
}

function assignAdminToken(room, playerId) {
  if (getAdminTokenHolder(room)) return { ok: false, reason: 'already-held' };
  applyMutation(room, { type: 'session_admin_token_set', playerId });
  return { ok: true, holder: playerId };
}

function handoffAdminToken(room, fromPlayerId, toPlayerId) {
  const current = getAdminTokenHolder(room);
  if (current !== fromPlayerId) return { ok: false, reason: 'not-current-holder' };
  applyMutation(room, { type: 'session_admin_token_set', playerId: toPlayerId });
  return { ok: true, from: fromPlayerId, to: toPlayerId };
}

function releaseAdminToken(room) {
  const figs = figureMaps.get(room);
  if (figs) figs.delete('__admin_token_holder__');
}

const GRACE_TIMEOUT_DEFAULT_MS = 30_000;
const tokenGraceTimers = new Map();       // room -> Timeout
const roomAdminPresence = new Map();      // room -> Set<playerId> of admins currently in the room

function setRoomAdminPresence(room, adminIds) {
  roomAdminPresence.set(room, new Set(adminIds));
}

function beginTokenGrace(room, departingPlayerId, opts = {}) {
  const ms = opts.timeoutMs ?? GRACE_TIMEOUT_DEFAULT_MS;
  if (tokenGraceTimers.has(room)) clearTimeout(tokenGraceTimers.get(room));
  const timer = setTimeout(() => {
    tokenGraceTimers.delete(room);
    if (getAdminTokenHolder(room) === departingPlayerId) {
      // Auto-claim if another admin present
      const presentAdmins = [...(roomAdminPresence.get(room) || [])]
        .filter(id => id !== departingPlayerId);
      if (presentAdmins.length > 0) {
        applyMutation(room, { type: 'session_admin_token_set', playerId: presentAdmins[0] });
      } else {
        releaseAdminToken(room);
      }
    }
  }, ms);
  tokenGraceTimers.set(room, timer);
}

function reclaimAdminToken(room, playerId) {
  if (getAdminTokenHolder(room) !== playerId) return { ok: false, reason: 'not-holder' };
  if (tokenGraceTimers.has(room)) {
    clearTimeout(tokenGraceTimers.get(room));
    tokenGraceTimers.delete(room);
  }
  return { ok: true };
}

function handleAdminSessionCreate(room, adminPlayerId) {
  const code = generateSessionCode();
  registerSessionCode(code, room);
  applyMutation(room, { type: 'session_code_set', code });
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  applyMutation(room, { type: 'session_admin_token_set', playerId: adminPlayerId });
  applyMutation(room, { type: 'session_created_at_set', ts: new Date().toISOString() });
  applyMutation(room, { type: 'session_last_activity_set', ts: new Date().toISOString() });
  return { ok: true, code };
}

function handleAdminHandoffMessage(room, fromPlayerId, toPlayerId, broadcastFn) {
  const result = handoffAdminToken(room, fromPlayerId, toPlayerId);
  if (!result.ok) return result;
  broadcastFn({ type: 'admin_token_changed', holderPlayerId: toPlayerId, reason: 'handoff' });
  return result;
}

function handleAdminRoundStop(room, broadcastFn) {
  const result = transitionPhase(room, 'ended');
  if (!result.ok) return result;
  broadcastFn({ type: 'session_phase_change', phase: 'ended', transitionedAt: new Date().toISOString(), reason: 'admin-stop' });
  broadcastFn({ type: 'session_ended', reason: 'admin-stop' });
  return result;
}

function handleAdminRoundPause(room, broadcastFn) {
  const figs = figureMaps.get(room);
  const current = figs?.get('__session_phase__')?.phase;
  const next = current === 'active' ? 'paused' : current === 'paused' ? 'active' : null;
  if (!next) return { ok: false, reason: 'invalid-source-phase' };
  const result = transitionPhase(room, next);
  if (!result.ok) return result;
  broadcastFn({
    type: 'session_phase_change',
    phase: next,
    transitionedAt: new Date().toISOString(),
    reason: next === 'paused' ? 'admin-pause' : 'admin-resume'
  });
  return result;
}

const roomPreviousPlayers = new Map();   // roomToken -> Set<playerId>

function trackPlayerInRoom(room, playerId) {
  if (!playerId) return;
  let set = roomPreviousPlayers.get(room);
  if (!set) {
    set = new Set();
    roomPreviousPlayers.set(room, set);
  }
  set.add(playerId);
}

function wasPreviouslyInRoom(room, playerId) {
  return !!roomPreviousPlayers.get(room)?.has(playerId);
}

function shouldRejectReconnect(room, playerId) {
  const phase = figureMaps.get(room)?.get('__session_phase__')?.phase;
  if (!phase || phase === 'warmup') return { reject: false };
  // active or paused: forbid all incoming connects from non-current sockets
  if (phase === 'active' || phase === 'paused') {
    return {
      reject: true,
      code: 409,
      message: 'Reconnect nicht möglich während aktiver Runde — warte auf Pause oder Ende.',
    };
  }
  if (phase === 'ended') {
    return {
      reject: true,
      code: 410,
      message: 'Session ist beendet.',
    };
  }
  return { reject: false };
}

const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

function touchSessionActivity(room) {
  applyMutation(room, { type: 'session_last_activity_set', ts: new Date().toISOString() });
}

function checkSessionIdle(room) {
  const figs = figureMaps.get(room);
  if (!figs) return { ended: false, reason: 'no-room' };
  const phase = figs.get('__session_phase__')?.phase;
  if (!phase || phase === 'ended' || phase === 'warmup') {
    return { ended: false, reason: 'not-applicable' };
  }
  const lastActivityIso = figs.get('__session_last_activity__')?.ts;
  if (!lastActivityIso) return { ended: false, reason: 'no-activity-marker' };
  const lastActivity = Date.parse(lastActivityIso);
  if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    transitionPhase(room, 'ended');
    return { ended: true, reason: 'idle-timeout', room };
  }
  return { ended: false, reason: 'within-timeout', room };
}

function checkAllSessions() {
  const results = [];
  for (const room of figureMaps.keys()) {
    const r = checkSessionIdle(room);
    r.room = r.room || room;
    results.push(r);
  }
  return results;
}

// roomToken -> NodeJS.Timeout (debounced persistence)
const pending = dbMod.getPending();

const RELAY_TYPES = [
  'add','move','update','delete','clear','optik','stiffness',
  'snapshot','request_state_snapshot',
];

const TRANSIENT_TYPES = new Set([]);



function joinRoom(ws, room) {
  ws._room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
}

function leaveRoom(ws) {
  const room = ws._room;
  if (!room || !rooms.has(room)) return;
  rooms.get(room).delete(ws);
  if (rooms.get(room).size === 0) rooms.delete(room);
  return room;
}

function broadcast(room, msg, exclude) {
  const json = JSON.stringify(msg);
  const peers = rooms.get(room);
  if (!peers) return;
  for (const peer of peers) {
    if (peer !== exclude && peer.readyState === WebSocket.OPEN) peer.send(json);
  }
}

function broadcastInfo(room) {
  const count = rooms.get(room)?.size ?? 0;
  broadcast(room, { type: 'info', count });
}



const DEBOUNCE_MS = 1000;

// Server-side authoritative figure list per room (mirrors connected clients' state).
// Each room holds a Map<id, figure>.
const figureMaps = new Map();   // roomToken -> Map<id, figure>

const figureLocks = new Map(); // roomToken -> Map<figureId, { userId, name, color }>
function ensureFigureLocks(room) {
  if (!figureLocks.has(room)) figureLocks.set(room, new Map());
  return figureLocks.get(room);
}
function acquireFigureLock(room, figureId, owner) {
  const m = ensureFigureLocks(room);
  if (m.has(figureId)) return false;
  m.set(figureId, { userId: owner.userId, name: owner.name, color: owner.color });
  return true;
}
function releaseFigureLock(room, figureId, userId) {
  const m = figureLocks.get(room);
  const cur = m && m.get(figureId);
  if (!cur || cur.userId !== userId) return false;
  m.delete(figureId);
  return true;
}
function releaseLocksForUser(room, userId) {
  const m = figureLocks.get(room);
  if (!m) return;
  for (const [fig, o] of m) if (o.userId === userId) m.delete(fig);
}
function listFigureLocks(room) {
  const m = figureLocks.get(room);
  if (!m) return [];
  return [...m.entries()].map(([figureId, o]) => ({ figureId, ...o }));
}

const PARTICIPANT_PALETTE = ['#4ea1ff', '#3fb950', '#f0a35e', '#c06be0', '#e06b8b', '#6be0d0'];
const roomParticipants = new Map(); // roomToken -> Map<userId, { userId, name, color }>
function addParticipant(room, { userId, name }) {
  if (!userId) return null;
  if (!roomParticipants.has(room)) roomParticipants.set(room, new Map());
  const m = roomParticipants.get(room);
  if (m.has(userId)) { m.get(userId).name = name || m.get(userId).name; return m.get(userId); }
  const color = PARTICIPANT_PALETTE[m.size % PARTICIPANT_PALETTE.length];
  const p = { userId, name: name || userId, color };
  m.set(userId, p);
  return p;
}
function removeParticipant(room, userId) {
  const m = roomParticipants.get(room);
  if (m) m.delete(userId);
}
function listParticipants(room) {
  const m = roomParticipants.get(room);
  return m ? [...m.values()] : [];
}



function ensureFigureMap(room) {
  if (!figureMaps.has(room)) figureMaps.set(room, new Map());
  return figureMaps.get(room);
}

function applyMutation(room, msg) {
  const figs = ensureFigureMap(room);
  switch (msg.type) {
    case 'add': {
      const figData = msg.figure ?? msg.fig;
      if (figData && typeof figData.id === 'string' && figs.size < 200) {
        const newFig = { ...figData };
        if (!newFig.appearance) {
          newFig.appearance = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };
        }
        figs.set(newFig.id, newFig);
      }
      break;
    }
    case 'move':
      if (figs.has(msg.id)) {
        const f = figs.get(msg.id);
        figs.set(msg.id, { ...f, x: msg.x, z: msg.z });
      }
      break;
    case 'update':
      if (figs.has(msg.id) && msg.changes && typeof msg.changes === 'object' && !Array.isArray(msg.changes)) {
        const existing = figs.get(msg.id);
        const { id: _ignoredId, ...safeChanges } = msg.changes;
        if (safeChanges.appearance && existing.appearance && typeof existing.appearance === 'object') {
          safeChanges.appearance = {
            ...existing.appearance,
            ...safeChanges.appearance,
            accessories: {
              ...(existing.appearance.accessories || {}),
              ...(safeChanges.appearance.accessories || {}),
            },
          };
        }
        figs.set(msg.id, { ...existing, ...safeChanges });
      }
      break;
    case 'delete':
      figs.delete(msg.id);
      break;
    case 'clear':
      figs.clear();
      break;
    case 'optik':
      if (msg.settings && typeof msg.settings === 'object') {
        figs.set('__optik__', { id: '__optik__', settings: msg.settings });
      }
      break;
    case 'stiffness':
      if (typeof msg.value === 'number') {
        figs.set('__stiffness__', { id: '__stiffness__', value: msg.value });
      }
      break;
    case 'session_phase_set': {
      figs.set('__session_phase__', { id: '__session_phase__', phase: msg.phase });
      break;
    }
    case 'session_code_set': {
      figs.set('__session_code__', { id: '__session_code__', code: msg.code });
      break;
    }
    case 'session_admin_token_set': {
      figs.set('__admin_token_holder__', { id: '__admin_token_holder__', playerId: msg.playerId });
      break;
    }
    case 'session_created_at_set': {
      figs.set('__session_created_at__', { id: '__session_created_at__', ts: msg.ts });
      break;
    }
    case 'session_last_activity_set': {
      figs.set('__session_last_activity__', { id: '__session_last_activity__', ts: msg.ts });
      break;
    }
    case 'coaching_steps_set': {
      if (Array.isArray(msg.steps) && msg.steps.length &&
          msg.steps.every((s) => typeof s === 'string' && s.length)) {
        const idx = Math.max(0, Math.min((msg.index | 0), msg.steps.length - 1));
        figs.set('__coaching_steps__', { id: '__coaching_steps__', steps: msg.steps.slice(), index: idx });
      }
      break;
    }
  }
}

const TERMINAL_PHASES = new Set(['ended']);
const VALID_PHASES = new Set(['warmup', 'active', 'paused', 'ended']);

function transitionPhase(room, newPhase) {
  if (!VALID_PHASES.has(newPhase)) {
    return { ok: false, reason: 'invalid-phase' };
  }
  const figs = figureMaps.get(room);
  const current = figs?.get('__session_phase__')?.phase || null;
  if (current && TERMINAL_PHASES.has(current)) {
    return { ok: false, reason: 'terminal-phase' };
  }
  applyMutation(room, { type: 'session_phase_set', phase: newPhase });
  return { ok: true, from: current, to: newPhase };
}

function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const SPECIAL = [
    '__optik__', '__stiffness__',
    '__session_phase__', '__session_code__', '__admin_token_holder__',
    '__session_created_at__', '__session_last_activity__',
    '__coaching_steps__',
  ];
  const figures = Array.from(figs.values()).filter(f => !SPECIAL.includes(f.id));
  const optikEntry        = figs.get('__optik__');
  const stiffEntry        = figs.get('__stiffness__');
  const phaseEntry         = figs.get('__session_phase__');
  const codeEntry          = figs.get('__session_code__');
  const adminTokenEntry    = figs.get('__admin_token_holder__');
  const createdAtEntry     = figs.get('__session_created_at__');
  const lastActivityEntry  = figs.get('__session_last_activity__');
  const result = { figures };
  if (optikEntry)    result.optik     = optikEntry.settings;
  if (stiffEntry)    result.stiffness = stiffEntry.value;
  if (phaseEntry)        result.sessionPhase       = phaseEntry.phase;
  if (codeEntry)         result.sessionCode        = codeEntry.code;
  if (adminTokenEntry)   result.adminTokenHolder   = adminTokenEntry.playerId;
  if (createdAtEntry)    result.sessionCreatedAt   = createdAtEntry.ts;
  if (lastActivityEntry) result.sessionLastActivity = lastActivityEntry.ts;
  const coachingStepsEntry = figs.get('__coaching_steps__');
  if (coachingStepsEntry) result.coachingSteps = { steps: coachingStepsEntry.steps, index: coachingStepsEntry.index };
  return result;
}




const handleDisconnect = function(ws) {
  const room = ws._room;
  if (!room) return;
  leaveRoom(ws);
  broadcastInfo(room);
}
wss.on('connection', (ws, req) => {
  sessionMiddleware(req, {}, () => { ws._session = req.session; });
  ws.isAlive = true;
  ws.on('message', async (raw) => {
    try {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (ws._room) touchSessionActivity(ws._room);

      if (msg.type === 'pong') { ws.isAlive = true; return; }



      if (msg.type === 'request_state_snapshot') {
        const room = ws._room;
        if (!room) return;
        const state = buildStateFromMutations(room);
        if (state) {
          ws.send(JSON.stringify({
            type: 'snapshot',
            figures: state.figures,
            optik: state.optik,
            stiffness: state.stiffness ?? 0.65,
            coachingSteps: state.coachingSteps,
            locks: listFigureLocks(room),
            participants: listParticipants(room),
          }));
        }
        // Also send current pickup positions
        const pickups = ensurePickups(room);
        pickups.forEach(p => {
          if (!p.takenBy) {
            try { ws.send(JSON.stringify({ type: 'pickup_spawned', id: p.id, kind: p.kind, pos: p.pos })); } catch {}
          }
        });
        return;
      }

      if (msg.type === 'join' && typeof msg.room === 'string' && msg.room) {
        if (ws._room) leaveRoom(ws);
        joinRoom(ws, msg.room);

        // Hydrate authoritative state from DB on first join in this pod.
        if (!figureMaps.has(msg.room)) {
          const state = await readState(msg.room);
          const figs = ensureFigureMap(msg.room);
          for (const f of state.figures || []) {
            if (f && typeof f.id === 'string') figs.set(f.id, f);
          }
          if (state.optik && typeof state.optik === 'object') {
            figs.set('__optik__', { id: '__optik__', settings: state.optik });
          }

          if (typeof state.sessionPhase === 'string') {
            figs.set('__session_phase__', { id: '__session_phase__', phase: state.sessionPhase });
          }
          if (typeof state.sessionCode === 'string') {
            figs.set('__session_code__', { id: '__session_code__', code: state.sessionCode });
            registerSessionCode(state.sessionCode, msg.room);
          }
          if (typeof state.adminTokenHolder === 'string') {
            figs.set('__admin_token_holder__', { id: '__admin_token_holder__', playerId: state.adminTokenHolder });
          }
          if (typeof state.sessionCreatedAt === 'string') {
            figs.set('__session_created_at__', { id: '__session_created_at__', ts: state.sessionCreatedAt });
          }
          if (typeof state.sessionLastActivity === 'string') {
            figs.set('__session_last_activity__', { id: '__session_last_activity__', ts: state.sessionLastActivity });
          }
          if (state.coachingSteps && Array.isArray(state.coachingSteps.steps)) {
            figs.set('__coaching_steps__', {
              id: '__coaching_steps__',
              steps: state.coachingSteps.steps,
              index: state.coachingSteps.index | 0,
            });
          }
        }

        const state = buildStateFromMutations(msg.room);
        ws.send(JSON.stringify({
          type: 'snapshot',
          figures: state.figures,
          optik: state.optik,
          stiffness: state.stiffness ?? 0.65,
          sessionPhase: state.sessionPhase,
          sessionCode: state.sessionCode,
          adminTokenHolder: state.adminTokenHolder,
          sessionCreatedAt: state.sessionCreatedAt,
          sessionLastActivity: state.sessionLastActivity,
          coachingSteps: state.coachingSteps,
          locks: listFigureLocks(msg.room),
          participants: listParticipants(msg.room),
        }));
        if (ws._session?.userId) {
          const p = addParticipant(msg.room, { userId: ws._session.userId, name: ws._session.name });
          if (p) broadcast(msg.room, { type: 'presence_join', ...p });
        }
        broadcastInfo(msg.room);
        return;
      }

      const room = ws._room;
      if (!room) return;

      // Appearance validation for add / update
      if (msg.type === 'add' && (msg.figure ?? msg.fig)?.appearance) {
        const appErr = validateAppearance((msg.figure ?? msg.fig).appearance);
        if (appErr) {
          try { ws.send(JSON.stringify({ type: 'error', reason: appErr })); } catch {}
          return;
        }
      }
      if (msg.type === 'update' && msg.changes?.appearance) {
        const appErr = validateAppearance(msg.changes.appearance);
        if (appErr) {
          try { ws.send(JSON.stringify({ type: 'error', reason: appErr })); } catch {}
          return;
        }
      }



      if (msg.type === 'figure_lock' && typeof msg.id === 'string') {
        const owner = {
          userId: ws._session?.userId || ws._playerId || 'anon',
          name: ws._session?.name || 'Teilnehmer',
          color: msg.color || '#4ea1ff',
        };
        if (acquireFigureLock(room, msg.id, owner)) {
          broadcast(room, { type: 'figure_locked', id: msg.id, userId: owner.userId, name: owner.name, color: owner.color });
        } else {
          try { ws.send(JSON.stringify({ type: 'figure_lock_denied', id: msg.id })); } catch {}
        }
        return;
      }
      if (msg.type === 'figure_unlock' && typeof msg.id === 'string') {
        const uid = ws._session?.userId || ws._playerId || 'anon';
        if (releaseFigureLock(room, msg.id, uid)) {
          broadcast(room, { type: 'figure_unlocked', id: msg.id });
        }
        return;
      }

      if (RELAY_TYPES.includes(msg.type)) {
        applyMutation(room, msg);
        broadcast(room, msg, ws);
        if (msg.type === 'player_join' && typeof msg.playerId === 'string') {
          ws._playerId = msg.playerId;
          trackPlayerInRoom(room, msg.playerId);
          const alive = lmsAlive.get(room);
          if (alive) alive.add(msg.playerId);
        } else if (msg.type === 'game_mode_change' && typeof msg.mode === 'string') {
          if (msg.mode === 'lms') {
            const alive = new Set();
            for (const [sock] of rooms.get(room) || []) {
              if (sock._playerId) alive.add(sock._playerId);
            }
            lmsAlive.set(room, alive);
          } else {
            lmsAlive.delete(room);
          }
        } else if (msg.type === 'player_death' && typeof msg.playerId === 'string') {
          const state = buildStateFromMutations(room);
          if (state.gameMode === 'lms') {
            const { winner, draw } = handleLmsDeath(room, msg.playerId);
            if (winner !== null || draw) {
              broadcast(room, draw ? { type: 'lms_draw' } : { type: 'lms_winner', playerId: winner });
            }
          } else if (state.gameMode === 'duel') {
            const result = handleDuelDeath(room, msg.playerId);
            if (result.roundWinner) {
              const ds = duelRooms.get(room) || {};
              if (result.matchOver) {
                broadcast(room, {
                  type: 'duel_match_end',
                  winner: result.matchWinner,
                  nameA: ds.nameA, nameB: ds.nameB,
                  heroA: ds.heroA, heroB: ds.heroB,
                  winsA: ds.winsA ?? 0, winsB: ds.winsB ?? 0,
                });
                _armDuelInactivityTimer(room);
              } else {
                broadcast(room, {
                  type: 'duel_round_end',
                  winner: result.roundWinner,
                  nameA: ds.nameA, nameB: ds.nameB,
                  heroA: ds.heroA, heroB: ds.heroB,
                  winsA: ds.winsA ?? 0, winsB: ds.winsB ?? 0,
                });
                setTimeout(() => {
                  const stillThere = duelRooms.get(room);
                  if (!stillThere) return;
                  broadcast(room, {
                    type: 'duel_round_start',
                    round: (stillThere.winsA + stillThere.winsB) + 1,
                    winsA: stillThere.winsA,
                    winsB: stillThere.winsB,
                  });
                }, 3000);
              }
            }
          }
        } else if (msg.type === 'wave_start' && typeof msg.wave === 'number') {
          if (!roomMeta.has(room)) roomMeta.set(room, { coopWave: 0 });
          roomMeta.get(room).coopWave = msg.wave;
        } else if (msg.type === 'clear') {
          flushImmediate(room).catch(err => console.error('[brett] flush:', err));
        }
        if (!TRANSIENT_TYPES.has(msg.type) && msg.type !== 'clear') {
          schedulePersist(room);
        }
      }

      const ADMIN_TYPES = [
        'admin_kick','admin_broadcast',
        'admin_session_create','admin_handoff_token','admin_round_stop','admin_round_pause',
        'admin_coaching_steps_set',
      ];

      if (ADMIN_TYPES.includes(msg.type)) {
        if (!ws._session?.isAdmin) return;
        const adminRoom = ws._room;
        if (!adminRoom) return;

        switch (msg.type) {
          case 'admin_kick': {
            if (typeof msg.playerId !== 'string') return;
            for (const sock of rooms.get(adminRoom) || []) {
              if (sock._playerId === msg.playerId) {
                try { sock.close(); } catch {}
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
            }).catch(err => console.error('[brett] admin_broadcast failed:', err.message));
            break;
          }
          case 'admin_session_create': {
            const playerId = ws._playerId || ws._session?.name;
            if (!playerId) return;
            const result = handleAdminSessionCreate(adminRoom, playerId);
            broadcast(adminRoom, {
              type: 'session_phase_change', phase: 'warmup',
              transitionedAt: new Date().toISOString(), reason: 'admin-create',
            });
            broadcast(adminRoom, {
              type: 'admin_token_changed', holderPlayerId: playerId, reason: 'handoff',
            });
            schedulePersist(adminRoom);
            // Echo session code to creator
            try { ws.send(JSON.stringify({ type: 'session_created', code: result.code })); } catch {}
            break;
          }
          case 'admin_handoff_token': {
            if (typeof msg.targetPlayerId !== 'string') return;
            const fromPlayerId = ws._playerId || ws._session?.name;
            if (!fromPlayerId) return;
            handleAdminHandoffMessage(adminRoom, fromPlayerId, msg.targetPlayerId,
              (out) => broadcast(adminRoom, out));
            schedulePersist(adminRoom);
            break;
          }
          case 'admin_round_stop': {
            handleAdminRoundStop(adminRoom, (m) => broadcast(adminRoom, m));
            schedulePersist(adminRoom);
            break;
          }
          case 'admin_round_pause': {
            handleAdminRoundPause(adminRoom, (m) => broadcast(adminRoom, m));
            schedulePersist(adminRoom);
            break;
          }
          case 'admin_coaching_steps_set': {
            applyMutation(adminRoom, { type: 'coaching_steps_set', steps: msg.steps, index: msg.index });
            broadcast(adminRoom, { type: 'coaching_steps_change', steps: msg.steps, index: msg.index });
            schedulePersist(adminRoom);
            break;
          }
        }
        return;
      }
    } catch (err) {
      console.error('[brett] ws message handler error:', err.message);
    }
  });

// ... inside the ws.on('connection') handler:
  ws.on('close', async () => {
    handleDisconnect(ws);
    const room = ws._room;
    if (!room) return;
    const uid = ws._session?.userId || ws._playerId;
    if (uid) {
      releaseLocksForUser(room, uid);
      broadcast(room, { type: 'locks_released_for', userId: uid });
    }
    if (uid && ws._session?.userId) {
      removeParticipant(room, ws._session.userId);
      broadcast(room, { type: 'presence_leave', userId: ws._session.userId });
    }
    if (rooms.has(room)) {
      broadcastInfo(room);
    } else {
      try {
        await flushImmediate(room);
      } finally {
        if (!rooms.has(room)) figureMaps.delete(room);
      }
    }
  });

  ws.on('error', (err) => console.error('[brett] ws error:', err.message));
});

// ─── WS heartbeat (30s ping / terminate-on-miss) ─────────────────
const HEARTBEAT_INTERVAL_MS = 30_000;
const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch {}
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref?.();

// ─── Idle-timeout backstop check ──────────────────────────────────
if (process.env.MOCK_DB !== 'true') {
  setInterval(() => {
    const results = checkAllSessions();
    for (const r of results) {
      if (r.ended) {
        broadcast(r.room, {
          type: 'session_phase_change',
          phase: 'ended',
          transitionedAt: new Date().toISOString(),
          reason: 'idle-timeout',
        });
        broadcast(r.room, { type: 'session_ended', reason: 'idle-timeout' });
        schedulePersist(r.room);
      }
    }
  }, 60_000);
}

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
