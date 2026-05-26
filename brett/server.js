'use strict';

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');

const skinUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
}).fields([
  { name: 'glb',   maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

// GLB validator — checks magic/version, parses JSON chunk, requires mixamorigHips.
// Returns { ok: true, animations: string[] } | { ok: false, error: string }.
function validateGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    return { ok: false, error: 'buffer too small to be a GLB' };
  }
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    return { ok: false, error: 'bad magic — not a GLB file' };
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    return { ok: false, error: `unsupported GLB version ${version} (need 2)` };
  }
  const jsonLen  = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4E4F534A) {
    return { ok: false, error: 'first chunk is not JSON' };
  }
  if (20 + jsonLen > buffer.length) {
    return { ok: false, error: 'JSON chunk overflows file' };
  }
  let gltf;
  try {
    gltf = JSON.parse(buffer.slice(20, 20 + jsonLen).toString('utf8'));
  } catch (err) {
    return { ok: false, error: 'invalid JSON in GLB: ' + err.message };
  }
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  if (!nodes.some(n => n && n.name === 'mixamorigHips')) {
    return { ok: false, error: 'mixamorigHips bone not found — GLB must be Mixamo-rigged' };
  }
  const animations = (Array.isArray(gltf.animations) ? gltf.animations : [])
    .map(a => (a && typeof a.name === 'string') ? a.name : null)
    .filter(Boolean);
  return { ok: true, animations };
}

const SKINS_DIR_NAME = 'skins';
const SKINS_DIR = path.join(__dirname, 'public', 'assets', SKINS_DIR_NAME);

function listSkins(dir = SKINS_DIR) {
  const out = [{ id: 'default', name: 'Mannequin', thumb: null, animations: [] }];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'default') continue;
    const skinDir = path.join(dir, ent.name);
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(skinDir, 'meta.json'), 'utf8'));
    } catch { continue; }
    if (!meta || typeof meta.id !== 'string' || typeof meta.name !== 'string') continue;
    const hasThumb = fs.existsSync(path.join(skinDir, 'thumb.png'));
    out.push({
      id: meta.id,
      name: meta.name,
      thumb: hasThumb ? `/assets/${SKINS_DIR_NAME}/${ent.name}/thumb.png` : null,
      animations: Array.isArray(meta.animations) ? meta.animations : [],
    });
  }
  return out;
}

function slugifyForSkin(name) {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (cleaned) return cleaned;
  return 'skin-' + randomUUID().replace(/-/g, '').slice(0, 6);
}

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

let oidcClient = null;
async function getOidcClient() {
  if (oidcClient) return oidcClient;
  const kcUrl      = process.env.KEYCLOAK_URL || 'http://keycloak.workspace.svc.cluster.local:8080';
  const kcRealm    = process.env.KEYCLOAK_REALM || 'workspace';
  const clientId   = process.env.BRETT_KC_CLIENT_ID || 'brett-app';
  const clientSecret = process.env.BRETT_OIDC_SECRET || '';
  const issuerUrl  = `${kcUrl}/realms/${kcRealm}`;
  const issuer     = await Issuer.discover(issuerUrl);
  oidcClient = new issuer.Client({ client_id: clientId, client_secret: clientSecret, response_types: ['code'] });
  return oidcClient;
}

function isAdminFromClaims(claims) {
  return Array.isArray(claims?.realm_access?.roles) && claims.realm_access.roles.includes('admin');
}

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!process.env.DATABASE_URL && require.main === module && process.env.MOCK_DB !== 'true') {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

let pool;
if (process.env.MOCK_DB === 'true') {
  class MockPool {
    async query() { return { rows: [] }; }
    async connect() { return { query: this.query, release: () => {} }; }
    async end() {}
    on() {} 
  }
  pool = new MockPool();
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}



const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);
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

function buildConfig(env) {
  const mode = env.BRETT_DEFAULT_MODE === 'mayhem' ? 'mayhem' : 'coaching';
  return {
    defaultMode: mode,
    availableModes: mode === 'mayhem' ? ['coaching', 'mayhem'] : ['coaching'],
  };
}

app.get('/api/config', (_req, res) => res.json(buildConfig(process.env)));

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

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  return res.status(403).json({ error: 'forbidden' });
}

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

// ─── Skins catalog (Mayhem character skins) ──────────────────────────────────
app.get('/api/skins', (_req, res) => {
  res.json(listSkins());
});

