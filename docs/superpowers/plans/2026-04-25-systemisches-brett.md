---
title: Systemisches Brett Implementation Plan
domains: [website, infra]
status: completed
pr_number: null
---

# Systemisches Brett Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Talk-callable 3D systemic-board (Gerald's Three.js HTML), persisted in shared-postgres, with realtime sync between meeting participants and a `/brett` slash command + auto-posted link on Talk-roomed meeting creation.

**Architecture:** One new Node.js pod (`brett`) serves the static HTML, REST snapshot/customer API, and a WebSocket sync endpoint from one origin. Persistence is two new tables in the existing `website` postgres database. Talk integration lives in the existing website backend: a webhook for the `/brett` slash command and a one-time post into the conversation when a Talk-roomed meeting is created.

**Tech Stack:** Node.js 20 (express + ws + pg), Three.js r128 (vendored), Astro APIRoute (existing website), Kustomize, SealedSecrets, Nextcloud Talk Bots API, postgres 16.

**Source spec:** `docs/superpowers/specs/2026-04-25-systemisches-brett-design.md`

**Branch:** `feature/systemisches-brett` (already created and the spec is committed there).

---

## Context an implementer needs before starting

This codebase has gotchas the spec assumes you know. Read these once:

1. **`scripts/env-resolve.sh` must be sourced, never executed.** It uses `return 1 2>/dev/null || exit 1`, so executing exits the parent shell.
2. **`envsubst` variable lists are hardcoded per Taskfile task.** When you add a `${VAR}` reference, also add it to the `envsubst "\$VAR1 …"` list in every task that builds that manifest.
3. **`prod/` is a base; never apply directly.** Apply `prod-mentolder/` or `prod-korczewski/`. The base contains a `$patch: delete` on the dev `workspace-secrets` Secret — needed so SealedSecrets-managed secrets survive each deploy. Do not "fix" this.
4. **CI runs `yamllint` with a 200-char line limit.** Long base64/multiline patches that are fine locally fail the `lint-yaml` job.
5. **Docs ConfigMap is not auto-synced by ArgoCD.** After changing `docs-site/`, run `kubectl rollout restart deploy/docs -n workspace --context <env>`.
6. **`ENV=` is always explicit for env-sensitive tasks.** Default is `dev`; cluster-context check only runs when `ENV != dev`. Always pass `ENV=mentolder` or `ENV=korczewski` for prod work.
7. **All changes via PR.** No direct pushes to `main`. Squash-and-merge.
8. **Working branch:** `feature/systemisches-brett`. The spec is already committed at commit `36bdd71`. Stay on this branch.

## Plan-time spec refinement

The spec §7.2 said the auto-post fires when `meetings.status → 'active'`. Reading the code shows the existing state machine goes `'scheduled' → 'ended' → 'transcribed' → 'finalized'` and skips `'active'` entirely. The natural call site is `website/src/pages/api/admin/inbox/[id]/action.ts` immediately after `createMeeting` returns when `talkRoomToken` is set. The auto-post fires at meeting **creation** (with a Talk room), not at active-transition. Idempotency via `meetings.brett_link_posted_at` still works.

---

## Phase 1 — Database schema

### Task 1: Add brett tables and column to website-schema.yaml

**Files:**
- Modify: `k3d/website-schema.yaml` (both `init-meetings-schema.sh` and `ensure-meetings-schema.sh`)

The two scripts must stay in sync — `init` runs once on a fresh DB volume, `ensure` runs on every postStart. Append the same SQL block to both.

- [ ] **Step 1: Add brett SQL to `init-meetings-schema.sh`**

Append the following inside the `psql ... <<-'EOSQL' ... EOSQL` block of `init-meetings-schema.sh`, right before the final `GRANT ALL ON ALL TABLES ...` block:

```sql
      -- ── Systemisches Brett ──────────────────────────────────────────

      -- Layer 1: live state per Talk room. Overwritten as figures move.
      CREATE TABLE IF NOT EXISTS brett_rooms (
          room_token       TEXT PRIMARY KEY,
          state            JSONB NOT NULL DEFAULT '{"figures":[]}'::jsonb,
          last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Layer 2: manual snapshots. Immutable, named, optionally linked to a customer.
      CREATE TABLE IF NOT EXISTS brett_snapshots (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          room_token  TEXT,
          customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
          name        TEXT NOT NULL,
          state       JSONB NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_brett_snapshots_customer
          ON brett_snapshots(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_brett_snapshots_room
          ON brett_snapshots(room_token, created_at DESC);

      -- Idempotency for auto-post on Talk-roomed meeting creation.
      ALTER TABLE meetings
          ADD COLUMN IF NOT EXISTS brett_link_posted_at TIMESTAMPTZ;
```

- [ ] **Step 2: Add the same block to `ensure-meetings-schema.sh`**

Same SQL, appended to the `psql ... <<-'EOSQL' ... EOSQL` block of `ensure-meetings-schema.sh`, again right before the trailing `GRANT ALL ON ALL TABLES ...` and ownership-loop blocks.

- [ ] **Step 3: Validate the YAML and the SQL embedded in it**

Run:
```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' k3d/website-schema.yaml
```
Expected: no errors. The 200-char limit matches CI.

- [ ] **Step 4: Apply the new schema to the running dev DB**

The shared-db's postStart already runs `ensure-meetings-schema.sh` from a ConfigMap mount, but the ConfigMap content has just changed and the pod won't pick it up until restart. Apply the ConfigMap and restart shared-db:

```bash
kubectl apply -f k3d/website-schema.yaml -n workspace --context k3d-dev
kubectl rollout restart deploy/shared-db -n workspace --context k3d-dev
kubectl rollout status  deploy/shared-db -n workspace --context k3d-dev
```

- [ ] **Step 5: Verify the tables and column exist**

```bash
kubectl exec -n workspace deploy/shared-db --context k3d-dev -- \
  psql -U website -d website -c "\d brett_rooms" -c "\d brett_snapshots" -c "\d meetings"
```
Expected: `brett_rooms` and `brett_snapshots` shown with the listed columns; `meetings` shows a `brett_link_posted_at` column.

