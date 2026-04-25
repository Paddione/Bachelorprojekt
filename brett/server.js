'use strict';

const express = require('express');
const { Pool } = require('pg');

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public', { maxAge: '5m' }));

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

// Generic error handler so we never leak stack traces.
app.use((err, _req, res, _next) => {
  console.error('[brett] error:', err);
  res.status(500).json({ error: 'internal_error' });
});

const server = app.listen(PORT, () => {
  console.log(`brett listening on :${PORT}`);
});

// ─── WebSocket sync ──────────────────────────────────────────────
const WebSocket = require('ws');

const wss = new WebSocket.Server({ server, path: '/sync', maxPayload: 64 * 1024 });

// roomToken -> Set<WebSocket>
const rooms = new Map();
// roomToken -> NodeJS.Timeout (debounced persistence)
const pending = new Map();

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
  }
}

function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  return { figures: Array.from(figs.values()) };
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
        }

        const state = buildStateFromMutations(msg.room);
        ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures }));
        broadcastInfo(msg.room);
        return;
      }

      const room = ws._room;
      if (!room) return;

      if (['add','move','update','delete','clear'].includes(msg.type)) {
        applyMutation(room, msg);
        broadcast(room, msg, ws);
        if (msg.type === 'clear') {
          flushImmediate(room).catch(err => console.error('[brett] flush:', err));
        } else {
          schedulePersist(room);
        }
      }
    } catch (err) {
      console.error('[brett] ws message handler error:', err.message);
    }
  });

  ws.on('close', async () => {
    const room = leaveRoom(ws);
    if (!room) return;
    if (rooms.has(room)) {
      broadcastInfo(room);
    } else {
      // Last client gone: flush any pending state and free the figure map,
      // but only if no new client joined the room during the flush.
      try {
        await flushImmediate(room);
      } finally {
        if (!rooms.has(room)) figureMaps.delete(room);
      }
    }
  });

  ws.on('error', (err) => console.error('[brett] ws error:', err.message));
});

module.exports = { app, server, pool, wss };