app.post('/api/skins/upload', requireAdmin, (req, res) => {
  skinUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file too large (max 20 MB)' });
      return res.status(400).json({ error: 'upload error: ' + err.message });
    }
    const name = String((req.body && req.body.name) || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ error: 'name required (≤100 chars)' });
    const glbFile = req.files?.glb?.[0];
    if (!glbFile) return res.status(400).json({ error: 'glb file required' });
    const thumbFile = req.files?.thumb?.[0] || null;
    if (thumbFile && thumbFile.size > 512 * 1024) {
      return res.status(413).json({ error: 'thumb too large (max 512 KB)' });
    }
    const val = validateGlb(glbFile.buffer);
    if (!val.ok) return res.status(400).json({ error: val.error });

    // Generate a unique id (re-roll if it collides with an existing skin or 'default').
    let id = slugifyForSkin(name);
    let attempt = 0;
    while (id === 'default' || fs.existsSync(path.join(SKINS_DIR, id))) {
      attempt++;
      if (attempt > 16) return res.status(500).json({ error: 'could not allocate skin id' });
      id = slugifyForSkin(name + '-' + attempt);
    }
    const skinDir = path.join(SKINS_DIR, id);
    fs.mkdirSync(skinDir, { recursive: true });
    fs.writeFileSync(path.join(skinDir, 'skin.glb'), glbFile.buffer);
    if (thumbFile) fs.writeFileSync(path.join(skinDir, 'thumb.png'), thumbFile.buffer);
    const meta = { id, name, animations: val.animations, uploadedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify(meta, null, 2));

    res.status(201).json({
      id,
      name,
      thumb: thumbFile ? `/assets/skins/${id}/thumb.png` : null,
      animations: val.animations,
    });
  });
});

app.delete('/api/skins/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) return res.status(400).json({ error: 'invalid id' });
  if (id === 'default') return res.status(400).json({ error: 'cannot delete default skin' });
  const skinDir = path.join(SKINS_DIR, id);
  if (!fs.existsSync(skinDir)) return res.status(404).json({ error: 'skin not found' });
  fs.rmSync(skinDir, { recursive: true, force: true });
  res.status(204).end();
});

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
    const figs        = figureMaps.get(token);
    const mayhemEntry = figs?.get('__mayhem__');
    const modeEntry   = figs?.get('__game_mode__');
    const playerCount = Array.from(rooms.get(token) || []).filter(ws => ws._playerId).length;
    return {
      token,
      name:        nameMap[token] || token,
      playerCount,
      maxPlayers:  4,
      mayhem:      !!mayhemEntry?.enabled,
      gameMode:    modeEntry?.mode || 'warmup',
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

const wss = new WebSocket.Server({ server, path: '/sync', maxPayload: 64 * 1024 });

// roomToken -> Set<WebSocket>
const rooms = new Map();
// roomToken -> NodeJS.Timeout (debounced persistence)
const pending = new Map();

const RELAY_TYPES = [
  'add','move','update','delete','clear','optik','stiffness','jump',
  'mayhem_mode','player_join','player_state','player_leave',
  'hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
  'obstacle_layout','game_mode_change',
  'damage_event','death_event','pickup_request','pickup_taken','pickup_spawned',
  'snapshot','request_state_snapshot',
  'bot_spawn','bot_despawn','round_reset',
  'wave_start','wave_complete','coop_win','coop_lose','coop_wave_sync',
  'hero_select', 'duel_start',
  'hero_stealth', 'hero_teleport', 'minion_spawn', 'minion_update', 'minion_die', 'hero_slow',
  'vehicle_switch', 'vehicle_repair', 'motorcycle_sprint',
];

const TRANSIENT_TYPES = new Set([
  'jump','player_join','player_state','player_leave','hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
  'wave_start','wave_complete','coop_win','coop_lose','coop_wave_sync',
  'hero_select', 'duel_start', 'hero_stealth', 'hero_teleport', 'minion_update', 'hero_slow',
  'vehicle_switch', 'vehicle_repair', 'motorcycle_sprint',
]);

const lmsAlive  = new Map(); // roomToken -> Set<playerId>
const duelRooms = new Map(); // roomToken -> { playerA, playerB, winsA, winsB, bestOf, startedAt }
const rematchRequests = new Map(); // roomToken -> { playerA?: { sameHeroes }, playerB?: { sameHeroes } }
const duelInactivityTimers = new Map(); // roomToken -> NodeJS.Timeout
const roomMeta  = new Map(); // roomToken -> { coopWave: number }

function handleLmsDeath(room, victimId) {
  const alive = lmsAlive.get(room);
  if (!alive) return { winner: null, draw: false };
  alive.delete(victimId);
  if (alive.size === 0) return { winner: null, draw: true };
  if (alive.size === 1) return { winner: [...alive][0], draw: false };
  return { winner: null, draw: false };
}

function handleDuelDeath(room, deadPlayerId) {
  const ds = duelRooms.get(room);
  if (!ds) return { roundWinner: null, matchOver: false, matchWinner: null };
  const isA = deadPlayerId === ds.playerA;
  const roundWinner = isA ? ds.playerB : ds.playerA;
  if (isA) ds.winsB++; else ds.winsA++;
  const winsNeeded = Math.ceil(ds.bestOf / 2);
  const matchOver  = ds.winsA >= winsNeeded || ds.winsB >= winsNeeded;
  const matchWinner = matchOver ? (ds.winsA >= winsNeeded ? ds.playerA : ds.playerB) : null;
  // Cleanup now happens via rematch/abandon/inactivity — not auto-delete here
  return { roundWinner, matchOver, matchWinner };
}

function _armDuelInactivityTimer(room) {
  if (duelInactivityTimers.has(room)) clearTimeout(duelInactivityTimers.get(room));
  duelInactivityTimers.set(room, setTimeout(() => {
    duelInactivityTimers.delete(room);
    duelRooms.delete(room);
    rematchRequests.delete(room);
    broadcast(room, { type: 'duel_abandoned', reason: 'timeout' });
  }, 60_000));
}

function _clearDuelInactivityTimer(room) {
  if (duelInactivityTimers.has(room)) {
    clearTimeout(duelInactivityTimers.get(room));
    duelInactivityTimers.delete(room);
  }
}

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

async function readState(room) {
  const { rows } = await pool.query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room]
  );
  return rows[0]?.state ?? { figures: [] };
}