- [ ] **Step 6: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(brett): add brett_rooms, brett_snapshots tables + meetings.brett_link_posted_at"
```

---

## Phase 2 — Brett pod source

### Task 2: Create the `brett/` directory skeleton

**Files:**
- Create: `brett/Dockerfile`
- Create: `brett/package.json`
- Create: `brett/.dockerignore`
- Create: `brett/README.md`

- [ ] **Step 1: Create `brett/package.json`**

```json
{
  "name": "workspace-brett",
  "version": "0.1.0",
  "private": true,
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "pg": "^8.13.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Generate the lockfile**

```bash
cd brett && npm install --package-lock-only && cd ..
git add brett/package.json brett/package-lock.json
```

- [ ] **Step 3: Create `brett/.dockerignore`**

```
node_modules
.git
README.md
```

- [ ] **Step 4: Create `brett/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 5: Create `brett/README.md`**

```markdown
# Systemisches Brett

3D systemic-constellation board served from a single Node.js pod. Static HTML + WebSocket sync + REST snapshots, all on port 3000.

See `docs/superpowers/specs/2026-04-25-systemisches-brett-design.md` for the design.

## Local dev

\`\`\`bash
docker build -t workspace-brett:latest .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgres://website:devwebsitepassword@host.docker.internal:5432/website?sslmode=disable' \
  workspace-brett:latest
\`\`\`
```

(Use real triple-backticks in the file; the escaped backticks above are only because this plan is a markdown document quoting markdown.)

- [ ] **Step 6: Commit**

```bash
git add brett/
git commit -m "feat(brett): initial pod skeleton (Dockerfile, package.json, README)"
```

---

### Task 3: server.js — DB + REST routes

**Files:**
- Create: `brett/server.js`

A single file. We build it bottom-up: DB pool → REST routes → WebSocket layer (next task) → graceful shutdown (next task).

- [ ] **Step 1: Write `brett/server.js` with DB pool and REST routes**

```js
'use strict';

const express = require('express');
const { Pool } = require('pg');

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public', { maxAge: '5m' }));

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

// Live state for a room.
app.get('/api/state', async (req, res) => {
  const room = String(req.query.room || '');
  if (!room) return res.status(400).json({ error: 'room required' });
  const { rows } = await pool.query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room]
  );
  res.json(rows[0]?.state ?? { figures: [] });
});

// Customer dropdown source.
app.get('/api/customers', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name FROM customers ORDER BY name ASC'
  );
  res.json(rows);
});

// List snapshots, optionally filtered.
app.get('/api/snapshots', async (req, res) => {
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
});

// Load one snapshot.
app.get('/api/snapshots/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, state, customer_id, room_token, created_at
       FROM brett_snapshots WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

// Create a snapshot.
app.post('/api/snapshots', async (req, res) => {
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
});

// Generic error handler so we never leak stack traces.
app.use((err, _req, res, _next) => {
  console.error('[brett] error:', err);
  res.status(500).json({ error: 'internal_error' });
});

const server = app.listen(PORT, () => {
  console.log(`brett listening on :${PORT}`);
});

module.exports = { app, server, pool };
```

- [ ] **Step 2: Smoke-test it against the running shared-db**

Port-forward shared-db so the local Node process can reach it:

```bash
kubectl port-forward -n workspace --context k3d-dev svc/shared-db 5432:5432 &
PF_PID=$!
```

Get the dev `WEBSITE_DB_PASSWORD`:
```bash
WEBSITE_DB_PASSWORD=$(kubectl get secret -n workspace --context k3d-dev workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
```

Run server:
```bash
cd brett && npm install
DATABASE_URL="postgres://website:${WEBSITE_DB_PASSWORD}@127.0.0.1:5432/website?sslmode=disable" \
  PORT=3001 \
  node server.js &
SRV_PID=$!
sleep 1
```

Verify routes:
```bash
curl -s http://127.0.0.1:3001/healthz
# Expected: ok

curl -s 'http://127.0.0.1:3001/api/state?room=test'
# Expected: {"figures":[]}

curl -s http://127.0.0.1:3001/api/customers | head -c 200
# Expected: [...] (the existing customers in dev, or [])

curl -s -X POST http://127.0.0.1:3001/api/snapshots \
  -H 'content-type: application/json' \
  -d '{"room_token":"test","name":"smoke","state":{"figures":[]}}'
# Expected: {"id":"<uuid>"}
```

Tear down:
```bash
kill $SRV_PID $PF_PID 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): server.js HTTP routes (state, customers, snapshots CRUD)"
```

---

### Task 4: server.js — WebSocket join + broadcast

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Append WebSocket layer at the bottom of `brett/server.js`**

Insert this **before** the final `module.exports = ...` line. Replace the existing `module.exports` line accordingly so the WS server is exported too.

```js
// ─── WebSocket sync ──────────────────────────────────────────────
const WebSocket = require('ws');

const wss = new WebSocket.Server({ server, path: '/sync' });

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

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join' && typeof msg.room === 'string' && msg.room) {
      if (ws._room) leaveRoom(ws);
      joinRoom(ws, msg.room);
      const state = await readState(msg.room);
      ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures || [] }));
      broadcastInfo(msg.room);
      return;
    }

    const room = ws._room;
    if (!room) return;                     // ignore mutations before join

    // Re-broadcast valid mutation types only.
    if (['add','move','update','delete','clear'].includes(msg.type)) {
      broadcast(room, msg, ws);
      // Persistence is wired in the next task.
    }
  });

  ws.on('close', () => {
    const room = leaveRoom(ws);
    if (room && rooms.has(room)) broadcastInfo(room);
  });

  ws.on('error', (err) => console.error('[brett] ws error:', err.message));
});

module.exports = { app, server, pool, wss };
```

(Remove the previous `module.exports` line you added in Task 3 — only one export at the bottom.)

- [ ] **Step 2: Smoke-test the WS upgrade**

```bash
# In one terminal
kubectl port-forward -n workspace --context k3d-dev svc/shared-db 5432:5432 &
WEBSITE_DB_PASSWORD=$(kubectl get secret -n workspace --context k3d-dev workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
DATABASE_URL="postgres://website:${WEBSITE_DB_PASSWORD}@127.0.0.1:5432/website?sslmode=disable" \
  PORT=3001 node brett/server.js &

# In another terminal
node -e '
const WS = require("ws");
const ws = new WS("ws://127.0.0.1:3001/sync");
ws.on("open", () => {
  ws.send(JSON.stringify({type:"join", room:"test"}));
});
ws.on("message", (m) => { console.log("recv:", m.toString()); process.exit(0); });
'
# Expected: recv: {"type":"snapshot","figures":[]}
```

- [ ] **Step 3: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): WebSocket join + broadcast + per-room state"
```

---

### Task 5: server.js — debounced persistence + immediate clear

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Add persistence helpers**

Inside `brett/server.js`, just **above** the `wss.on('connection', ...)` handler, add:

```js
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
      if (msg.fig && typeof msg.fig.id === 'string') figs.set(msg.fig.id, msg.fig);
      break;
    case 'move':
      if (figs.has(msg.id)) {
        const f = figs.get(msg.id);
        figs.set(msg.id, { ...f, x: msg.x, z: msg.z });
      }
      break;
    case 'update':
      if (figs.has(msg.id) && msg.changes && typeof msg.changes === 'object') {
        figs.set(msg.id, { ...figs.get(msg.id), ...msg.changes });
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
```

- [ ] **Step 2: Hydrate the figure map on `join` and wire mutations**

Replace the existing `wss.on('connection', ...)` handler with this version:

```js
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
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
  });

  ws.on('close', async () => {
    const room = leaveRoom(ws);
    if (!room) return;
    if (rooms.has(room)) {
      broadcastInfo(room);
    } else {
      // Last client gone: flush any pending state and free the figure map.
      try { await flushImmediate(room); } finally { figureMaps.delete(room); }
    }
  });

  ws.on('error', (err) => console.error('[brett] ws error:', err.message));
});
```

- [ ] **Step 3: Smoke-test the round-trip**

```bash
# server running from previous task
node -e '
const WS = require("ws");
const ws = new WS("ws://127.0.0.1:3001/sync");
ws.on("open", () => {
  ws.send(JSON.stringify({type:"join", room:"persist-test"}));
  setTimeout(() => {
    ws.send(JSON.stringify({type:"add", fig:{id:"a",type:"pawn",color:"#fff",label:"x",scale:1,rotY:0,x:1,z:2}}));
  }, 100);
  setTimeout(() => ws.close(), 1500);    // > debounce
});
ws.on("message", (m) => console.log("recv:", m.toString()));
ws.on("close", () => process.exit(0));
'
```

Verify the row landed:
```bash
kubectl exec -n workspace deploy/shared-db --context k3d-dev -- \
  psql -U website -d website -c \
  "SELECT room_token, jsonb_array_length(state->'figures') AS n FROM brett_rooms WHERE room_token='persist-test';"
# Expected: persist-test | 1
```

- [ ] **Step 4: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): debounced postgres persistence + clear-immediate"
```

---

### Task 6: server.js — graceful shutdown

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Add SIGTERM handler at the bottom of the file**

Add this just **before** the final `module.exports = ...` line:

```js
async function shutdown(signal) {
  console.log(`[brett] ${signal} received, flushing...`);
  for (const room of pending.keys()) {
    try { await flushImmediate(room); } catch (err) { console.error('[brett] shutdown flush:', err); }
  }
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 25_000).unref();   // safety net under 30s grace
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

- [ ] **Step 2: Smoke-test by killing the server cleanly**

```bash
# server running
kill -TERM $(pgrep -f "node brett/server.js")
# Expected log:  [brett] SIGTERM received, flushing...
```

- [ ] **Step 3: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): graceful shutdown flushes pending writes"
```

---

### Task 7: public/index.html — vendor Three.js + config block + figure IDs

