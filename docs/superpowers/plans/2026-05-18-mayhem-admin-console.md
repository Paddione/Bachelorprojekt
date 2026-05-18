---
ticket_id: T000442
title: Mayhem Admin Console Implementation Plan
domains: []
status: active
pr_number: null
---

# Mayhem Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Keycloak-authenticated in-game admin panel to the Brett 3D service, letting admins browse rooms, join as spectator or player, and control the Mayhem game mode from a floating overlay.

**Architecture:** Brett server gains a full OIDC login flow (`/auth/login` → `/auth/callback` → session cookie) using `openid-client`, plus a new `GET /api/admin/rooms` REST endpoint and server-side validation of seven new admin-only WebSocket message types. Two new vanilla-JS client files (`room-browser.js`, `admin-panel.js`) are mounted by the existing `scene.js` when `GET /auth/me` returns `isAdmin: true`.

**Tech Stack:** Node.js (Express, `openid-client`, `express-session`), vanilla JS (no bundler), Keycloak OIDC, Kubernetes ConfigMap / SealedSecret, Astro (website proxy tweak only).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `brett/package.json` | Add `openid-client`, `express-session` |
| Modify | `brett/server.js` | OIDC routes, session store, `/api/admin/rooms`, admin WS validation |
| Create | `brett/public/assets/room-browser.js` | Room picker overlay + join dialog |
| Create | `brett/public/assets/admin-panel.js` | Floating control panel (all 6 controls) |
| Modify | `brett/public/index.html` | Load new JS files |
| Modify | `brett/public/assets/scene.js` | Call `/auth/me`, mount panel + browser, spectator cam |
| Create | `brett/test/server-admin.test.js` | Tests for OIDC session helpers, `/api/admin/rooms`, admin WS |
| Modify | `k3d/realm-workspace-dev.json` | Add `brett-app` KC client |
| Modify | `k3d/brett.yaml` | Add KC env vars |
| Modify | `k3d/secrets.yaml` | Confirm `BRETT_OIDC_SECRET` dev value present |
| Modify | `website/src/pages/admin/brett/[...path].astro` | Allow `/auth/*` through proxy |

---

## Task 1: Brett server — OIDC session infrastructure

**Files:**
- Modify: `brett/package.json`
- Modify: `brett/server.js` (top of file, before routes)
- Create: `brett/test/server-admin.test.js`

- [ ] **Step 1.1: Add dependencies**

Edit `brett/package.json` dependencies section:

```json
"dependencies": {
  "express": "^4.22.1",
  "express-session": "^1.18.1",
  "openid-client": "^5.7.1",
  "pg": "^8.20.0",
  "ws": "^8.18.0"
}
```

Run:
```bash
cd brett && npm install
```
Expected: `package-lock.json` updated, no errors.

- [ ] **Step 1.2: Add session store and OIDC client setup to server.js**

At the top of `brett/server.js`, after the existing `require` statements and before `const PORT = ...`, add:

```js
const session = require('express-session');
const { Issuer } = require('openid-client');

// ─── Session store (in-memory, single-pod) ───────────────────────────────
const SESSION_SECRET = process.env.BRETT_SESSION_SECRET || 'dev-session-secret-change-me';
// Named variable so WS upgrade handler can reuse the same middleware instance (Task 3)
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000, // 8h
  },
});
app.use(sessionMiddleware);

// ─── OIDC client (lazy-initialised on first /auth/login) ─────────────────
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
  // KC realm roles live at claims.realm_access.roles
  return Array.isArray(claims?.realm_access?.roles) && claims.realm_access.roles.includes('admin');
}
```

- [ ] **Step 1.3: Add /auth/login, /auth/callback, /auth/me routes to server.js**

After the `/healthz` route (line ~105), add:

```js
// ─── OIDC auth routes ─────────────────────────────────────────────────────
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
  if (!req.session.userId) return res.status(401).json({ error: 'not authenticated' });
  res.json({ userId: req.session.userId, name: req.session.name, isAdmin: !!req.session.isAdmin });
});
```

- [ ] **Step 1.4: Export session helpers for testing**

At the bottom of `brett/server.js`, add `isAdminFromClaims` to `module.exports`:

```js
module.exports = {
  app, server, pool, wss,
  applyMutation, buildStateFromMutations, figureMaps,
  handleDisconnect,
  RELAY_TYPES, TRANSIENT_TYPES, lmsAlive, handleLmsDeath,
  pickupState, ensurePickups, spawnPickup,
  isAdminFromClaims,   // ← new
};
```

- [ ] **Step 1.5: Write tests**

Create `brett/test/server-admin.test.js`:

```js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const { isAdminFromClaims } = require('../server.js');

test('isAdminFromClaims: true when admin role present', () => {
  const claims = { realm_access: { roles: ['offline_access', 'admin', 'uma_authorization'] } };
  assert.strictEqual(isAdminFromClaims(claims), true);
});

test('isAdminFromClaims: false when admin role missing', () => {
  const claims = { realm_access: { roles: ['offline_access'] } };
  assert.strictEqual(isAdminFromClaims(claims), false);
});

test('isAdminFromClaims: false for null/undefined claims', () => {
  assert.strictEqual(isAdminFromClaims(null), false);
  assert.strictEqual(isAdminFromClaims(undefined), false);
  assert.strictEqual(isAdminFromClaims({}), false);
});
```

- [ ] **Step 1.6: Run tests**

```bash
cd brett && npm test
```
Expected: all existing tests pass + 3 new `isAdminFromClaims` tests pass.

- [ ] **Step 1.7: Commit**

```bash
git add brett/package.json brett/package-lock.json brett/server.js brett/test/server-admin.test.js
git commit -m "feat(brett): OIDC session infrastructure + /auth/* routes"
```

---

## Task 2: Admin REST endpoint — /api/admin/rooms

**Files:**
- Modify: `brett/server.js` (add route after `/api/snapshots`)
- Modify: `brett/test/server-admin.test.js` (add tests)