const DEBOUNCE_MS = 1000;

// Server-side authoritative figure list per room (mirrors connected clients' state).
// Each room holds a Map<id, figure>.
const figureMaps = new Map();   // roomToken -> Map<id, figure>

const pickupState = new Map(); // room -> Map<pickupId, {id, kind, pos, takenBy, respawnAt}>

function ensurePickups(room) {
  if (!pickupState.has(room)) pickupState.set(room, new Map());
  return pickupState.get(room);
}

function spawnPickup(room, id, kind, pos, wss) { // eslint-disable-line no-unused-vars
  const m = ensurePickups(room);
  m.set(id, { id, kind, pos, takenBy: null, respawnAt: null });
  broadcast(room, { type: 'pickup_spawned', id, kind, pos }, null);
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
    case 'jump':
      // transient — no persisted state
      break;
    case 'mayhem_mode':
      if (typeof msg.enabled === 'boolean') {
        figs.set('__mayhem__', { id: '__mayhem__', enabled: msg.enabled });
      }
      break;
    case 'game_mode_change':
      if (typeof msg.mode === 'string') {
        figs.set('__game_mode__', { id: '__game_mode__', mode: msg.mode });
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
    '__optik__', '__stiffness__', '__mayhem__', '__game_mode__',
    '__session_phase__', '__session_code__', '__admin_token_holder__',
    '__session_created_at__', '__session_last_activity__',
  ];
  const figures = Array.from(figs.values()).filter(f => !SPECIAL.includes(f.id));
  const optikEntry        = figs.get('__optik__');
  const stiffEntry        = figs.get('__stiffness__');
  const mayhemEntry   = figs.get('__mayhem__');
  const gameModeEntry = figs.get('__game_mode__');
  const phaseEntry         = figs.get('__session_phase__');
  const codeEntry          = figs.get('__session_code__');
  const adminTokenEntry    = figs.get('__admin_token_holder__');
  const createdAtEntry     = figs.get('__session_created_at__');
  const lastActivityEntry  = figs.get('__session_last_activity__');
  const result = { figures };
  if (optikEntry)    result.optik     = optikEntry.settings;
  if (stiffEntry)    result.stiffness = stiffEntry.value;
  if (mayhemEntry)   result.mayhem    = !!mayhemEntry.enabled;
  if (gameModeEntry) result.gameMode  = gameModeEntry.mode;
  if (phaseEntry)        result.sessionPhase       = phaseEntry.phase;
  if (codeEntry)         result.sessionCode        = codeEntry.code;
  if (adminTokenEntry)   result.adminTokenHolder   = adminTokenEntry.playerId;
  if (createdAtEntry)    result.sessionCreatedAt   = createdAtEntry.ts;
  if (lastActivityEntry) result.sessionLastActivity = lastActivityEntry.ts;
  return result;
}