**Files:**
- Create: `brett/public/index.html` (copy of Gerald's `systemisches-brett.html`)
- Create: `brett/public/three.min.js` (vendored r128)

- [ ] **Step 1: Copy Gerald's HTML into the repo**

```bash
mkdir -p brett/public
cp "/mnt/c/Users/PatrickKorczewski/OneDrive - Core-IT/Desktop/systemisches-brett/systemisches-brett.html" \
   brett/public/index.html
```

- [ ] **Step 2: Vendor Three.js r128**

```bash
curl -fsSL https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js \
  -o brett/public/three.min.js
ls -la brett/public/three.min.js
# Expected: ~600 KB file
```

- [ ] **Step 3: Replace the cdnjs script tag in `brett/public/index.html`**

Find:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

Replace with:
```html
<script src="/three.min.js"></script>
```

- [ ] **Step 4: Add the config block at the top of the IIFE in `brett/public/index.html`**

Find:
```js
(function(){

const container = document.getElementById('canvas-container');
```

Replace with:
```js
(function(){

// ─── Cluster integration config ──────────────────────────────────
const params   = new URLSearchParams(window.location.search);
const ROOM     = params.get('room') || 'standalone';
const API      = '/api';
const SYNC_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://')
               + location.host + '/sync';

const container = document.getElementById('canvas-container');
```

- [ ] **Step 5: Modify `addFigure()` to accept and persist a stable `id`**

Find:
```js
function addFigure(type, color, x, z, label, scale, rotY) {
  const mesh = buildFigure(type, color);
  mesh.position.set(x, 0, z);
  mesh.scale.setScalar(scale || 1.0);
  mesh.rotation.y = rotY || 0;
  scene.add(mesh);

  const fig = { type, color, mesh, label: label||'', sprite: null, scale: scale||1.0, rotY: rotY||0 };
  if (fig.label) { attachLabel(fig); }
  figures.push(fig);
  return fig;
}
```

Replace with:
```js
function addFigure(type, color, x, z, label, scale, rotY, id) {
  const mesh = buildFigure(type, color);
  mesh.position.set(x, 0, z);
  mesh.scale.setScalar(scale || 1.0);
  mesh.rotation.y = rotY || 0;
  scene.add(mesh);

  const fig = { type, color, mesh, label: label||'', sprite: null, scale: scale||1.0, rotY: rotY||0 };
  fig.id = id || `fig_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  if (fig.label) { attachLabel(fig); }
  figures.push(fig);
  return fig;
}
```

Also add a helper at the top of the IIFE (right after the config block):
```js
function findFigById(id) {
  return figures.find(f => f.id === id) || null;
}
function figToJSON(fig) {
  return {
    id:    fig.id,
    type:  fig.type,
    color: fig.color,
    label: fig.label || '',
    scale: fig.scale,
    rotY:  fig.rotY,
    x:     fig.mesh.position.x,
    z:     fig.mesh.position.z,
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html brett/public/three.min.js
git commit -m "feat(brett): vendor three.js, add config block and figure IDs"
```

---

### Task 8: public/index.html — WebSocket sync layer

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add the sync block right after the `figToJSON` helper from Task 7**

```js
// ─── WebSocket sync ──────────────────────────────────────────────
let ws = null;
let syncOpen = false;
let applyingRemote = false;
let participantCount = 1;

function setStatus(text) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = text;
}

function send(msg) {
  if (syncOpen && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function applySnapshot(figList) {
  applyingRemote = true;
  try {
    figures.slice().forEach(f => { scene.remove(f.mesh); });
    figures.length = 0;
    for (const f of figList) {
      addFigure(f.type, f.color, f.x, f.z, f.label || '', f.scale || 1.0, f.rotY || 0, f.id);
    }
    selectFigure(null);
  } finally { applyingRemote = false; }
}

function applyRemote(msg) {
  applyingRemote = true;
  try {
    if (msg.type === 'add' && msg.fig && !findFigById(msg.fig.id)) {
      addFigure(msg.fig.type, msg.fig.color, msg.fig.x, msg.fig.z,
                msg.fig.label, msg.fig.scale, msg.fig.rotY, msg.fig.id);
    } else if (msg.type === 'move') {
      const f = findFigById(msg.id);
      if (f) { f.mesh.position.x = msg.x; f.mesh.position.z = msg.z; }
    } else if (msg.type === 'update') {
      const f = findFigById(msg.id);
      if (f && msg.changes) {
        if (msg.changes.label !== undefined) setLabel(f, msg.changes.label);
        if (msg.changes.scale !== undefined) setScale(f, msg.changes.scale);
        if (msg.changes.rotY  !== undefined) setRotY (f, msg.changes.rotY);
        if (msg.changes.color !== undefined) recolorFigure(f, msg.changes.color);
      }
    } else if (msg.type === 'delete') {
      const f = findFigById(msg.id);
      if (f) {
        scene.remove(f.mesh);
        const i = figures.indexOf(f);
        if (i >= 0) figures.splice(i, 1);
        if (selectedFigure === f) { clearSelRing(); selectedFigure = null; }
      }
    } else if (msg.type === 'clear') {
      clearBoard();
    }
  } finally { applyingRemote = false; }
}

function connect() {
  if (ROOM === 'standalone') {
    setStatus('Standalone (kein Sync)');
    return;
  }
  setStatus('Verbinde …');
  ws = new WebSocket(SYNC_URL);
  ws.onopen = () => {
    syncOpen = true;
    ws.send(JSON.stringify({ type: 'join', room: ROOM }));
    setStatus('Verbunden ✓');
  };
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'snapshot') applySnapshot(msg.figures || []);
    else if (msg.type === 'info') {
      participantCount = msg.count;
      setStatus(`Verbunden ✓ — ${participantCount} Teilnehmer`);
    } else applyRemote(msg);
  };
  ws.onclose = () => {
    syncOpen = false;
    setStatus('Verbindung getrennt — versuche neu …');
    setTimeout(connect, 3000);
  };
  ws.onerror = () => setStatus('Verbindungsfehler');
}
connect();
```

- [ ] **Step 2: Wire `send()` into local mutations**

In the **figure-button click handler**, find:
```js
const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
selectFigure(fig);
openLabelModal(fig);
```

Add a `send` after `addFigure`:
```js
const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
send({ type: 'add', fig: figToJSON(fig) });
selectFigure(fig);
openLabelModal(fig);
```

In **`recolorFigure`** (where colour changes), the existing code rebuilds the mesh. Add a send after the rebuild:
```js
function recolorFigure(fig, color) {
  fig.color = color;
  const newMesh = buildFigure(fig.type, color);
  newMesh.position.copy(fig.mesh.position);
  newMesh.rotation.y = fig.rotY;
  newMesh.scale.setScalar(fig.scale);
  scene.remove(fig.mesh);
  scene.add(newMesh);
  fig.mesh = newMesh;
  if (fig.label) attachLabel(fig);
  selectFigure(fig);
  if (!applyingRemote) send({ type: 'update', id: fig.id, changes: { color } });
}
```

In **scale slider input** handler, add the send:
```js
scaleSlider.addEventListener('input', () => {
  const s = parseFloat(scaleSlider.value);
  scaleVal.textContent = s.toFixed(1)+'×';
  if (selectedFigure) {
    setScale(selectedFigure, s);
    if (!applyingRemote) send({ type: 'update', id: selectedFigure.id, changes: { scale: s } });
  }
});
```

In the **`[data-scale]` button** click handler, mirror the same:
```js
document.querySelectorAll('[data-scale]').forEach(btn => {
  btn.addEventListener('click', () => {
    const s = parseFloat(btn.dataset.scale);
    scaleSlider.value = s;
    scaleVal.textContent = s.toFixed(1)+'×';
    if (selectedFigure) {
      setScale(selectedFigure, s);
      if (!applyingRemote) send({ type: 'update', id: selectedFigure.id, changes: { scale: s } });
    }
  });
});
```

In the **`[data-rot]` button** click handler:
```js
document.querySelectorAll('[data-rot]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedFigure) return;
    const deg = parseInt(btn.dataset.rot);
    setRotY(selectedFigure, selectedFigure.rotY + deg * Math.PI/180);
    if (!applyingRemote) send({ type: 'update', id: selectedFigure.id, changes: { rotY: selectedFigure.rotY } });
  });
});
```

In the **delete button** click handler:
```js
document.getElementById('btn-delete').addEventListener('click', () => {
  if (!selectedFigure) return;
  const id = selectedFigure.id;
  scene.remove(selectedFigure.mesh);
  figures = figures.filter(f => f !== selectedFigure);
  clearSelRing(); selectedFigure = null;
  document.getElementById('selected-info').textContent = '';
  send({ type: 'delete', id });
});
```

In **`label-confirm`** handler:
```js
document.getElementById('label-confirm').addEventListener('click', () => {
  if (pendingLabelFig) {
    setLabel(pendingLabelFig, labelInput.value.trim());
    if (!applyingRemote) send({ type: 'update', id: pendingLabelFig.id, changes: { label: pendingLabelFig.label } });
  }
  modal.classList.remove('visible'); pendingLabelFig = null;
});
```

In **`clearBoard`** flow — the `btn-reset` handler asks for confirmation, then calls `clearBoard`. Wrap so we send before clearing:
```js
document.getElementById('btn-reset').addEventListener('click', () => {
  askConfirm('Alle Figuren entfernen?', () => {
    clearBoard();
    if (!applyingRemote) send({ type: 'clear' });
  });
});
```

In **`mousemove`** drag, add a debounced send. Above the existing `canvas.addEventListener('mousemove', ...)` block, add:
```js
let lastMoveSentAt = 0;
function sendMoveThrottled(fig) {
  const now = performance.now();
  if (now - lastMoveSentAt < 30) return;
  lastMoveSentAt = now;
  send({ type: 'move', id: fig.id, x: fig.mesh.position.x, z: fig.mesh.position.z });
}
```

In the existing `mousemove` handler's drag branch, add the call:
```js
if (drag.on && drag.fig) {
  const pos = pickBoard(getNDC(e));
  if (pos) {
    drag.fig.mesh.position.x = Math.max(-BW/2+1, Math.min(BW/2-1, pos.x));
    drag.fig.mesh.position.z = Math.max(-BD/2+1, Math.min(BD/2-1, pos.z));
    if (!applyingRemote) sendMoveThrottled(drag.fig);
  }
}
```

In `mouseup`, send a final position so the rest position is authoritative:
```js
canvas.addEventListener('mouseup', e => {
  if (e.button === 2) rmbOn = false;
  if (e.button === 0) {
    if (drag.on && drag.fig && !applyingRemote) {
      send({ type: 'move', id: drag.fig.id, x: drag.fig.mesh.position.x, z: drag.fig.mesh.position.z });
    }
    drag = { on:false, fig:null };
  }
});
```

Mirror these two changes in the `touchmove` and `touchend` handlers.

- [ ] **Step 3: Add the status pill to the toolbar**

In the toolbar HTML, find the closing `</div>` of the right-side IO buttons block:
```html
<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
  <button class="io-btn save" id="btn-save">↓ Speichern</button>
  ...
  <button id="btn-reset">Brett leeren</button>