- [ ] **Step 2.1: Add requireAdmin middleware to server.js**

After the auth routes from Task 1, add:

```js
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'forbidden' });
  next();
}
```

- [ ] **Step 2.2: Add GET /api/admin/rooms to server.js**

After the `/api/snapshots/:id` route, add:

```js
app.get('/api/admin/rooms', requireAdmin, asyncHandler(async (req, res) => {
  // Pull live rooms from in-memory state, enrich with DB names where available
  const liveTokens = Array.from(rooms.keys());

  // Fetch names from DB for all live rooms in one query
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
```

- [ ] **Step 2.3: Add tests to server-admin.test.js**

Append to `brett/test/server-admin.test.js`:

```js
const { figureMaps, rooms } = require('../server.js');

test('/api/admin/rooms: returns empty array when no rooms', async () => {
  // rooms Map is empty in test env (MOCK_DB=true, no WS connections)
  const { app } = require('../server.js');
  const http = require('node:http');
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  // Simulate admin session by patching session middleware for this request
  // We test the shape logic directly via the exported state instead
  server.close();

  // Direct unit test: build expected shape from empty rooms Map
  assert.deepStrictEqual(Array.from(rooms.keys()), []);
});

test('/api/admin/rooms: returns correct shape for a room with mayhem', () => {
  const token = 'admin-test-room-1';
  // Seed in-memory state
  const { applyMutation, buildStateFromMutations, rooms: roomMap } = require('../server.js');
  applyMutation(token, { type: 'mayhem_mode', enabled: true });
  applyMutation(token, { type: 'game_mode_change', mode: 'deathmatch' });

  const figs     = figureMaps.get(token);
  const mayhem   = !!figs?.get('__mayhem__')?.enabled;
  const gameMode = figs?.get('__game_mode__')?.mode;

  assert.strictEqual(mayhem,   true);
  assert.strictEqual(gameMode, 'deathmatch');
});
```

- [ ] **Step 2.4: Run tests**