async function persistState(room) {
  const state = buildStateFromMutations(room);
  if (!state) return;
  await pool.query(
    `INSERT INTO brett_rooms (room_token, state, last_modified_at)
         VALUES ($1, $2, now())
     ON CONFLICT (room_token)
     DO UPDATE SET state = EXCLUDED.state, last_modified_at = EXCLUDED.last_modified_at`,
    [room, state]
  );
}

function schedulePersist(room) {
  if (pending.has(room)) clearTimeout(pending.get(room));
  pending.set(room, setTimeout(() => {
    pending.delete(room);
    persistState(room).catch(err => console.error('[brett] persist:', err));
  }, DEBOUNCE_MS));
}

async function flushImmediate(room) {
  if (pending.has(room)) {
    clearTimeout(pending.get(room));
    pending.delete(room);
  }
  await persistState(room);
}

const handleDisconnect = function(ws, broadcastFn = broadcast) {
  const room = ws._room;
  if (!room) return;
  if (ws._playerId) {
    broadcastFn(room, { type: "player_leave", playerId: ws._playerId }, ws);
  }
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

      if (msg.type === 'pong') { ws.isAlive = true; return; }

      if (msg.type === 'damage_event') {
        broadcast(ws._room, msg, ws);
        return;
      }
      if (msg.type === 'death_event') {
        broadcast(ws._room, msg, ws);
        return;
      }
      if (msg.type === 'pickup_request') {
        const pickups = ensurePickups(ws._room);
        const p = pickups.get(msg.id);
        if (!p || p.takenBy) return;
        p.takenBy = ws._playerId ?? 'unknown';
        p.respawnAt = Date.now() + (msg.respawnMs || 30_000);
        broadcast(ws._room, { type: 'pickup_taken', id: msg.id, by: p.takenBy });
        setTimeout(() => {
          p.takenBy = null;
          p.respawnAt = null;
          broadcast(ws._room, { type: 'pickup_spawned', id: p.id, kind: p.kind, pos: p.pos });
        }, msg.respawnMs || 30_000);
        return;
      }

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
            mayhem: state.mayhem ?? true,
            gameMode: state.gameMode,
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
          if (typeof state.mayhem === 'boolean') {
            figs.set('__mayhem__', { id: '__mayhem__', enabled: state.mayhem });
          }
          if (typeof state.gameMode === 'string') {
            figs.set('__game_mode__', { id: '__game_mode__', mode: state.gameMode });
          }
        }

        const state = buildStateFromMutations(msg.room);
        ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures, optik: state.optik, stiffness: state.stiffness ?? 0.65, mayhem: state.mayhem ?? true, gameMode: state.gameMode }));
        // Sync co-op wave state to the newly joined client
        const meta = roomMeta.get(msg.room);
        if (meta && meta.coopWave > 0) {
          try { ws.send(JSON.stringify({ type: 'coop_wave_sync', wave: meta.coopWave })); } catch {}
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

      if (msg.type === 'duel_start' && msg.playerA && msg.playerB) {
        duelRooms.set(room, {
          playerA: msg.playerA, playerB: msg.playerB,
          heroA: msg.heroA, heroB: msg.heroB,
          nameA: msg.nameA || msg.playerA,
          nameB: msg.nameB || msg.playerB,
          winsA: 0, winsB: 0, bestOf: 3,
          startedAt: Date.now(),
        });
        _clearDuelInactivityTimer(room);
        rematchRequests.delete(room);
      }

      if (msg.type === 'rematch_request') {
        const ds = duelRooms.get(room);
        if (!room || !ds || typeof msg.sameHeroes !== 'boolean') return;
        const slot = ws._playerId === ds.playerA ? 'playerA'
                   : ws._playerId === ds.playerB ? 'playerB' : null;
        if (!slot) return;
        if (!rematchRequests.has(room)) rematchRequests.set(room, {});
        const reqs = rematchRequests.get(room);
        reqs[slot] = { sameHeroes: msg.sameHeroes };
        if (reqs.playerA && reqs.playerB) {
          const bothSame = reqs.playerA.sameHeroes && reqs.playerB.sameHeroes;
          const mode = bothSame ? 'same' : 'select';
          _clearDuelInactivityTimer(room);
          ds.winsA = 0;
          ds.winsB = 0;
          rematchRequests.delete(room);
          broadcast(room, { type: 'duel_reset', mode });
          if (mode === 'select') _armDuelInactivityTimer(room);
        } else {
          broadcast(room, { type: 'rematch_state', requested: Object.keys(reqs) });
        }
        return;
      }

      if (msg.type === 'duel_abandoned_request') {
        const ds = duelRooms.get(room);
        if (!room || !ds) return;
        const isFighter = ws._playerId === ds.playerA || ws._playerId === ds.playerB;
        if (!isFighter) return;
        _clearDuelInactivityTimer(room);
        duelRooms.delete(room);
        rematchRequests.delete(room);
        broadcast(room, { type: 'duel_abandoned', reason: 'fighter_request' });
        return;
      }

      if (RELAY_TYPES.includes(msg.type)) {
        applyMutation(room, msg);
        broadcast(room, msg, ws);
        if (msg.type === 'player_join' && typeof msg.playerId === 'string') {
          ws._playerId = msg.playerId;
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
        'admin_mayhem_toggle','admin_mode_set','admin_kick',
        'admin_bot_spawn','admin_bot_despawn','admin_round_reset','admin_broadcast',
      ];

      if (ADMIN_TYPES.includes(msg.type)) {
        if (!ws._session?.isAdmin) return;
        const adminRoom = ws._room;
        if (!adminRoom) return;

        switch (msg.type) {
          case 'admin_mayhem_toggle': {
            const inner = { type: 'mayhem_mode', enabled: !!msg.enabled };
            applyMutation(adminRoom, inner);
            broadcast(adminRoom, inner);
            schedulePersist(adminRoom);
            break;
          }
          case 'admin_mode_set': {
            if (!['warmup','deathmatch','lms','coop','duel'].includes(msg.mode)) return;
            const inner = { type: 'game_mode_change', mode: msg.mode };
            applyMutation(adminRoom, inner);
            broadcast(adminRoom, inner);
            if (msg.mode === 'lms') {
              const alive = new Set();
              for (const sock of rooms.get(adminRoom) || []) { if (sock._playerId) alive.add(sock._playerId); }
              lmsAlive.set(adminRoom, alive);
            } else {
              lmsAlive.delete(adminRoom);
            }
            schedulePersist(adminRoom);
            break;
          }
          case 'admin_kick': {
            if (typeof msg.playerId !== 'string') return;
            for (const sock of rooms.get(adminRoom) || []) {
              if (sock._playerId === msg.playerId) {
                broadcast(adminRoom, { type: 'player_leave', playerId: msg.playerId }, sock);
                try { sock.close(); } catch {}
                break;
              }
            }
            break;
          }
          case 'admin_bot_spawn': {
            const currentCount = rooms.get(adminRoom)?.size ?? 0;
            if (currentCount >= 4) {
              try { ws.send(JSON.stringify({ type: 'admin_error', reason: 'room_full' })); } catch {}
              break;
            }
            broadcast(adminRoom, { type: 'bot_spawn' });
            break;
          }
          case 'admin_bot_despawn': {
            if (typeof msg.botId !== 'string') return;
            const figs = figureMaps.get(adminRoom);
            if (figs) figs.delete(msg.botId);
            broadcast(adminRoom, { type: 'bot_despawn', botId: msg.botId });
            schedulePersist(adminRoom);
            break;
          }
          case 'admin_round_reset': {
            lmsAlive.delete(adminRoom);
            broadcast(adminRoom, { type: 'round_reset' });
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
  RELAY_TYPES, TRANSIENT_TYPES, lmsAlive, handleLmsDeath,
  duelRooms, handleDuelDeath,
  pickupState, ensurePickups, spawnPickup,
  isAdminFromClaims,
  validateAppearance,
  validateGlb,
  SKINS_DIR,
  listSkins,
  slugifyForSkin,
  buildConfig,
  transitionPhase,
};
