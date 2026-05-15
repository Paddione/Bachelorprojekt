'use strict';

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PRESETS_FILE = path.join(__dirname, 'presets.json');

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
  if (faces.length && a.face !== undefined && !faces.includes(a.face)) return `unknown face: ${a.face}`;
  if (bodies.length && a.bodyPreset !== undefined && !bodies.includes(a.bodyPreset)) return `unknown bodyPreset: ${a.bodyPreset}`;
  if (a.accessories !== undefined && !Array.isArray(a.accessories)) return 'accessories must be array';
  if (Array.isArray(a.accessories)) {
    for (const acc of a.accessories) {
      if (accs.length && !accs.includes(acc)) return `unknown accessory: ${acc}`;
    }
  }
  if (a.proportions !== undefined && (typeof a.proportions !== 'object' || a.proportions === null)) {
    return 'proportions must be object';
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

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!process.env.DATABASE_URL && require.main === module) {
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
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
    }
  }
}));

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

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
];

const TRANSIENT_TYPES = new Set([
  'jump','player_join','player_state','player_leave','hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
]);

const lmsAlive = new Map(); // roomToken -> Set<playerId>

function handleLmsDeath(room, victimId) {
  const alive = lmsAlive.get(room);
  if (!alive) return { winner: null, draw: false };
  alive.delete(victimId);
  if (alive.size === 0) return { winner: null, draw: true };
  if (alive.size === 1) return { winner: [...alive][0], draw: false };
  return { winner: null, draw: false };
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

function ensureFigureMap(room) {
  if (!figureMaps.has(room)) figureMaps.set(room, new Map());
  return figureMaps.get(room);
}

function applyMutation(room, msg) {
  const figs = ensureFigureMap(room);
  switch (msg.type) {
    case 'add':
      if (msg.fig && typeof msg.fig.id === 'string' && figs.size < 200) {
        figs.set(msg.fig.id, msg.fig);
      }
      break;
    case 'move':
      if (figs.has(msg.id)) {
        const f = figs.get(msg.id);
        figs.set(msg.id, { ...f, x: msg.x, z: msg.z });
      }
      break;
    case 'update':
      if (figs.has(msg.id) && msg.changes && typeof msg.changes === 'object' && !Array.isArray(msg.changes)) {
        const { id: _ignoredId, ...safeChanges } = msg.changes;
        figs.set(msg.id, { ...figs.get(msg.id), ...safeChanges });
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
  }
}

function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const SPECIAL = ['__optik__', '__stiffness__', '__mayhem__', '__game_mode__'];
  const figures = Array.from(figs.values()).filter(f => !SPECIAL.includes(f.id));
  const optikEntry    = figs.get('__optik__');
  const stiffEntry    = figs.get('__stiffness__');
  const mayhemEntry   = figs.get('__mayhem__');
  const gameModeEntry = figs.get('__game_mode__');
  const result = { figures };
  if (optikEntry)    result.optik     = optikEntry.settings;
  if (stiffEntry)    result.stiffness = stiffEntry.value;
  if (mayhemEntry)   result.mayhem    = !!mayhemEntry.enabled;
  if (gameModeEntry) result.gameMode  = gameModeEntry.mode;
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
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    try {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

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
        }

        const state = buildStateFromMutations(msg.room);
        ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures, optik: state.optik, stiffness: state.stiffness ?? 0.65 }));
        broadcastInfo(msg.room);
        return;
      }

      const room = ws._room;
      if (!room) return;

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
          const { winner, draw } = handleLmsDeath(room, msg.playerId);
          if (winner !== null || draw) {
            broadcast(room, draw ? { type: 'lms_draw' } : { type: 'lms_winner', playerId: winner });
          }
        } else if (msg.type === 'clear') {
          flushImmediate(room).catch(err => console.error('[brett] flush:', err));
        }
        if (!TRANSIENT_TYPES.has(msg.type) && msg.type !== 'clear') {
          schedulePersist(room);
        }
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
};