</div>
```

Add a status element **before** the IO block:
```html
<div id="sync-status" style="font-size:12px; color:#6be0a0; margin-left:auto; margin-right:8px;">Verbinde …</div>
<div style="display:flex;gap:8px;align-items:center;">
  ...
</div>
```

(Replace the original `style="margin-left:auto"` on the IO block with no margin-left since the status already takes it.)

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): WebSocket sync layer in HTML, status pill"
```

---

### Task 9: public/index.html — Speichern modal (with customer dropdown)

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add the modal HTML**

Inside `<body>`, after the existing `<div id="label-modal">` block, add:

```html
<div id="save-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:100;align-items:center;justify-content:center;">
  <div style="background:#16213e;border:1px solid #0f3460;border-radius:12px;padding:22px 26px;width:340px;">
    <h3 style="font-size:13px;font-weight:500;margin-bottom:14px;color:#aaa;">Brett speichern</h3>
    <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Klient</label>
    <select id="save-customer" style="width:100%;background:#0f1e3a;border:1px solid #0f3460;color:#e0e0e0;padding:8px 10px;border-radius:8px;margin-bottom:12px;">
      <option value="">— kein Klient —</option>
    </select>
    <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Name</label>
    <input id="save-name" type="text" placeholder="z.B. vor Intervention" maxlength="200"
           style="width:100%;background:#0f1e3a;border:1px solid #0f3460;color:#e0e0e0;padding:9px 11px;border-radius:8px;outline:none;">
    <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
      <button class="modal-btn" id="save-cancel">Abbrechen</button>
      <button class="modal-btn primary" id="save-ok">Speichern</button>
    </div>
  </div>
</div>
```

The modal becomes visible by toggling `display:flex` on the outer div.

- [ ] **Step 2: Wire the Save button**

Find the existing `btn-save` handler (the one that builds JSON and downloads it) and **replace** it with:

```js
const saveModal     = document.getElementById('save-modal');
const saveCustomer  = document.getElementById('save-customer');
const saveName      = document.getElementById('save-name');

let customersCache = null;
async function loadCustomers() {
  if (customersCache) return customersCache;
  const res = await fetch(`${API}/customers`);
  customersCache = res.ok ? await res.json() : [];
  return customersCache;
}

async function fillCustomerDropdown(selectEl) {
  const list = await loadCustomers();
  // Keep first option ("— kein Klient —" or "Alle Snapshots dieses Raums"), drop dynamic ones.
  while (selectEl.options.length > 1) selectEl.remove(1);
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  }
}

async function preselectCustomerForRoom(selectEl) {
  if (ROOM === 'standalone') return;
  // Pick the most-recent snapshot's customer for this room, if any.
  try {
    const res = await fetch(`${API}/snapshots?room=${encodeURIComponent(ROOM)}`);
    if (!res.ok) return;
    const list = await res.json();
    const last = list.find(s => s.customer_id);
    if (last) selectEl.value = last.customer_id;
  } catch {}
}

document.getElementById('btn-save').addEventListener('click', async () => {
  await fillCustomerDropdown(saveCustomer);
  saveCustomer.value = '';
  await preselectCustomerForRoom(saveCustomer);
  saveName.value = '';
  saveModal.style.display = 'flex';
  setTimeout(() => saveName.focus(), 40);
});

document.getElementById('save-cancel').addEventListener('click', () => {
  saveModal.style.display = 'none';
});

document.getElementById('save-ok').addEventListener('click', async () => {
  const name = saveName.value.trim();
  if (!name) { saveName.focus(); return; }
  const body = {
    room_token:  ROOM === 'standalone' ? null : ROOM,
    customer_id: saveCustomer.value || null,
    name,
    state: { figures: figures.map(figToJSON) },
  };
  const res = await fetch(`${API}/snapshots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    saveModal.style.display = 'none';
    setStatus(`Gespeichert ✓`);
    setTimeout(() => {
      if (syncOpen) setStatus(`Verbunden ✓ — ${participantCount} Teilnehmer`);
    }, 2000);
  } else {
    alert(`Speichern fehlgeschlagen: ${res.status}`);
  }
});
```

- [ ] **Step 3: Drop the file-input element**

Find and remove (no longer needed):
```html
<input type="file" id="load-input" accept=".json">
```
And remove its associated event listeners (the `btn-load.click()` chain that triggers it and the `change` handler that reads the file).

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): Speichern modal with customer dropdown"
```

---

### Task 10: public/index.html — Laden modal

**Files:**
- Modify: `brett/public/index.html`

> Render the snapshot list with `document.createElement` + `textContent` — never `innerHTML` with interpolated values. Snapshot names are user-supplied and could contain HTML.

- [ ] **Step 1: Add the load-modal HTML**

After `#save-modal`, add:

```html
<div id="load-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:100;align-items:center;justify-content:center;">
  <div style="background:#16213e;border:1px solid #0f3460;border-radius:12px;padding:22px 26px;width:380px;max-height:80vh;display:flex;flex-direction:column;">
    <h3 style="font-size:13px;font-weight:500;margin-bottom:14px;color:#aaa;">Brett laden</h3>
    <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Filter</label>
    <select id="load-filter" style="width:100%;background:#0f1e3a;border:1px solid #0f3460;color:#e0e0e0;padding:8px 10px;border-radius:8px;margin-bottom:12px;">
      <option value="room">Alle Snapshots dieses Raums</option>
    </select>
    <div id="load-list" style="overflow:auto;flex:1;border:1px solid #0f3460;border-radius:8px;padding:8px;min-height:120px;">
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
      <button class="modal-btn" id="load-cancel">Schließen</button>
    </div>
  </div>
</div>
```

(Empty `#load-list` — its content is built entirely with DOM methods in step 2.)

- [ ] **Step 2: Wire the Load button**

Replace the existing `btn-load` handler (which previously opened the file picker) with:

```js
const loadModal  = document.getElementById('load-modal');
const loadFilter = document.getElementById('load-filter');
const loadList   = document.getElementById('load-list');

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function placeholderRow(text, color) {
  const div = document.createElement('div');
  div.style.cssText = `color:${color};font-size:12px;`;
  div.textContent = text;
  return div;
}

async function fillLoadFilter() {
  const list = await loadCustomers();
  // Keep first ("Raum") option, drop dynamic ones.
  while (loadFilter.options.length > 1) loadFilter.remove(1);
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = `customer:${c.id}`;
    opt.textContent = c.name;
    loadFilter.appendChild(opt);
  }
}

async function refreshLoadList() {
  clearChildren(loadList);
  loadList.appendChild(placeholderRow('— wird geladen —', '#666'));

  const v = loadFilter.value;
  let url;
  if (v === 'room') {
    if (ROOM === 'standalone') {
      clearChildren(loadList);
      loadList.appendChild(placeholderRow('Standalone — kein Raum.', '#888'));
      return;
    }
    url = `${API}/snapshots?room=${encodeURIComponent(ROOM)}`;
  } else {
    const customerId = v.replace(/^customer:/, '');
    url = `${API}/snapshots?customer_id=${encodeURIComponent(customerId)}`;
  }
  const res = await fetch(url);
  const list = res.ok ? await res.json() : [];

  clearChildren(loadList);
  if (!list.length) {
    loadList.appendChild(placeholderRow('Keine Snapshots.', '#888'));
    return;
  }

  for (const s of list) {
    const row = document.createElement('button');
    row.style.cssText = 'display:flex;justify-content:space-between;width:100%;background:#0f2040;border:1px solid #0f3460;color:#e0e0e0;padding:8px 10px;border-radius:6px;margin-bottom:6px;cursor:pointer;font-size:13px;text-align:left;';

    const nameEl = document.createElement('span');
    nameEl.textContent = s.name;       // textContent escapes automatically

    const dateEl = document.createElement('span');
    dateEl.style.color = '#888';
    dateEl.textContent = new Date(s.created_at).toLocaleString('de-DE', {
      dateStyle: 'short', timeStyle: 'short',
    });

    row.appendChild(nameEl);
    row.appendChild(dateEl);
    row.addEventListener('click', () => loadSnapshot(s.id));
    loadList.appendChild(row);
  }
}

async function loadSnapshot(id) {
  const res = await fetch(`${API}/snapshots/${encodeURIComponent(id)}`);
  if (!res.ok) { alert('Snapshot konnte nicht geladen werden.'); return; }
  const snap = await res.json();
  const figs = (snap.state && snap.state.figures) || [];

  // Broadcast: clear, then add each figure, so peers see the load.
  send({ type: 'clear' });
  applySnapshot(figs);
  for (const f of figs) {
    send({ type: 'add', fig: f });
  }
  loadModal.style.display = 'none';
}

document.getElementById('btn-load').addEventListener('click', async () => {
  await fillLoadFilter();
  loadFilter.value = 'room';
  await refreshLoadList();
  loadModal.style.display = 'flex';
});
loadFilter.addEventListener('change', refreshLoadList);
document.getElementById('load-cancel').addEventListener('click', () => {
  loadModal.style.display = 'none';
});
```