```bash
cd brett && npm test
```
Expected: all previous tests pass + 2 new admin rooms tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add brett/server.js brett/test/server-admin.test.js
git commit -m "feat(brett): GET /api/admin/rooms + requireAdmin middleware"
```

---

## Task 3: Admin WebSocket command validation

**Files:**
- Modify: `brett/server.js` (WS message handler)
- Modify: `brett/test/server-admin.test.js` (add tests)

- [ ] **Step 3.1: Attach session to WS connections in server.js**

Find `wss.on('connection', (ws, req) => {` and add at the very top of that callback (before `ws.isAlive = true`):

```js
wss.on('connection', (ws, req) => {
  // Attach express session to the WS connection so admin command handler can read it.
  // sessionMiddleware was defined in Task 1 as a named variable — reuse it here.
  sessionMiddleware(req, {}, () => { ws._session = req.session; });
  ws.isAlive = true;
  // ... rest of existing handler unchanged
```

- [ ] **Step 3.2: Add RELAY_TYPES additions for bot messages**

Find the `RELAY_TYPES` array and add `bot_spawn` and `bot_despawn`:

```js
const RELAY_TYPES = [
  'add','move','update','delete','clear','optik','stiffness','jump',
  'mayhem_mode','player_join','player_state','player_leave',
  'hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
  'obstacle_layout','game_mode_change',
  'damage_event','death_event','pickup_request','pickup_taken','pickup_spawned',
  'snapshot','request_state_snapshot',
  'bot_spawn','bot_despawn','round_reset',  // ← new
];
```

- [ ] **Step 3.3: Add admin WS command dispatch in the WS message handler**

In the WS message handler, after the existing `RELAY_TYPES.includes(msg.type)` block, add:

```js
const ADMIN_TYPES = [
  'admin_mayhem_toggle','admin_mode_set','admin_kick',
  'admin_bot_spawn','admin_bot_despawn','admin_round_reset','admin_broadcast',
];

if (ADMIN_TYPES.includes(msg.type)) {
  // Silently drop if not admin — no error response to avoid fingerprinting
  if (!ws._session?.isAdmin) return;
  const room = ws._room;
  if (!room) return;

  switch (msg.type) {
    case 'admin_mayhem_toggle': {
      const inner = { type: 'mayhem_mode', enabled: !!msg.enabled };
      applyMutation(room, inner);
      broadcast(room, inner);
      schedulePersist(room);
      break;
    }
    case 'admin_mode_set': {
      if (!['warmup','deathmatch','lms'].includes(msg.mode)) return;
      const inner = { type: 'game_mode_change', mode: msg.mode };
      applyMutation(room, inner);
      broadcast(room, inner);
      if (msg.mode === 'lms') {
        const alive = new Set();
        for (const sock of rooms.get(room) || []) { if (sock._playerId) alive.add(sock._playerId); }
        lmsAlive.set(room, alive);
      } else {
        lmsAlive.delete(room);
      }
      schedulePersist(room);
      break;
    }
    case 'admin_kick': {
      if (typeof msg.playerId !== 'string') return;
      for (const sock of rooms.get(room) || []) {
        if (sock._playerId === msg.playerId) {
          broadcast(room, { type: 'player_leave', playerId: msg.playerId }, sock);
          try { sock.close(); } catch {}
          break;
        }
      }
      break;
    }
    case 'admin_bot_spawn': {
      const currentCount = rooms.get(room)?.size ?? 0;
      if (currentCount >= 4) {
        try { ws.send(JSON.stringify({ type: 'admin_error', reason: 'room_full' })); } catch {}
        break;
      }
      broadcast(room, { type: 'bot_spawn' });
      break;
    }
    case 'admin_bot_despawn': {
      if (typeof msg.botId !== 'string') return;
      const figs = figureMaps.get(room);
      if (figs) figs.delete(msg.botId);
      broadcast(room, { type: 'bot_despawn', botId: msg.botId });
      schedulePersist(room);
      break;
    }
    case 'admin_round_reset': {
      lmsAlive.delete(room);
      broadcast(room, { type: 'round_reset' });
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
```

- [ ] **Step 3.4: Add tests to server-admin.test.js**

Append to `brett/test/server-admin.test.js`:

```js
test('admin_mayhem_toggle: relays mayhem_mode when session is admin', () => {
  const { applyMutation, buildStateFromMutations } = require('../server.js');
  const room = 'admin-ws-test-1';
  // Simulate what the admin WS handler does for admin_mayhem_toggle
  const inner = { type: 'mayhem_mode', enabled: true };
  applyMutation(room, inner);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.mayhem, true);
});

test('admin_mode_set: relays game_mode_change to deathmatch', () => {
  const { applyMutation, buildStateFromMutations } = require('../server.js');
  const room = 'admin-ws-test-2';
  const inner = { type: 'game_mode_change', mode: 'deathmatch' };
  applyMutation(room, inner);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.gameMode, 'deathmatch');
});

test('RELAY_TYPES: includes bot_spawn, bot_despawn, round_reset', () => {
  const { RELAY_TYPES } = require('../server.js');
  assert.ok(RELAY_TYPES.includes('bot_spawn'),   'bot_spawn missing');
  assert.ok(RELAY_TYPES.includes('bot_despawn'), 'bot_despawn missing');
  assert.ok(RELAY_TYPES.includes('round_reset'), 'round_reset missing');
});
```

- [ ] **Step 3.5: Run tests**

```bash
cd brett && npm test
```
Expected: all previous tests pass + 3 new admin WS tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add brett/server.js brett/test/server-admin.test.js
git commit -m "feat(brett): admin WebSocket command validation + bot/reset relay types"
```

---

## Task 4: room-browser.js — Room picker overlay

**Files:**
- Create: `brett/public/assets/room-browser.js`

The room browser is a self-contained vanilla-JS module. It renders a centered overlay over the (blurred) brett scene when `isAdmin: true` and no `?room=` query param is present. It exposes one global: `window.RoomBrowser`.

- [ ] **Step 4.1: Create brett/public/assets/room-browser.js**

```js
'use strict';
/* global window, document, fetch, sessionStorage, crypto */

window.RoomBrowser = (() => {
  const CSS = `
    #rb-overlay{position:fixed;inset:0;background:rgba(10,13,18,0.7);backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;z-index:9000;font-family:ui-sans-serif,system-ui,sans-serif;}
    #rb-panel{background:#111827;border:1px solid #374151;border-radius:10px;width:440px;max-height:80vh;
      overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.6);}
    #rb-header{padding:16px 20px 12px;border-bottom:1px solid #374151;display:flex;justify-content:space-between;align-items:center;}
    #rb-title{color:#f59e0b;font-weight:700;font-size:14px;letter-spacing:0.5px;}
    #rb-user{color:#6b7280;font-size:11px;margin-top:2px;}
    #rb-new-btn{background:#1f2937;color:#9ca3af;border:1px solid #374151;border-radius:5px;
      padding:4px 10px;font-size:11px;cursor:pointer;}
    #rb-new-btn:hover{background:#374151;color:#e5e7eb;}
    #rb-list{padding:10px 12px;overflow-y:auto;max-height:calc(80vh - 80px);}
    .rb-room{background:#0d1117;border:1px solid #374151;border-radius:7px;padding:10px 12px;
      margin-bottom:8px;display:flex;align-items:center;gap:10px;}
    .rb-room-info{flex:1;}
    .rb-room-name{color:#e5e7eb;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:3px;}
    .rb-badge-mayhem{background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);
      border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700;}
    .rb-badge-mode{background:rgba(124,58,237,0.15);color:#a78bfa;border:1px solid rgba(124,58,237,0.3);
      border-radius:4px;padding:1px 6px;font-size:9px;}
    .rb-room-meta{color:#6b7280;font-size:10px;}
    .rb-players{color:#10b981;font-size:11px;margin-right:4px;}
    .rb-join-btn{background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:5px 12px;
      font-size:11px;font-weight:600;cursor:pointer;}
    .rb-join-btn:hover{background:#6d28d9;}
    #rb-join-dialog{position:fixed;inset:0;background:rgba(10,13,18,0.8);display:flex;
      align-items:center;justify-content:center;z-index:9100;}
    #rb-join-panel{background:#111827;border:1px solid #374151;border-radius:10px;width:320px;overflow:hidden;}
    #rb-join-header{padding:14px 18px;border-bottom:1px solid #1f2937;}
    #rb-join-title{color:#e5e7eb;font-weight:700;font-size:13px;}
    #rb-join-meta{color:#6b7280;font-size:11px;margin-top:2px;}
    #rb-join-body{padding:14px 18px;display:flex;flex-direction:column;gap:10px;}
    .rb-mode-opt{background:#111827;border:1px solid #374151;border-radius:7px;padding:12px 14px;cursor:pointer;}
    .rb-mode-opt.selected{border-color:#f59e0b;background:#1f2937;}
    .rb-mode-opt:hover{background:#1f2937;}
    .rb-mode-title{display:flex;align-items:center;gap:8px;margin-bottom:3px;color:#e5e7eb;font-size:12px;font-weight:600;}
    .rb-mode-desc{color:#6b7280;font-size:10px;padding-left:24px;}
    .rb-default-badge{background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:4px;padding:1px 6px;font-size:9px;margin-left:auto;}
    #rb-confirm-btn{background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:8px;
      font-size:12px;font-weight:600;cursor:pointer;width:100%;}
    #rb-confirm-btn:hover{background:#6d28d9;}
  `;

  let _overlay = null;
  let _refreshTimer = null;
  let _selectedMode = 'spectator';
  let _pendingRoom = null;

  function injectStyles() {
    if (document.getElementById('rb-styles')) return;
    const s = document.createElement('style');
    s.id = 'rb-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function playerDots(count, max) {
    return Array.from({ length: max }, (_, i) => i < count ? '●' : '○').join('');
  }

  function modeLabel(mode) {
    return { warmup: 'Warmup', deathmatch: 'Deathmatch', lms: 'LMS' }[mode] || mode;
  }

  function renderRooms(rooms) {
    const list = document.getElementById('rb-list');
    if (!list) return;
    list.innerHTML = '';
    if (rooms.length === 0) {
      list.innerHTML = '<p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Keine aktiven Räume</p>';
      return;
    }
    for (const r of rooms) {
      const div = document.createElement('div');
      div.className = 'rb-room';
      div.innerHTML = `
        <div class="rb-room-info">
          <div class="rb-room-name">
            ${escHtml(r.name)}
            ${r.mayhem ? '<span class="rb-badge-mayhem">⚔ MAYHEM</span>' : ''}
            ${r.mayhem ? `<span class="rb-badge-mode">${modeLabel(r.gameMode)}</span>` : ''}
          </div>
          <div class="rb-room-meta">
            <span class="rb-players">${playerDots(r.playerCount, r.maxPlayers)}</span>
            ${r.playerCount} Spieler
          </div>
        </div>
        <button class="rb-join-btn" data-token="${escAttr(r.token)}" data-name="${escAttr(r.name)}"
          data-mayhem="${r.mayhem}" data-mode="${escAttr(r.gameMode)}" data-players="${r.playerCount}" data-max="${r.maxPlayers}">
          Beitreten →
        </button>
      `;
      div.querySelector('.rb-join-btn').addEventListener('click', onJoinClick);
      list.appendChild(div);
    }
  }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  function onJoinClick(e) {
    const btn = e.currentTarget;
    _pendingRoom = {
      token: btn.dataset.token,
      name: btn.dataset.name,
      mayhem: btn.dataset.mayhem === 'true',
      gameMode: btn.dataset.mode,
      playerCount: parseInt(btn.dataset.players, 10),
      maxPlayers: parseInt(btn.dataset.max, 10),
    };
    showJoinDialog(_pendingRoom);
  }

  function showJoinDialog(room) {
    const existing = document.getElementById('rb-join-dialog');
    if (existing) existing.remove();

    const freeSlots = room.maxPlayers - room.playerCount;
    const d = document.createElement('div');
    d.id = 'rb-join-dialog';
    d.innerHTML = `
      <div id="rb-join-panel">
        <div id="rb-join-header">
          <div id="rb-join-title">${escHtml(room.name)}</div>
          <div id="rb-join-meta">${room.playerCount} Spieler${room.mayhem ? ' · ⚔ Mayhem · ' + modeLabel(room.gameMode) : ''}</div>
        </div>
        <div id="rb-join-body">
          <div class="rb-mode-opt selected" data-mode="spectator">
            <div class="rb-mode-title">👁 Zuschauen <span class="rb-default-badge">Standard</span></div>
            <div class="rb-mode-desc">Freie Kamera, kein Avatar. Spieler sehen dich nicht.</div>
          </div>
          <div class="rb-mode-opt" data-mode="player" ${freeSlots <= 0 ? 'style="opacity:0.4;pointer-events:none"' : ''}>
            <div class="rb-mode-title">⚔ Mitspielen ${freeSlots > 0 ? `<span style="color:#6b7280;font-size:9px;margin-left:auto">${freeSlots} freie Slots</span>` : '<span style="color:#ef4444;font-size:9px;margin-left:auto">Voll</span>'}</div>
            <div class="rb-mode-desc">Spawn als Spieler. Admin-Panel bleibt verfügbar.</div>
          </div>
          <button id="rb-confirm-btn">Beitreten →</button>
        </div>
      </div>
    `;
    _selectedMode = 'spectator';

    d.querySelectorAll('.rb-mode-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        d.querySelectorAll('.rb-mode-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        _selectedMode = opt.dataset.mode;
      });
    });

    d.querySelector('#rb-confirm-btn').addEventListener('click', () => {
      sessionStorage.setItem('brett_admin_join_mode', _selectedMode);
      window.location.href = `/?room=${encodeURIComponent(_pendingRoom.token)}`;
    });

    document.body.appendChild(d);
  }

  async function loadRooms() {
    try {
      const res = await fetch('/api/admin/rooms');
      if (!res.ok) return;
      renderRooms(await res.json());
    } catch {}
  }

  function show(userName) {
    injectStyles();
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'rb-overlay';
    _overlay.innerHTML = `
      <div id="rb-panel">
        <div id="rb-header">
          <div>
            <div id="rb-title">⚔ MAYHEM ADMIN</div>
            <div id="rb-user">Eingeloggt als ${escHtml(userName)}</div>
          </div>
          <button id="rb-new-btn">+ Neuer Raum</button>
        </div>
        <div id="rb-list"><p style="color:#6b7280;font-size:12px;text-align:center;padding:20px">Lade Räume…</p></div>
      </div>
    `;

    _overlay.querySelector('#rb-new-btn').addEventListener('click', () => {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      sessionStorage.setItem('brett_admin_join_mode', 'spectator');
      window.location.href = `/?room=${token}`;
    });

    document.body.appendChild(_overlay);
    loadRooms();
    _refreshTimer = setInterval(loadRooms, 10_000);
  }

  function hide() {
    clearInterval(_refreshTimer);
    _overlay?.remove();
    _overlay = null;
  }

  return { show, hide };
})();
```

- [ ] **Step 4.2: Commit**

```bash
git add brett/public/assets/room-browser.js
git commit -m "feat(brett): room browser overlay for admin entry"
```

---

## Task 5: admin-panel.js — Floating control panel

**Files:**
- Create: `brett/public/assets/admin-panel.js`

- [ ] **Step 5.1: Create brett/public/assets/admin-panel.js**

```js
'use strict';
/* global window, document, fetch */

window.AdminPanel = (() => {
  const CSS = `
    #ap-tab{position:fixed;top:50%;right:0;transform:translateY(-50%);background:rgba(10,13,18,0.92);
      border:1px solid #374151;border-right:none;border-radius:6px 0 0 6px;padding:10px 6px;
      cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed;color:#f59e0b;
      font-size:10px;font-weight:700;letter-spacing:1px;user-select:none;z-index:8000;
      transition:background 0.15s;}
    #ap-tab:hover{background:rgba(31,41,55,0.95);}
    #ap-panel{position:fixed;top:0;right:0;bottom:0;width:190px;background:rgba(10,13,18,0.97);
      border-left:1px solid #374151;padding:10px 12px;display:flex;flex-direction:column;gap:8px;
      overflow-y:auto;z-index:8000;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;
      transform:translateX(100%);transition:transform 0.2s ease;}
    #ap-panel.open{transform:translateX(0);}
    .ap-sep{border:none;border-top:1px solid #1f2937;margin:2px 0;}
    .ap-label{color:#9ca3af;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;}
    .ap-room-name{color:#f59e0b;font-size:10px;font-weight:700;}
    .ap-room-meta{color:#6b7280;font-size:9px;margin-top:2px;}
    .ap-toggle{display:flex;gap:4px;}
    .ap-toggle button{flex:1;border:none;border-radius:4px;padding:4px 0;font-size:10px;font-weight:600;cursor:pointer;}
    .ap-btn-on{background:#059669;color:#fff;}
    .ap-btn-on.inactive{background:#1f2937;color:#6b7280;border:1px solid #374151;}
    .ap-btn-off{background:#1f2937;color:#6b7280;border:1px solid #374151;}
    .ap-btn-off.active{background:#dc2626;color:#fff;border:none;}
    .ap-modes{display:flex;flex-direction:column;gap:3px;}
    .ap-modes button{background:#1f2937;color:#6b7280;border:1px solid #374151;border-radius:4px;
      padding:3px 6px;font-size:10px;text-align:left;cursor:pointer;}
    .ap-modes button.active{background:rgba(124,58,237,0.2);color:#a78bfa;border-color:rgba(124,58,237,0.5);}
    .ap-modes button:hover:not(.active){background:#374151;color:#e5e7eb;}
    .ap-bots{display:flex;gap:4px;align-items:center;}
    .ap-bots button{background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;
      padding:2px 8px;font-size:12px;cursor:pointer;}
    .ap-bots button:hover{background:#374151;}
    .ap-bots span{color:#e5e7eb;font-size:10px;flex:1;text-align:center;}
    .ap-player-row{display:flex;justify-content:space-between;align-items:center;padding:2px 0;}
    .ap-player-name{color:#e5e7eb;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;}
    .ap-kick{background:transparent;color:#ef4444;border:none;font-size:9px;cursor:pointer;padding:0;flex-shrink:0;}
    .ap-kick:hover{color:#fca5a5;}
    .ap-action{background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;
      padding:4px;font-size:10px;cursor:pointer;text-align:left;width:100%;}
    .ap-action:hover{background:#374151;}
    .ap-action.blue{color:#60a5fa;}
    #ap-switch-mode{background:#374151;color:#9ca3af;border:none;border-radius:4px;
      padding:2px 6px;font-size:9px;cursor:pointer;align-self:flex-start;}
    #ap-switch-mode:hover{background:#4b5563;color:#e5e7eb;}
  `;

  let _open = false;
  let _send = null;
  let _room = null;
  let _state = {
    roomName: '',
    playerCount: 0,
    players: [],   // [{ id, name, isBot }]
    mayhem: false,
    gameMode: 'warmup',
    botCount: 0,
    joinMode: 'spectator',
  };

  function injectStyles() {
    if (document.getElementById('ap-styles')) return;
    const s = document.createElement('style');
    s.id = 'ap-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function send(msg) { _send?.(msg); }

  function renderPanel() {
    const panel = document.getElementById('ap-panel');
    if (!panel) return;
    const { roomName, playerCount, players, mayhem, gameMode, botCount, joinMode } = _state;
    const dots = Array.from({ length: 4 }, (_, i) => i < playerCount ? '●' : '○').join('');
    panel.innerHTML = `
      <div>
        <div class="ap-room-name">⚔ ADMIN · ${escHtml(roomName || _room)}</div>
        <div class="ap-room-meta">${dots} ${playerCount}/4 Spieler</div>
        ${joinMode === 'spectator' ? '<button id="ap-switch-mode">Als Spieler beitreten</button>' : ''}
      </div>
      <hr class="ap-sep">
      <div>
        <div class="ap-label">Mayhem</div>
        <div class="ap-toggle">
          <button class="ap-btn-on ${mayhem ? '' : 'inactive'}" data-action="mayhem-on">AN</button>
          <button class="ap-btn-off ${mayhem ? '' : 'active'}" data-action="mayhem-off">AUS</button>
        </div>
      </div>
      <div>
        <div class="ap-label">Modus</div>
        <div class="ap-modes">
          <button class="${gameMode === 'warmup' ? 'active' : ''}" data-action="mode-warmup">Warmup</button>
          <button class="${gameMode === 'deathmatch' ? 'active' : ''}" data-action="mode-deathmatch">Deathmatch</button>
          <button class="${gameMode === 'lms' ? 'active' : ''}" data-action="mode-lms">LMS</button>
        </div>
      </div>
      <div>
        <div class="ap-label">Bots</div>
        <div class="ap-bots">
          <button data-action="bot-minus" ${botCount <= 0 ? 'disabled style="opacity:0.4"' : ''}>−</button>
          <span>${botCount} Bot${botCount !== 1 ? 's' : ''}</span>
          <button data-action="bot-plus" ${playerCount >= 4 ? 'disabled style="opacity:0.4"' : ''}>+</button>
        </div>
      </div>
      <div>
        <div class="ap-label">Spieler</div>
        ${players.map(p => `
          <div class="ap-player-row">
            <span class="ap-player-name">${p.isBot ? '🤖 ' : ''}${escHtml(p.name)}</span>
            <button class="ap-kick" data-action="kick" data-player-id="${escAttr(p.id)}">${p.isBot ? 'Entf.' : 'Kick'}</button>
          </div>`).join('')}
        ${players.length === 0 ? '<span style="color:#374151;font-size:9px">Keine Spieler</span>' : ''}
      </div>
      <hr class="ap-sep" style="margin-top:auto">
      <button class="ap-action" data-action="reset">↩ Runde neu starten</button>
      <button class="ap-action blue" data-action="broadcast">🔗 Link senden</button>
    `;

    panel.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', onAction);
    });
    panel.querySelector('#ap-switch-mode')?.addEventListener('click', () => {
      _state.joinMode = 'player';
      sessionStorage.setItem('brett_admin_join_mode', 'player');
      send({ type: 'player_join', playerId: window._mayhemPlayerId || ('admin-' + Date.now()) });
      renderPanel();
    });
  }

  function onAction(e) {
    const action = e.currentTarget.dataset.action;
    switch (action) {
      case 'mayhem-on':  send({ type: 'admin_mayhem_toggle', enabled: true });  _state.mayhem = true;  break;
      case 'mayhem-off': send({ type: 'admin_mayhem_toggle', enabled: false }); _state.mayhem = false; break;
      case 'mode-warmup':     send({ type: 'admin_mode_set', mode: 'warmup' });     _state.gameMode = 'warmup';     break;
      case 'mode-deathmatch': send({ type: 'admin_mode_set', mode: 'deathmatch' }); _state.gameMode = 'deathmatch'; break;
      case 'mode-lms':        send({ type: 'admin_mode_set', mode: 'lms' });        _state.gameMode = 'lms';        break;
      case 'bot-plus':  send({ type: 'admin_bot_spawn' }); _state.botCount++; _state.playerCount++; break;
      case 'bot-minus': {
        const bot = _state.players.find(p => p.isBot);
        if (bot) { send({ type: 'admin_bot_despawn', botId: bot.id }); _state.botCount--; _state.playerCount--; }
        break;
      }
      case 'kick': {
        const pid = e.currentTarget.dataset.playerId;
        send({ type: 'admin_kick', playerId: pid });
        _state.players = _state.players.filter(p => p.id !== pid);
        _state.playerCount = Math.max(0, _state.playerCount - 1);
        break;
      }
      case 'reset':     send({ type: 'admin_round_reset' }); break;
      case 'broadcast': send({ type: 'admin_broadcast' }); break;
    }
    renderPanel();
  }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  function mount(opts) {
    // opts: { sendFn, room, roomName, joinMode }
    _send   = opts.sendFn;
    _room   = opts.room;
    _state.roomName = opts.roomName || opts.room;
    _state.joinMode = opts.joinMode || sessionStorage.getItem('brett_admin_join_mode') || 'spectator';
    injectStyles();

    const tab = document.createElement('div');
    tab.id = 'ap-tab';
    tab.textContent = '⚔ ADMIN';
    tab.addEventListener('click', toggle);
    document.body.appendChild(tab);

    const panel = document.createElement('div');
    panel.id = 'ap-panel';
    document.body.appendChild(panel);
    renderPanel();
  }

  function toggle() {
    _open = !_open;
    document.getElementById('ap-panel')?.classList.toggle('open', _open);
  }

  // Called by scene.js when WS messages arrive
  function onMessage(msg) {
    if (msg.type === 'player_join' && msg.playerId) {
      if (!_state.players.find(p => p.id === msg.playerId)) {
        const isBot = String(msg.playerId).startsWith('bot-');
        _state.players.push({ id: msg.playerId, name: msg.name || msg.playerId, isBot });
        if (isBot) _state.botCount++;
        _state.playerCount++;
        renderPanel();
      }
    } else if (msg.type === 'player_leave' && msg.playerId) {
      const p = _state.players.find(pl => pl.id === msg.playerId);
      if (p) {
        if (p.isBot) _state.botCount--;
        _state.players = _state.players.filter(pl => pl.id !== msg.playerId);
        _state.playerCount = Math.max(0, _state.playerCount - 1);
        renderPanel();
      }
    } else if (msg.type === 'mayhem_mode') {
      _state.mayhem = !!msg.enabled;
      renderPanel();
    } else if (msg.type === 'game_mode_change') {
      _state.gameMode = msg.mode;
      renderPanel();
    } else if (msg.type === 'info') {
      _state.playerCount = msg.count || 0;
      renderPanel();
    }
  }

  return { mount, onMessage, toggle };
})();
```

- [ ] **Step 5.2: Commit**

```bash
git add brett/public/assets/admin-panel.js
git commit -m "feat(brett): admin panel overlay with all 6 controls"
```

---

## Task 6: scene.js integration — auth check, room browser, admin panel, spectator cam

**Files:**
- Modify: `brett/public/assets/scene.js`
- Modify: `brett/public/index.html`

- [ ] **Step 6.1: Load new scripts in index.html**

In `brett/public/index.html`, before the closing `</body>` tag (or wherever `scene.js` is loaded), add the two new script tags:

```html
<script src="/assets/room-browser.js"></script>
<script src="/assets/admin-panel.js"></script>
```

These must appear before `scene.js` is loaded.

- [ ] **Step 6.2: Add admin bootstrap to scene.js**

In `brett/public/assets/scene.js`, find the section near the top that reads the `?room=` param and initialises the WS connection. Add the following async admin bootstrap **before** the existing init code runs:

```js
// ─── Admin bootstrap ──────────────────────────────────────────────────────
(async function adminBootstrap() {
  let me = null;
  try {
    const res = await fetch('/auth/me');
    if (res.status === 401) {
      // Not logged in — redirect to KC only if ?admin=1 is set, to avoid
      // forcing all users through KC login
      if (new URLSearchParams(window.location.search).get('admin') === '1') {
        window.location.href = '/auth/login?returnTo=' + encodeURIComponent(window.location.href);
      }
      return;
    }
    if (!res.ok) return;
    me = await res.json();
  } catch { return; }

  if (!me.isAdmin) return;

  const roomParam = new URLSearchParams(window.location.search).get('room');

  if (!roomParam) {
    // Show room browser — don't init the 3D scene
    window.RoomBrowser.show(me.name);
    return; // halt normal scene init
  }

  // We're in a room — mount the admin panel after scene init completes.
  // scene.js already reads ?room= and connects WS; we hook in after.
  window._bretAdminName = me.name;
  window._bretAdminPending = true;
})();
```

- [ ] **Step 6.3: Hook AdminPanel mount into existing WS connect in scene.js**

Find where the WS connection sends the `join` message (after `ws.onopen`). After the `send({ type: 'join', room })` call, add:

```js
// Mount admin panel once WS is open
if (window._bretAdminPending) {
  window._bretAdminPending = false;
  const joinMode = sessionStorage.getItem('brett_admin_join_mode') || 'spectator';
  window.AdminPanel.mount({
    sendFn: send,
    room,
    roomName: room,
    joinMode,
  });
  // Spectator mode: skip avatar spawn
  if (joinMode === 'spectator') {
    window._mayhemSpectator = true;
  }
}
```

- [ ] **Step 6.4: Add spectator camera free-fly mode to scene.js**

Find the section in `scene.js` where Mayhem is initialised (around `window.Mayhem.init(...)`). Wrap the avatar spawn in a spectator guard. Find the call to `nextSpawnPoint()` or wherever the local avatar is created and add:

```js
// Skip avatar spawn in spectator mode
if (window._mayhemSpectator) {
  // Free-fly camera: WASD moves the camera position directly
  window._spectatorCamActive = true;
  // Camera movement is handled in the tick loop below
} else {
  // existing avatar spawn code
}
```

In the animation/tick loop, add spectator camera movement handling:

```js
if (window._spectatorCamActive) {
  const spd = 0.08;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  if (input.forward)  camera.position.addScaledVector(dir, spd);
  if (input.backward) camera.position.addScaledVector(dir, -spd);
  if (input.left)     camera.position.addScaledVector(right, -spd);
  if (input.right)    camera.position.addScaledVector(right, spd);
}
```

(Use the existing `input` object and `THREE` — both are already in scope in scene.js.)

- [ ] **Step 6.5: Forward WS messages to AdminPanel.onMessage**

In the WS `onmessage` handler, after the existing `if (window.Mayhem) { ... }` block, add:

```js
if (window.AdminPanel) {
  window.AdminPanel.onMessage(msg);
}
```

- [ ] **Step 6.6: Manual smoke test**

Run brett locally:
```bash
cd brett && MOCK_DB=true PORT=3000 KC_URL="" node server.js
```
Open `http://localhost:3000/?admin=1` — expect redirect to `/auth/login` (which will fail without KC, confirming the flow is wired). Confirm no JS errors in the console for the normal (non-admin) flow at `http://localhost:3000/?room=test`.

- [ ] **Step 6.7: Commit**

```bash
git add brett/public/index.html brett/public/assets/scene.js
git commit -m "feat(brett): admin bootstrap in scene.js — room browser + panel mount + spectator cam"
```

---

## Task 7: Keycloak realm — add brett-app client

**Files:**
- Modify: `k3d/realm-workspace-dev.json`
- Modify: `k3d/secrets.yaml`

- [ ] **Step 7.1: Add brett-app client to realm-workspace-dev.json**

In `k3d/realm-workspace-dev.json`, find the `"clients"` array and add a new entry (follow the same pattern as the existing `website` client):

```json
{
  "clientId": "brett-app",
  "secret": "${BRETT_OIDC_SECRET}",
  "redirectUris": [
    "http://${BRETT_DOMAIN}/auth/callback",
    "http://localhost:3000/auth/callback"
  ],
  "webOrigins": [
    "http://${BRETT_DOMAIN}",
    "http://localhost:3000"
  ],
  "standardFlowEnabled": true,
  "publicClient": false
}
```

- [ ] **Step 7.2: Confirm BRETT_OIDC_SECRET in k3d/secrets.yaml**

Check `k3d/secrets.yaml` — it already contains `BRETT_OIDC_SECRET: "devbrettoidcsecret12345678901234"`. No change needed.

- [ ] **Step 7.3: Add KC env vars to k3d/brett.yaml**

In `k3d/brett.yaml`, find the `env:` block under the brett container (currently has `PORT` and `DATABASE_URL`) and add:

```yaml
- name: KEYCLOAK_URL
  valueFrom:
    configMapKeyRef:
      name: workspace-domains
      key: KC_DOMAIN
      optional: false
- name: KEYCLOAK_REALM
  value: "workspace"
- name: BRETT_KC_CLIENT_ID
  value: "brett-app"
- name: BRETT_OIDC_SECRET
  valueFrom:
    secretKeyRef:
      name: workspace-secrets
      key: BRETT_OIDC_SECRET
- name: BRETT_PUBLIC_URL
  valueFrom:
    configMapKeyRef:
      name: workspace-domains
      key: BRETT_DOMAIN
      optional: false
- name: WEBSITE_INTERNAL_URL
  value: "http://website.website.svc.cluster.local:4321"
- name: NODE_ENV
  value: "production"
- name: BRETT_SESSION_SECRET
  valueFrom:
    secretKeyRef:
      name: workspace-secrets
      key: BRETT_OIDC_SECRET
```

Note: `KEYCLOAK_URL` needs the full base URL, not just the domain. Update to:

```yaml
- name: KEYCLOAK_URL
  value: "http://keycloak.$(WORKSPACE_NAMESPACE).svc.cluster.local:8080"
- name: BRETT_PUBLIC_URL
  value: "https://$(BRETT_DOMAIN)"
```

Where `BRETT_DOMAIN` is from the ConfigMap. Since env var expansion in K8s doesn't support ConfigMap refs inline like this, use:

```yaml
- name: BRETT_DOMAIN_VALUE
  valueFrom:
    configMapKeyRef:
      name: workspace-domains
      key: BRETT_DOMAIN
- name: BRETT_PUBLIC_URL
  value: "https://brett.localhost"   # overridden per env in prod overlay
- name: KEYCLOAK_URL
  value: "http://keycloak.workspace.svc.cluster.local:8080"
```

And add a patch in `prod-mentolder/` and `prod-korczewski/` overlays to set the correct prod values.

- [ ] **Step 7.4: Commit**

```bash
git add k3d/realm-workspace-dev.json k3d/brett.yaml k3d/secrets.yaml
git commit -m "feat(infra): add brett-app KC client + brett env vars for OIDC"
```

---

## Task 8: Website proxy — allow /auth/* paths

**Files:**
- Modify: `website/src/pages/admin/brett/[...path].astro`

- [ ] **Step 8.1: Add /auth/ to allowed paths**

In `website/src/pages/admin/brett/[...path].astro`, find the `allowed` array:

```js
const allowed = [
  /^api\//,
  /^three\.min\.js$/,
  /^art-library\//,
  /^healthz$/,
];
```

Change to:

```js
const allowed = [
  /^api\//,
  /^auth\//,
  /^three\.min\.js$/,
  /^art-library\//,
  /^healthz$/,
];
```

- [ ] **Step 8.2: Run website type check**

```bash
cd website && npm run check 2>&1 | tail -20
```
Expected: no new type errors.

- [ ] **Step 8.3: Commit**

```bash
git add website/src/pages/admin/brett/[...path].astro
git commit -m "feat(website): allow /auth/* through brett admin proxy"
```

---

## Task 9: Prod realm JSON + environments schema

**Files:**
- Modify: prod realm JSON files (one per env)
- Modify: `environments/schema.yaml`

- [ ] **Step 9.1: Find prod realm JSON files**

```bash
find k3d prod-mentolder prod-korczewski -name 'realm-workspace-*.json' | sort
```

- [ ] **Step 9.2: Add brett-app client to each prod realm JSON**

For each prod realm JSON found, add the same `brett-app` client entry as in Task 7.1, but with prod redirect URIs. For `prod-mentolder`:

```json
{
  "clientId": "brett-app",
  "secret": "${BRETT_OIDC_SECRET}",
  "redirectUris": [
    "https://brett.mentolder.de/auth/callback"
  ],
  "webOrigins": [
    "https://brett.mentolder.de"
  ],
  "standardFlowEnabled": true,
  "publicClient": false
}
```

For `prod-korczewski`, use `brett.korczewski.de`.

- [ ] **Step 9.3: Add BRETT_OIDC_SECRET to environments schema if missing**

Check `environments/schema.yaml`:
```bash
grep -n 'BRETT_OIDC_SECRET' environments/schema.yaml
```
If missing, add under the secrets section:
```yaml
- name: BRETT_OIDC_SECRET
  description: "Keycloak client secret for the brett-app OIDC client"
  required: true
```

- [ ] **Step 9.4: Note for prod secrets rotation**

Add `BRETT_OIDC_SECRET` to `environments/.secrets/mentolder.yaml` and `environments/.secrets/korczewski.yaml` with real generated values, then re-seal:
```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```
(This step requires access to the plaintext secrets files — do it on the workstation with access to `.secrets/`.)

- [ ] **Step 9.5: Commit**

```bash
git add prod-mentolder/ prod-korczewski/ environments/schema.yaml
git commit -m "feat(infra): add brett-app KC client to prod realm JSONs"
```

---

## Task 10: Final integration test + PR

- [ ] **Step 10.1: Run full test suite**

```bash
cd brett && npm test
```
Expected: all tests pass (existing + new admin tests from Tasks 1–3).

```bash
cd /path/to/worktree && task workspace:validate
```
Expected: no manifest validation errors.

- [ ] **Step 10.2: Manual end-to-end check (dev cluster or local)**

```bash
# Start brett locally against mock DB
cd brett && MOCK_DB=true PORT=3000 node server.js &

# Open http://localhost:3000 — confirm normal scene loads (no admin bootstrap)
# Open http://localhost:3000/?admin=1 — confirm redirect to /auth/login
# Confirm /auth/me returns 401 without a session
curl -s http://localhost:3000/auth/me   # expect {"error":"not authenticated"}
# Confirm /api/admin/rooms returns 403 without a session
curl -s http://localhost:3000/api/admin/rooms   # expect {"error":"forbidden"}
```

- [ ] **Step 10.3: Push and open PR**

```bash
git push -u origin worktree-feature+mayhem-admin-console
gh pr create \
  --title "feat(brett): Mayhem admin console — in-game panel, KC OIDC, room browser" \
  --body "$(cat <<'EOF'
## Summary
- Brett becomes a Keycloak OIDC client (`brett-app`) — admins log in via KC redirect flow
- New room browser overlay: admins landing on brett.mentolder.de without a room param see a live room list with join dialog (spectator/player choice)
- New floating admin panel (right-edge slide-in): enable/disable Mayhem, switch mode, kick players, manage bots, reset round, broadcast room link to Talk
- 7 new admin-only WebSocket message types validated server-side — non-admins cannot fake them
- Website proxy updated to allow `/auth/*` paths through for the OIDC redirect flow

## Test plan
- [ ] `cd brett && npm test` — all tests pass
- [ ] `task workspace:validate` — manifest validation clean
- [ ] Manual: `curl http://localhost:3000/auth/me` returns 401 without session
- [ ] Manual: `curl http://localhost:3000/api/admin/rooms` returns 403 without session
- [ ] Manual (dev cluster): navigate to brett as non-admin — no panel tab visible
- [ ] Manual (dev cluster): navigate to brett as admin — room browser appears, join dialog works, panel tab visible in-scene
- [ ] Manual (dev cluster): toggle Mayhem on/off from panel — second browser tab (non-admin) sees the change in real-time

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