- [ ] **Step 3: End-to-end smoke test in a browser**

Build, import, deploy is in Phase 3. For now, run the brett pod locally:
```bash
cd brett && DATABASE_URL="postgres://website:${WEBSITE_DB_PASSWORD}@127.0.0.1:5432/website?sslmode=disable" \
  PORT=3001 node server.js &
```

Open two browser tabs at `http://127.0.0.1:3001/?room=manual-test`. Add figures in tab 1; verify they appear in tab 2. Save a snapshot in tab 1, reload tab 1 with `?room=manual-test2`, click Laden → switch filter to a customer or "Alle Snapshots dieses Raums" → load. Confirm figures appear.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): Laden modal with customer/room filter"
```

---

## Phase 3 — Cluster manifests and env wiring

### Task 11: Add `BRETT_DOMAIN` to domain config and env schema

**Files:**
- Modify: `k3d/configmap-domains.yaml`
- Modify: `environments/schema.yaml`
- Modify: `environments/dev.yaml`
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`

- [ ] **Step 1: Add `BRETT_DOMAIN` to `k3d/configmap-domains.yaml`**

In the `data:` block, add:
```yaml
  BRETT_DOMAIN: "brett.localhost"
```

- [ ] **Step 2: Add it to the env schema**

Open `environments/schema.yaml` and find the `env_vars:` section. Add an entry:

```yaml
  BRETT_DOMAIN:
    description: "Public hostname for the Systemisches Brett pod"
    default_dev: "brett.localhost"
```

Add a setup_vars entry for the bot secret:

```yaml
  BRETT_BOT_SECRET:
    description: "HMAC secret for the Nextcloud Talk bot that posts /brett links"
    generated: true                # let env:generate produce a random value
```

(Match the existing key style — check the schema for whether `generated:` is `true` for secrets, or if there's a `category: secret` flag. Adapt to whichever convention the schema already uses.)

- [ ] **Step 3: Add per-env values**

`environments/dev.yaml`: nothing to add (defaults from schema).

`environments/mentolder.yaml` — add under `env_vars:`:
```yaml
  BRETT_DOMAIN: brett.mentolder.de
```

`environments/korczewski.yaml` — add under `env_vars:`:
```yaml
  BRETT_DOMAIN: brett.korczewski.de
```

- [ ] **Step 4: Validate**

```bash
task env:validate ENV=dev
task env:validate ENV=mentolder
task env:validate ENV=korczewski
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add k3d/configmap-domains.yaml environments/
git commit -m "feat(brett): add BRETT_DOMAIN + BRETT_BOT_SECRET to env registry"
```

---

### Task 12: Create `k3d/brett.yaml` (Deployment + Service)

**Files:**
- Create: `k3d/brett.yaml`

- [ ] **Step 1: Write `k3d/brett.yaml`**

```yaml
# ═══════════════════════════════════════════════════════════════════
# Brett — 3D systemic-board pod. Static HTML + REST + WebSocket sync.
# Persists to shared-db (website DB). Single replica by design (in-memory
# rooms map). See docs/superpowers/specs/2026-04-25-systemisches-brett-design.md
# ═══════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: brett
  labels:
    app: brett
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: brett
  template:
    metadata:
      labels:
        app: brett
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: brett
          image: workspace-brett:latest
          imagePullPolicy: IfNotPresent
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
          env:
            - name: PORT
              value: "3000"
            - name: WEBSITE_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: WEBSITE_DB_PASSWORD
            - name: DATABASE_URL
              value: "postgresql://website:$(WEBSITE_DB_PASSWORD)@shared-db:5432/website?sslmode=prefer"
          ports:
            - containerPort: 3000
          readinessProbe:
            httpGet: { path: /healthz, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              memory: 128Mi
              cpu: "100m"
            limits:
              memory: 512Mi
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: brett
spec:
  selector:
    app: brett
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 2: Validate the manifest**

```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' k3d/brett.yaml
kubectl apply --dry-run=client -f k3d/brett.yaml -n workspace --context k3d-dev
```
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add k3d/brett.yaml
git commit -m "feat(brett): Deployment + Service manifest"
```

---

### Task 13: Wire brett into kustomization and add ingress

**Files:**
- Modify: `k3d/kustomization.yaml`
- Modify: `k3d/ingress.yaml`

- [ ] **Step 1: Add `brett.yaml` to `k3d/kustomization.yaml`**

Find the `resources:` list and append:
```yaml
  - brett.yaml
```

- [ ] **Step 2: Add the ingress route**

In `k3d/ingress.yaml`, inside the `workspace-ingress` `rules:` list (the **public** ingress, not the internal one), add:

```yaml
    - host: brett.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: brett
                port:
                  number: 3000
```

- [ ] **Step 3: Validate kustomize build**

```bash
kustomize build k3d/ | kubeconform -summary -strict -kubernetes-version 1.31.0
```
Expected: 0 errors. The brett Deployment/Service/Ingress should appear in the build output.

- [ ] **Step 4: Commit**

```bash
git add k3d/kustomization.yaml k3d/ingress.yaml
git commit -m "feat(brett): register in kustomization and dev ingress"
```

---

### Task 14: Add brett NetworkPolicies

**Files:**
- Modify: `k3d/network-policies.yaml`

- [ ] **Step 1: Add ingress-from-traefik and egress-to-shared-db**

Append to `k3d/network-policies.yaml`:

```yaml
---
# brett: ingress from Traefik on 3000
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: brett-ingress
  namespace: workspace
spec:
  podSelector:
    matchLabels:
      app: brett
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              app.kubernetes.io/name: traefik
      ports:
        - protocol: TCP
          port: 3000
---
# brett: egress to shared-db (5432) and DNS only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: brett-egress
  namespace: workspace
spec:
  podSelector:
    matchLabels:
      app: brett
  policyTypes: [Egress]
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: shared-db
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

- [ ] **Step 2: Validate**

```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' k3d/network-policies.yaml
kustomize build k3d/ | kubeconform -summary -strict -kubernetes-version 1.31.0
```

- [ ] **Step 3: Commit**

```bash
git add k3d/network-policies.yaml
git commit -m "feat(brett): NetworkPolicies — ingress from Traefik, egress to shared-db + DNS"
```

---

### Task 15: Generate `BRETT_BOT_SECRET` for dev

**Files:**
- Modify: `k3d/secrets.yaml` (dev plaintext)

- [ ] **Step 1: Add `BRETT_BOT_SECRET` to `k3d/secrets.yaml`**

`k3d/secrets.yaml` is the dev-only Secret. Append a new key under `stringData:`:
```yaml
  BRETT_BOT_SECRET: "devbrettbotsecret_change_me_a1b2c3d4e5f6"
```

(Treat as a placeholder fixed value for dev — same pattern other dev secrets use.)

- [ ] **Step 2: Apply to dev cluster**

```bash
kubectl apply -f k3d/secrets.yaml -n workspace --context k3d-dev
```

- [ ] **Step 3: Commit**

```bash
git add k3d/secrets.yaml
git commit -m "feat(brett): dev BRETT_BOT_SECRET (placeholder)"
```

> **Note for prod rollout** (`mentolder`, `korczewski`): after this PR is merged, the user must run `task env:generate ENV=<env>` and `task env:seal ENV=<env>` in a follow-up PR so the SealedSecret picks up `BRETT_BOT_SECRET`. The plan covers this in the rollout note (Task 24).

---

## Phase 4 — Talk integration in website backend

### Task 16: Add `sendChatMessage` and bot-reply helpers to `talk.ts`

**Files:**
- Modify: `website/src/lib/talk.ts`
- Create: `website/src/lib/brett-bot.ts`
- Create: `website/src/lib/brett-bot.test.ts`

- [ ] **Step 1: Append `sendChatMessage` to `website/src/lib/talk.ts`**

At the end of the file:

```ts
// Post a chat message into a Talk conversation as the admin user.
// Used for the auto-post on Talk-roomed meeting creation.
export async function sendChatMessage(roomToken: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${NC_URL}/ocs/v2.php/apps/spreed/api/v1/chat/${roomToken}`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
      body: JSON.stringify({ message, replyTo: 0 }),
    });
    if (!res.ok) {
      console.error('[talk] sendChatMessage failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[talk] sendChatMessage error:', err);
    return false;
  }
}
```

- [ ] **Step 2: Create `website/src/lib/brett-bot.ts`**

```ts
// HMAC verification for incoming Talk bot webhooks, and signed replies.
// Per Nextcloud Talk Bots API:
//   - Header X-Nextcloud-Talk-Random: nonce
//   - Header X-Nextcloud-Talk-Signature: hex SHA256(random + body) using shared secret
//   - Replies: POST to /ocs/v2.php/apps/spreed/api/v1/bot/<token>/message
//             with the same headers, signing (random + body) of the OUTGOING request

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const NC_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';

function hmacHex(secret: string, random: string, body: string): string {
  return createHmac('sha256', secret).update(random).update(body).digest('hex');
}

export function verifyTalkSignature(
  secret: string,
  random: string,
  body: string,
  signatureHex: string
): boolean {
  if (!secret || !random || !signatureHex) return false;
  const expected = hmacHex(secret, random, body);
  // timingSafeEqual requires same length — guard before calling.
  if (expected.length !== signatureHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export async function postBotReply(
  roomToken: string,
  message: string,
  secret: string
): Promise<boolean> {
  const body = JSON.stringify({ message, referenceId: `brett-${Date.now()}` });
  const random = randomBytes(32).toString('hex');
  const signature = hmacHex(secret, random, body);

  try {
    const res = await fetch(
      `${NC_URL}/ocs/v2.php/apps/spreed/api/v1/bot/${encodeURIComponent(roomToken)}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OCS-APIRequest': 'true',
          Accept: 'application/json',
          'X-Nextcloud-Talk-Random': random,
          'X-Nextcloud-Talk-Signature': signature,
        },
        body,
      }
    );
    if (!res.ok) {
      console.error('[brett-bot] reply failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[brett-bot] reply error:', err);
    return false;
  }
}
```

- [ ] **Step 3: Write a unit test for HMAC verification**

Create `website/src/lib/brett-bot.test.ts`. First check `website/package.json` to see whether the project already configures `vitest` (look for `"vitest"` in `devDependencies`). If yes, use the vitest form. If no test runner is configured, add the file in `node:test` form.

**vitest form** (preferred if available):
```ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTalkSignature } from './brett-bot';

describe('verifyTalkSignature', () => {
  const secret = 'sekret';
  const random = 'abc123';
  const body = '{"hello":"world"}';
  const validSig = createHmac('sha256', secret).update(random).update(body).digest('hex');

  it('accepts a valid signature', () => {
    expect(verifyTalkSignature(secret, random, body, validSig)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyTalkSignature(secret, random, '{"hello":"WORLD"}', validSig)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyTalkSignature('other', random, body, validSig)).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(verifyTalkSignature('', random, body, validSig)).toBe(false);
    expect(verifyTalkSignature(secret, '', body, validSig)).toBe(false);
    expect(verifyTalkSignature(secret, random, body, '')).toBe(false);
  });

  it('handles different-length signatures', () => {
    expect(verifyTalkSignature(secret, random, body, 'short')).toBe(false);
  });
});
```

**`node:test` form** (if no vitest):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTalkSignature } from './brett-bot';

const secret = 'sekret';
const random = 'abc123';
const body = '{"hello":"world"}';
const validSig = createHmac('sha256', secret).update(random).update(body).digest('hex');

test('verifyTalkSignature: accepts valid', () => {
  assert.equal(verifyTalkSignature(secret, random, body, validSig), true);
});
test('verifyTalkSignature: rejects tampered body', () => {
  assert.equal(verifyTalkSignature(secret, random, '{"hello":"WORLD"}', validSig), false);
});
test('verifyTalkSignature: rejects wrong secret', () => {
  assert.equal(verifyTalkSignature('other', random, body, validSig), false);
});
test('verifyTalkSignature: rejects empty inputs', () => {
  assert.equal(verifyTalkSignature('', random, body, validSig), false);
  assert.equal(verifyTalkSignature(secret, '', body, validSig), false);
  assert.equal(verifyTalkSignature(secret, random, body, ''), false);
});
test('verifyTalkSignature: rejects different-length sig', () => {
  assert.equal(verifyTalkSignature(secret, random, body, 'short'), false);
});
```

- [ ] **Step 4: Run the unit test**

Vitest:
```bash
cd website && npx vitest run src/lib/brett-bot.test.ts && cd ..
```
Or `node:test`:
```bash
cd website && npx tsx --test src/lib/brett-bot.test.ts && cd ..
```
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/talk.ts website/src/lib/brett-bot.ts website/src/lib/brett-bot.test.ts
git commit -m "feat(brett): talk.sendChatMessage + brett-bot HMAC helpers (with tests)"
```

---

### Task 17: Talk webhook route

**Files:**
- Create: `website/src/pages/api/brett/bot.ts`
- Modify: `k3d/website.yaml`

- [ ] **Step 1: Write `website/src/pages/api/brett/bot.ts`**

```ts
import type { APIRoute } from 'astro';
import { verifyTalkSignature, postBotReply } from '../../../lib/brett-bot';

const BOT_SECRET   = process.env.BRETT_BOT_SECRET || '';
const BRETT_DOMAIN = process.env.BRETT_DOMAIN || 'brett.localhost';

export const POST: APIRoute = async ({ request }) => {
  const body   = await request.text();
  const random = request.headers.get('x-nextcloud-talk-random') ?? '';
  const sig    = request.headers.get('x-nextcloud-talk-signature') ?? '';

  if (!verifyTalkSignature(BOT_SECRET, random, body, sig)) {
    return new Response('forbidden', { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(body); } catch { return new Response(null, { status: 200 }); }

  if (evt.type !== 'Create' || evt.object?.name !== 'message') {
    return new Response(null, { status: 200 });
  }

  let messageText = '';
  try {
    const content = JSON.parse(evt.object.content);
    messageText = (content?.message || '').trim();
  } catch { /* ignore */ }

  if (!/^\/brett(\s|$)/.test(messageText)) {
    return new Response(null, { status: 200 });
  }

  const roomToken = evt.target?.id;
  if (!roomToken || typeof roomToken !== 'string') {
    return new Response(null, { status: 200 });
  }

  const url = `https://${BRETT_DOMAIN}/?room=${encodeURIComponent(roomToken)}`;
  await postBotReply(roomToken, `🎯 Systemisches Brett: ${url}`, BOT_SECRET);

  return new Response(null, { status: 201 });
};
```

- [ ] **Step 2: Add the env vars to the website Deployment**

Edit `k3d/website.yaml` (the website Deployment). Inside the container's `env:` block, add:

```yaml
            - name: BRETT_BOT_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: BRETT_BOT_SECRET
            - name: BRETT_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: BRETT_DOMAIN
```

- [ ] **Step 3: Validate the kustomize build**

```bash
kustomize build k3d/ | kubeconform -summary -strict -kubernetes-version 1.31.0
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/brett/bot.ts k3d/website.yaml
git commit -m "feat(brett): /brett Talk bot webhook + website env wiring"
```

---

### Task 18: Auto-post hook on Talk-roomed meeting creation

**Files:**
- Modify: `website/src/pages/api/admin/inbox/[id]/action.ts`
- Modify: `website/src/lib/website-db.ts` (add `claimBrettLinkPost` helper)

- [ ] **Step 1: Add `claimBrettLinkPost` to `website-db.ts`**

Append to `website/src/lib/website-db.ts`:

```ts
// Atomically claim the right to post the brett link for a meeting exactly once.
// Returns true if this caller won the claim (and should post), false if already posted.
export async function claimBrettLinkPost(meetingId: string): Promise<boolean> {
  const result = await sql`
    UPDATE meetings
       SET brett_link_posted_at = now()
     WHERE id = ${meetingId} AND brett_link_posted_at IS NULL
     RETURNING id`;
  return result.length === 1;
}
```

(Use whichever query helper the file already uses — adapt the syntax to match. The shape is `UPDATE … RETURNING id` and inspect whether anything was returned.)

- [ ] **Step 2: Read the existing inbox-action call site**

Open `website/src/pages/api/admin/inbox/[id]/action.ts` and locate around line 98 — the block that calls `createTalkRoom` and then `createMeeting`. Identify the variables in scope after `createMeeting` returns (likely `meeting.id` and `room.token`).

- [ ] **Step 3: Add the auto-post call**

Right after the `createMeeting({ ... })` call returns successfully (and assigns to a `meeting` variable), add:

```ts
        // Auto-post the systemisches Brett link into the new Talk room (idempotent).
        try {
          if (await claimBrettLinkPost(meeting.id)) {
            const brettDomain = process.env.BRETT_DOMAIN || 'brett.localhost';
            const url = `https://${brettDomain}/?room=${encodeURIComponent(room.token)}`;
            await sendChatMessage(room.token, `🎯 Systemisches Brett für diese Sitzung: ${url}`);
          }
        } catch (err) {
          console.error('[brett] auto-post failed (non-fatal):', err);
        }
```

Add the imports at the top of `action.ts`:

```ts
import { sendChatMessage } from '../../../../../lib/talk';
import { claimBrettLinkPost } from '../../../../../lib/website-db';
```

- [ ] **Step 4: Smoke-test**

After deploy (Task 22): create an inbox item that triggers Talk-room provisioning, action it, and verify a chat message appears in the resulting conversation. Defer until Phase 5.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/inbox/[id]/action.ts website/src/lib/website-db.ts
git commit -m "feat(brett): auto-post Brett link on Talk-roomed meeting creation"
```

---

## Phase 5 — Setup, deployment, tests, docs

### Task 19: Bot setup script

**Files:**
- Create: `scripts/brett-bot-setup.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Register the "Systemisches Brett" Nextcloud Talk bot.
# Idempotent: if the bot is already installed, exits 0 with a notice.
#
# Usage: ENV=<env> bash scripts/brett-bot-setup.sh
set -euo pipefail

if [[ -z "${ENV:-}" ]]; then
  echo "ERROR: ENV= must be set (dev|mentolder|korczewski)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/env-resolve.sh" "${ENV}"

WEBSITE_HOST="${WEB_DOMAIN:-web.${PROD_DOMAIN:-localhost}}"
if [[ "${ENV}" == "dev" ]]; then
  WEBHOOK_URL="http://web.localhost/api/brett/bot"
else
  WEBHOOK_URL="https://${WEBSITE_HOST}/api/brett/bot"
fi

# Pull the live secret from the cluster (works for both dev plaintext and prod sealed).
SECRET="$(kubectl get secret -n workspace --context "${ENV_CONTEXT}" \
            workspace-secrets -o jsonpath='{.data.BRETT_BOT_SECRET}' | base64 -d)"

if [[ -z "${SECRET}" ]]; then
  echo "ERROR: BRETT_BOT_SECRET not present in workspace-secrets for ${ENV}" >&2
  exit 1
fi

echo "Registering Talk bot for ${ENV} → ${WEBHOOK_URL}"

INSTALL_OUT="$(kubectl exec -n workspace deploy/nextcloud --context "${ENV_CONTEXT}" -- \
  php occ talk:bot:install \
    "Systemisches Brett" \
    "${SECRET}" \
    "${WEBHOOK_URL}" \
    "Stellt das Systemische Brett auf /brett bereit" \
    "webhook" 2>&1)" || true

if echo "${INSTALL_OUT}" | grep -qiE 'already.*exists|installiert'; then
  echo "Bot already installed — skipping."
else
  echo "${INSTALL_OUT}"
fi

# Enable globally for all conversations.
echo "Enabling bot for all conversations..."
LIST_OUT="$(kubectl exec -n workspace deploy/nextcloud --context "${ENV_CONTEXT}" -- \
  php occ talk:bot:list)"
BOT_ID="$(echo "${LIST_OUT}" | awk '/Systemisches Brett/ {print $1; exit}')"

if [[ -z "${BOT_ID}" ]]; then
  echo "ERROR: could not find bot id after install" >&2
  exit 1
fi

kubectl exec -n workspace deploy/nextcloud --context "${ENV_CONTEXT}" -- \
  php occ talk:bot:setup "${BOT_ID}" --feature all || true

echo "Done. Bot ID: ${BOT_ID}"
```

- [ ] **Step 2: Make it executable + shellcheck-clean**

```bash
chmod +x scripts/brett-bot-setup.sh
shellcheck scripts/brett-bot-setup.sh
```
Expected: no warnings (or only innocuous ones; address any errors).

- [ ] **Step 3: Commit**

```bash
git add scripts/brett-bot-setup.sh
git commit -m "feat(brett): scripts/brett-bot-setup.sh — register Talk bot per env"
```

---

### Task 20: Taskfile entries

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add brett tasks**

Append to the appropriate section of `Taskfile.yml` (match the indentation/style of the existing `workspace:*` tasks):

```yaml
  brett:build:
    desc: "Build brett image and import into k3d"
    cmds:
      - docker build -t workspace-brett:latest brett/
      - k3d image import workspace-brett:latest -c workspace-cluster

  brett:deploy:
    desc: "Build, import, and roll out brett"
    cmds:
      - task: brett:build
      - kubectl rollout restart deploy/brett -n workspace --context "{{.ENV_CONTEXT}}"
      - kubectl rollout status  deploy/brett -n workspace --context "{{.ENV_CONTEXT}}"

  brett:bot-setup:
    desc: "Register the Nextcloud Talk bot for /brett (one-time per env)"
    cmds:
      - bash scripts/brett-bot-setup.sh
    preconditions:
      - sh: '[[ -n "${ENV:-}" ]]'
        msg: "ENV= must be set (dev|mentolder|korczewski)"

  brett:logs:
    desc: "Tail brett logs"
    cmds:
      - kubectl logs -n workspace -l app=brett --tail=200 -f --context "{{.ENV_CONTEXT}}"
```

(Match the actual cluster name your taskfile uses for `k3d image import` — search for an existing `k3d image import` line in the Taskfile and use the same `-c` argument.)

- [ ] **Step 2: Validate**

```bash
task --list | grep brett:
```
Expected: the four new tasks listed.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(brett): Taskfile entries (build/deploy/bot-setup/logs)"
```

---

### Task 21: End-to-end smoke test script

**Files:**
- Create: `scripts/tests/brett.test.sh`
- Modify: `tests/runner.sh`

- [ ] **Step 1: Write the test**

```bash
#!/usr/bin/env bash
# FA-26 — brett pod smoke test
# Verifies HTTP 200, WS upgrade with snapshot reply, and snapshot CRUD round-trip.
set -euo pipefail

BASE="${BRETT_BASE:-http://brett.localhost}"
ROOM="brett-test-$(date +%s)"

echo "=== brett smoke test against ${BASE} (room: ${ROOM}) ==="

# 1. Static + healthz
curl -fsS "${BASE}/healthz" >/dev/null
echo "  [ok] /healthz"

curl -fsS "${BASE}/" -o /dev/null
echo "  [ok] /"

curl -fsS "${BASE}/three.min.js" -o /dev/null
echo "  [ok] /three.min.js"

# 2. State + customers
curl -fsS "${BASE}/api/state?room=${ROOM}" | grep -q '"figures"'
echo "  [ok] /api/state"

curl -fsS "${BASE}/api/customers" | grep -q '^\['
echo "  [ok] /api/customers"

# 3. Snapshot CRUD round-trip
SNAP_ID="$(curl -fsS -X POST "${BASE}/api/snapshots" \
  -H 'content-type: application/json' \
  -d "{\"room_token\":\"${ROOM}\",\"name\":\"smoke\",\"state\":{\"figures\":[]}}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
echo "  [ok] POST /api/snapshots → ${SNAP_ID}"

curl -fsS "${BASE}/api/snapshots/${SNAP_ID}" | grep -q '"name":"smoke"'
echo "  [ok] GET /api/snapshots/:id"

curl -fsS "${BASE}/api/snapshots?room=${ROOM}" | grep -q "${SNAP_ID}"
echo "  [ok] GET /api/snapshots?room"

# 4. WS upgrade (uses python3 since curl can't do WS)
python3 - <<PY
import json, sys
import websocket           # pip install websocket-client
url = "${BASE}".replace("http://", "ws://").replace("https://", "wss://") + "/sync"
ws = websocket.create_connection(url, timeout=5)
ws.send(json.dumps({"type":"join","room":"${ROOM}"}))
msg = json.loads(ws.recv())
assert msg["type"] == "snapshot", f"expected snapshot, got {msg}"
print("  [ok] WS join → snapshot")
ws.close()
PY

echo "=== brett smoke test PASSED ==="
```

- [ ] **Step 2: Make executable + shellcheck**

```bash
chmod +x scripts/tests/brett.test.sh
shellcheck scripts/tests/brett.test.sh
```

- [ ] **Step 3: Register the test ID**

Open `tests/runner.sh` and locate where existing test IDs are listed. Add `FA-26` mapping to `scripts/tests/brett.test.sh` — match the pattern of the other entries (search for an existing entry like `FA-25` to copy the shape).

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/brett.test.sh tests/runner.sh
git commit -m "test(brett): FA-26 end-to-end smoke (HTTP+WS+snapshot CRUD)"
```

---

### Task 22: Build, deploy, and end-to-end smoke against dev

**Files:** none modified — verification only.

- [ ] **Step 1: Build and import**

```bash
task brett:build
```
Expected: docker build succeeds, k3d image import succeeds.

- [ ] **Step 2: Apply manifests and roll**

```bash
kubectl apply -k k3d/ --context k3d-dev
kubectl rollout restart deploy/website deploy/brett -n workspace --context k3d-dev
kubectl rollout status  deploy/brett   -n workspace --context k3d-dev
kubectl rollout status  deploy/website -n workspace --context k3d-dev
```
Expected: both deployments healthy.

- [ ] **Step 3: Run the smoke test**

```bash
BRETT_BASE=http://brett.localhost ./scripts/tests/brett.test.sh
```
Expected: `=== brett smoke test PASSED ===`.

- [ ] **Step 4: Register the bot in dev**

```bash
ENV=dev task brett:bot-setup
```
Expected: bot registered (or "already installed").

- [ ] **Step 5: End-to-end manual test**

1. Open Nextcloud Talk in dev (`http://files.localhost/index.php/apps/spreed/`).
2. In any conversation, type `/brett`.
3. Expected: bot replies with `🎯 Systemisches Brett: http://brett.localhost/?room=<token>`.
4. Click the link in two tabs; place a figure in tab 1; verify it appears in tab 2.
5. Save a snapshot from one tab; reload the page; confirm the figure is still there.

- [ ] **Step 6: Action an inbox item that creates a Talk room**

Through the admin UI, action an existing inbox item that provisions a Talk room. Open the resulting conversation. Expected: a chat message `🎯 Systemisches Brett für diese Sitzung: http://brett.localhost/?room=<token>` is present.

- [ ] **Step 7: No commit** — verification step.

---

### Task 23: Documentation

**Files:**
- Create: `docs-site/systemisches-brett.md`
- Modify: `docs-site/_sidebar.md`

- [ ] **Step 1: Write the user-facing doc**

```markdown
# Systemisches Brett

Das **Systemische Brett** ist ein 3D-Aufstellungsbrett, das direkt aus einer
Nextcloud-Talk-Sitzung heraus geöffnet werden kann. Beide Teilnehmer:innen
sehen jede Bewegung in Echtzeit.

## Brett öffnen

Es gibt zwei Wege:

**1. In jeder Talk-Konversation:** den Befehl `/brett` in den Chat schreiben.
Der Bot antwortet mit einem Link zum Brett. Beide Teilnehmer:innen klicken
diesen Link und landen im selben Raum.

**2. Bei geplanten Coaching-Sitzungen:** der Brett-Link wird automatisch
beim Erstellen des Termins in den Chat gepostet.

## Speichern und Laden

Das Brett kann jederzeit als **Snapshot** gespeichert werden — zum Beispiel
"vor Intervention" oder "Familienaufstellung 1".

- **Speichern**: Button „↓ Speichern". Klient:in (optional) und Name eingeben.
- **Laden**: Button „↑ Laden". Filter wählen (Klient oder aktueller Raum)
  und Snapshot anklicken.

Snapshots, die mit einem Klienten verknüpft sind, können in jedem späteren
Raum geladen werden. Snapshots ohne Klient sind nur im selben Raum
auffindbar.

## Status

Oben rechts in der Werkzeugleiste zeigt eine kleine Anzeige den
Verbindungsstatus an:

- **Verbunden ✓ — N Teilnehmer** — alles in Ordnung.
- **Verbindung getrennt — versuche neu …** — der Server stellt selbst neu
  zu (3 Sekunden). Wenn das nach mehreren Versuchen nicht klappt: Seite neu
  laden.

## Hinweise

- Das Brett wird laufend automatisch gespeichert. Wenn alle Teilnehmer:innen
  die Seite schließen und später wiederkommen, ist das letzte Bild noch da.
- Snapshots sind unveränderlich. Um eine Änderung dauerhaft festzuhalten,
  einfach einen neuen Snapshot mit angepasstem Namen speichern.
```

- [ ] **Step 2: Link from `_sidebar.md`**

Add an entry near the existing `Systembrett im Whiteboard` link:
```markdown
  - [Systemisches Brett (3D)](systemisches-brett)
```

- [ ] **Step 3: Apply the docs ConfigMap and restart docs**

```bash
kubectl apply -f k3d/docs-content/ -n workspace --context k3d-dev
kubectl rollout restart deploy/docs -n workspace --context k3d-dev
```

(Per the gotcha — ArgoCD doesn't auto-sync the docs ConfigMap.)

- [ ] **Step 4: Commit**

```bash
git add docs-site/systemisches-brett.md docs-site/_sidebar.md
git commit -m "docs(brett): user-facing guide"
```

---

### Task 24: Prepare prod rollout note in PR description

**Files:** none modified — checklist for the PR description.

When opening the PR, include this rollout checklist for prod environments:

```
## Prod rollout (per env: mentolder, korczewski)

After this PR merges:

1. task env:generate ENV=<env>
   task env:seal     ENV=<env>
   git commit -am "feat(brett): seal BRETT_BOT_SECRET for <env>"
   → PR + merge so SealedSecret carries BRETT_BOT_SECRET.

2. ArgoCD auto-syncs → brett pod comes up; shared-db postStart adds the new
   tables/column; website picks up BRETT_BOT_SECRET env.

3. kubectl rollout restart deploy/website -n workspace --context <env>
   (force website to re-read env if it didn't roll automatically).

4. ENV=<env> task brett:bot-setup
   (registers the Talk bot in this env).

5. Smoke test:
   - https://brett.<domain>/?room=test in two browsers; moves sync;
   - any Talk conversation, /brett → bot replies;
   - new admin inbox action that creates a Talk room → chat has the brett link;
   - kubectl rollout restart deploy/docs -n workspace --context <env>
     (docs ConfigMap update isn't auto-applied).
```

- [ ] **Step 1: No code change** — this is documentation that goes in the PR body when opening the PR after Task 22 is green.

---

## Self-Review

After writing this plan, I checked it against the spec.

**Spec coverage:**
- §2 Goals 1 (Talk-callable via slash + auto-post) → Tasks 17, 18.
- §2 Goals 2 (realtime) → Tasks 4, 5.
- §2 Goals 3 (persistence reconnect) → Task 5.
- §2 Goals 4 (snapshots linked to customers) → Tasks 9, 10 (HTML), 3 (API), 1 (schema).
- §2 Goals 5 (GitOps deploy, no docker-compose) → Tasks 12, 13, 14, 22.
- §5 Data model → Task 1.
- §6 Brett pod (HTTP+WS+persistence+shutdown) → Tasks 3, 4, 5, 6.
- §7.1 Bot webhook → Tasks 16, 17, 19.
- §7.2 Auto-post → Task 18 (with the spec refinement noted up top).
- §7.3 Secret → Task 11 (env), Task 15 (dev placeholder), Task 24 (prod rollout note).
- §7.4 Domains → Task 11.
- §8 HTML changes → Tasks 7, 8, 9, 10.
- §9 Files → coverage matches the file list verbatim.
- §10–11 Image build + Taskfile → Task 20.
- §12 Rollout sequence → Task 22 (dev) + Task 24 (prod note).
- §13 Tests → Task 21.
- §14 Documentation → Task 23.
- §16 Open items: hook site pinned in plan-time refinement; bot enabled `--feature all` in Task 19; cert-manager Ingress for prod is **not** in this plan (deliberately deferred to the prod-rollout PR alongside `env:seal` — adding a prod manifest before the dev shape is proven would be premature). NetworkPolicies in Task 14.

**Placeholder scan:** none of the forbidden patterns ("TBD", "implement later", "add error handling", "similar to Task N", "write tests for the above" without code) are present. Every code step has the actual code. Every command has its expected output where deterministic.

**Type/name consistency:**
- `applyingRemote`, `setStatus`, `participantCount`, `figToJSON`, `findFigById` defined in Task 8, used consistently in Tasks 9, 10.
- `claimBrettLinkPost` defined in Task 18 step 1, called in Task 18 step 3.
- `verifyTalkSignature`, `postBotReply` defined in Task 16, used in Task 17.
- `sendChatMessage` defined in Task 16 (in talk.ts), used in Task 18 (in action.ts).
- `applySnapshot`, `applyRemote` defined in Task 8, called in Task 10 (`loadSnapshot` calls `applySnapshot`).
- `BRETT_BOT_SECRET`, `BRETT_DOMAIN` env keys consistent across Tasks 11, 15, 17, 19, 24.
- `loadCustomers` cache helper defined in Task 9, reused in Task 10's `fillLoadFilter`.

**Scope check:** one cohesive feature — the brett pod plus its Talk integration. Could be split, but the integration is the point: shipping the pod without the Talk hooks gives you nothing useful. Keep as one plan.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-systemisches-brett.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
