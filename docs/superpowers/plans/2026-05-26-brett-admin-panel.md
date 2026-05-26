---
title: Brett Admin Panel Implementation Plan
ticket_id: T000277
domains: []
status: active
pr_number: null
---

# Brett Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the user's pre-designed React+JSX admin overlay into Brett (`brett/public/admin/`) and add a server-side session-lifecycle state machine so paddione + gekko can finally start, configure, and play Mayhem on `dev.korczewski.de` / `brett.korczewski.de`.

**Architecture:** React 18 + ReactDOM + @babel/standalone via UMD-CDN, rendered into `#admin-root` overlay on Brett's existing vanilla-JS page. Server-side session state lives as 5 new sentinel-keys (`__session_phase__`, `__session_code__`, `__admin_token_holder__`, `__session_created_at__`, `__session_last_activity__`) in the existing `figs`-Map — zero schema migration, auto-persist via `schedulePersist`. New WS commands: `admin_session_create`, `admin_handoff_token`, `admin_round_stop`, `admin_round_pause`. Pre-handshake HTTP-409 guards reconnect during active phase. Idle-timeout: lazy-eval on incoming messages + 60s backstop interval.

**Tech Stack:** Node.js (server), ws (WebSocket), Express, PostgreSQL (existing `brett_rooms` table), React 18 UMD + @babel/standalone (client, no build step), `node:test` (test runner).

**References:**
- Spec: `docs/superpowers/specs/2026-05-26-brett-admin-panel-design.md`
- Grilling: ticket T000276 in mentolder shared-db
- User mockup source: `/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/`
- Existing test conventions: `brett/test/server-admin.test.js`, `brett/test/server-mayhem.test.js`

---

## File Structure

### New files

```
brett/public/admin/
├── App.jsx                    # Top-level React app: phase routing, window.AdminPanel surface
├── MayhemScene.jsx            # Returns null in prod; placeholder under ?tweaks=1
├── screens-pregame.jsx        # LoginCard, LobbyHome
├── screens-setup.jsx          # SetupScreen with hideable overlay
├── screens-live.jsx           # AdminSidebar (4 tabs), MobileBottomSheet
├── screens-cmdk.jsx           # CommandPalette (⌘K)
├── tweaks-panel.jsx           # Dev-only tweaks, gated by ?tweaks=1
├── admin.css                  # Component styles (from mockup)
└── mayhem.css                 # Mayhem-mode styles (from mockup)

brett/test/
├── session-state.test.js      # SPECIAL keys, transitionPhase, sentinel roundtrip
├── session-code.test.js       # generateSessionCode, sessionCodeIndex
├── admin-token.test.js        # holder assignment, handoff, grace period
├── reconnect-guard.test.js    # verifyClient HTTP-409 logic
└── idle-timeout.test.js       # lazy-eval + backstop checkAllSessions
```

### Modified files

- `brett/server.js`
  - Extend `SPECIAL` array at L708
  - Extend `buildStateFromMutations` to serialize new sentinels
  - Add helper functions: `generateSessionCode`, `transitionPhase`, `checkAllSessions`, in-memory `sessionCodeIndex` + `roomMeta.previousPlayers`
  - Add `verifyClient` callback to `WebSocket.Server` construction at L501
  - Extend `ADMIN_TYPES` at L986 with new commands
  - Add new admin-command cases in switch
  - Add `setInterval(checkAllSessions, 60_000)` near server start
  - Extend `module.exports` (~L1122) with new helpers
  - Add `loadAllRoomsFromDB` hook that rebuilds `sessionCodeIndex` from persisted state
- `brett/public/index.html`
  - `<head>`: React + ReactDOM + @babel/standalone UMD CDN scripts
  - `<body>`: `<div id="admin-root"></div>` + 7 `<script type="text/babel">` for admin JSX
  - Remove `<script src=".../admin-panel.js">`
  - Fix dead-code bug at L1343-1353: lift `STATE.online` update inside `case "info":` before `break;`

### Deleted files

- `brett/public/assets/admin-panel.js`

### Assets copied (read-only, from user-provided pack)

- `/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/*.jsx` → `brett/public/admin/`
- `/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/{admin,mayhem}.css` → `brett/public/admin/`

---

## Test Approach

- **TDD where applicable:** Tests written first, run to confirm failure, then implement until they pass. Each implementation task ends with all new tests passing.
- **Existing test invocation:** `npm ci --prefix brett && node --test brett/test/<filename>` for a single suite; `node --test brett/test/*.test.js brett/test/*.test.mjs` for all suites.
- **Mock-DB convention:** All server.js-touching tests prepend `process.env.MOCK_DB = 'true';` — matches existing `server-admin.test.js`.
- **Manual UI smoke:** Phase 10 covers acceptance criteria 1-11 in a live browser session on `dev.korczewski.de`.
- **No new test framework:** stays with `node:test` + `node:assert`. No mocha, no jest.

---

## Phase 0 — Sanity Check

### Task 0.1: Confirm worktree state + baseline tests pass

**Files:** none (verification only)

- [ ] **Step 1: Verify worktree branch + HEAD**

Run: `git -C /tmp/wt-brett-admin-panel branch --show-current && git -C /tmp/wt-brett-admin-panel log -1 --oneline`
Expected:
```
feature/brett-admin-panel
6a578af5 chore(specs): add brett-admin-panel design spec [T000276]
```

- [ ] **Step 2: Install brett deps + run all brett tests (baseline)**

Run: `cd /tmp/wt-brett-admin-panel/brett && npm ci && node --test test/*.test.js test/*.test.mjs 2>&1 | tail -20`
Expected: all tests pass (baseline). If failures: stop and report; the plan assumes a green baseline.

---

## Phase 1 — Server-Side Sentinel Keys + Phase Transitions (TDD)

### Task 1.1: Write failing tests for SPECIAL array extension + sentinel roundtrip

**Files:**
- Create: `brett/test/session-state.test.js`

- [ ] **Step 1: Write the failing test file**

```js
// brett/test/session-state.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  applyMutation,
  buildStateFromMutations,
  transitionPhase,
  figureMaps,
} = require('../server.js');

test('SPECIAL array excludes session sentinel keys from figures list', () => {
  const room = 'session-state-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  applyMutation(room, { type: 'session_code_set', code: 'KRB-9A2' });
  applyMutation(room, { type: 'session_admin_token_set', playerId: 'paddione' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures.length, 0, 'sentinels must not leak into figures');
  assert.strictEqual(state.sessionPhase, 'warmup');
  assert.strictEqual(state.sessionCode, 'KRB-9A2');
  assert.strictEqual(state.adminTokenHolder, 'paddione');
});

test('transitionPhase: warmup → active is allowed', () => {
  const room = 'session-state-test-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  const result = transitionPhase(room, 'active');
  assert.strictEqual(result.ok, true);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.sessionPhase, 'active');
});

test('transitionPhase: ended → anything is a no-op', () => {
  const room = 'session-state-test-3';
  applyMutation(room, { type: 'session_phase_set', phase: 'ended' });
  const result = transitionPhase(room, 'active');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'terminal-phase');
});

test('transitionPhase: active ↔ paused round-trip preserves session', () => {
  const room = 'session-state-test-4';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  assert.strictEqual(transitionPhase(room, 'paused').ok, true);
  assert.strictEqual(transitionPhase(room, 'active').ok, true);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.sessionPhase, 'active');
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-state.test.js 2>&1 | tail -20`
Expected: FAIL with `transitionPhase is not a function` or similar (`transitionPhase` not yet exported).

### Task 1.2: Extend SPECIAL array + applyMutation + buildStateFromMutations + transitionPhase

**Files:**
- Modify: `brett/server.js` around L636-720 and `module.exports` near L1122

- [ ] **Step 1: Extend `SPECIAL` array (server.js:708)**

Find:
```js
const SPECIAL = ['__optik__', '__stiffness__', '__mayhem__', '__game_mode__'];
```

Replace with:
```js
const SPECIAL = [
  '__optik__', '__stiffness__', '__mayhem__', '__game_mode__',
  '__session_phase__', '__session_code__', '__admin_token_holder__',
  '__session_created_at__', '__session_last_activity__',
];
```

- [ ] **Step 2: Extend `buildStateFromMutations` to emit session fields**

After the existing `if (gameModeEntry) result.gameMode = gameModeEntry.mode;` line (~L718), add:
```js
const phaseEntry         = figs.get('__session_phase__');
const codeEntry          = figs.get('__session_code__');
const adminTokenEntry    = figs.get('__admin_token_holder__');
const createdAtEntry     = figs.get('__session_created_at__');
const lastActivityEntry  = figs.get('__session_last_activity__');
if (phaseEntry)        result.sessionPhase       = phaseEntry.phase;
if (codeEntry)         result.sessionCode        = codeEntry.code;
if (adminTokenEntry)   result.adminTokenHolder   = adminTokenEntry.playerId;
if (createdAtEntry)    result.sessionCreatedAt   = createdAtEntry.ts;
if (lastActivityEntry) result.sessionLastActivity = lastActivityEntry.ts;
```

- [ ] **Step 3: Extend `applyMutation` to handle 5 new mutation types**

Locate `applyMutation` (search `function applyMutation(`). Inside its `switch (msg.type)`, before the closing brace, add:
```js
case 'session_phase_set': {
  const figs = ensureFigureMap(room);
  figs.set('__session_phase__', { id: '__session_phase__', phase: msg.phase });
  break;
}
case 'session_code_set': {
  const figs = ensureFigureMap(room);
  figs.set('__session_code__', { id: '__session_code__', code: msg.code });
  break;
}
case 'session_admin_token_set': {
  const figs = ensureFigureMap(room);
  figs.set('__admin_token_holder__', { id: '__admin_token_holder__', playerId: msg.playerId });
  break;
}
case 'session_created_at_set': {
  const figs = ensureFigureMap(room);
  figs.set('__session_created_at__', { id: '__session_created_at__', ts: msg.ts });
  break;
}
case 'session_last_activity_set': {
  const figs = ensureFigureMap(room);
  figs.set('__session_last_activity__', { id: '__session_last_activity__', ts: msg.ts });
  break;
}
```

If `ensureFigureMap` does not exist (verify by `grep "ensureFigureMap" brett/server.js`), use the existing pattern: `let figs = figureMaps.get(room); if (!figs) { figs = new Map(); figureMaps.set(room, figs); }` inline.

- [ ] **Step 4: Add `transitionPhase` helper**

Add immediately before `function buildStateFromMutations` (around L705):
```js
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
```

- [ ] **Step 5: Add `transitionPhase` to `module.exports`**

Locate `module.exports = {` (near L1118-1122) and add `transitionPhase` to the export list:
```js
module.exports = {
  app, server, pool, wss,
  // ... existing exports ...
  transitionPhase,
};
```

- [ ] **Step 6: Run test, verify PASS**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-state.test.js 2>&1 | tail -10`
Expected: all 4 tests pass.

- [ ] **Step 7: Run full brett test suite to verify no regressions**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/*.test.js test/*.test.mjs 2>&1 | tail -10`
Expected: all tests pass (no regressions to existing tests).

- [ ] **Step 8: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/session-state.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): session-phase sentinel keys + transitionPhase helper [T000276]"
```

---

## Phase 2 — Session Code Generator + In-Memory Index (TDD)

### Task 2.1: Write failing tests for session-code generator + index

**Files:**
- Create: `brett/test/session-code.test.js`

- [ ] **Step 1: Write the failing test file**

```js
// brett/test/session-code.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  generateSessionCode,
  registerSessionCode,
  resolveSessionCode,
  sessionCodeIndex,
} = require('../server.js');

test('generateSessionCode: matches Crockford-base32 pattern XXX-XXX', () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateSessionCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/,
      `code ${code} must be 3-3 Crockford-base32 (no I,L,O,0,1)`);
  }
});

test('generateSessionCode: 10k iterations have <1% collision rate', () => {
  const seen = new Set();
  let collisions = 0;
  for (let i = 0; i < 10_000; i++) {
    const code = generateSessionCode();
    if (seen.has(code)) collisions++;
    seen.add(code);
  }
  assert.ok(collisions < 100, `collisions ${collisions} should be <100 for 10k codes from 32^5 space`);
});

test('registerSessionCode + resolveSessionCode: roundtrip', () => {
  const code = generateSessionCode();
  registerSessionCode(code, 'room-token-xyz');
  assert.strictEqual(resolveSessionCode(code), 'room-token-xyz');
});

test('resolveSessionCode: returns null for unknown code', () => {
  assert.strictEqual(resolveSessionCode('XXX-XXX'), null);
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-code.test.js 2>&1 | tail -10`
Expected: FAIL with `generateSessionCode is not a function`.

### Task 2.2: Implement session-code generator + in-memory index

**Files:**
- Modify: `brett/server.js` (add helpers near L500 in the rooms/state section)

- [ ] **Step 1: Add session-code helpers**

After `const rooms = new Map();` (L504 area), insert:
```js
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
```

- [ ] **Step 2: Extend `module.exports`**

Add `generateSessionCode, registerSessionCode, resolveSessionCode, sessionCodeIndex` to `module.exports`.

- [ ] **Step 3: Run test, verify PASS**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-code.test.js 2>&1 | tail -10`
Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/session-code.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): session-code generator (Crockford-base32) + index [T000276]"
```

### Task 2.3: Bootstrap sessionCodeIndex from DB on server start

**Files:**
- Modify: `brett/server.js` (find the existing `loadAllRoomsFromDB` or equivalent boot-time hydration; if it doesn't exist, locate `await pool.query('SELECT ... FROM brett_rooms')` patterns)

- [ ] **Step 1: Locate hydration logic**

Run: `grep -n "brett_rooms\|SELECT.*room\|loadAll" /tmp/wt-brett-admin-panel/brett/server.js | head -20`
Identify the function or block where rooms are loaded into memory at startup.

- [ ] **Step 2: Write failing integration test**

Append to `brett/test/session-code.test.js`:
```js
test('sessionCodeIndex rebuilds from persisted state on bootstrap', async () => {
  // Simulate the bootstrap hook: feed it a fake state object as if loaded from DB
  const { rebuildSessionCodeIndexFromStates } = require('../server.js');
  sessionCodeIndex.clear();
  rebuildSessionCodeIndexFromStates([
    { room_token: 'r-1', state: { sessionCode: 'AAA-AAA' } },
    { room_token: 'r-2', state: { sessionCode: 'BBB-BBB' } },
    { room_token: 'r-3', state: { /* no session code */ } },
  ]);
  assert.strictEqual(resolveSessionCode('AAA-AAA'), 'r-1');
  assert.strictEqual(resolveSessionCode('BBB-BBB'), 'r-2');
  assert.strictEqual(sessionCodeIndex.size, 2);
});
```

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-code.test.js 2>&1 | tail -5`
Expected: FAIL with `rebuildSessionCodeIndexFromStates is not a function`.

- [ ] **Step 3: Implement `rebuildSessionCodeIndexFromStates`**

Add near the other session-code helpers in server.js:
```js
function rebuildSessionCodeIndexFromStates(rows) {
  for (const row of rows) {
    const code = row.state?.sessionCode;
    if (code) sessionCodeIndex.set(code, row.room_token);
  }
}
```

Add to `module.exports`.

Also call this in the existing boot-time hydration logic (after the DB query that loads all rooms). If no such hydration exists today, defer to the test-only export and document the gap — the executor should investigate whether rooms are lazily loaded on first connect.

- [ ] **Step 4: Run test, verify PASS**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-code.test.js 2>&1 | tail -5`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/session-code.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): rebuild sessionCodeIndex from persisted states [T000276]"
```

---

## Phase 3 — Admin-Token Mechanism + Grace Period (TDD)

### Task 3.1: Write failing tests for token holder assignment + manual handoff

**Files:**
- Create: `brett/test/admin-token.test.js`

- [ ] **Step 1: Write failing test file**

```js
// brett/test/admin-token.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  applyMutation,
  buildStateFromMutations,
  assignAdminToken,
  handoffAdminToken,
  beginTokenGrace,
  releaseAdminToken,
} = require('../server.js');

test('assignAdminToken: sets holder when none exists', () => {
  const room = 'token-test-1';
  const result = assignAdminToken(room, 'paddione');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'paddione');
});

test('assignAdminToken: returns ok=false when holder already set (no force)', () => {
  const room = 'token-test-2';
  assignAdminToken(room, 'paddione');
  const result = assignAdminToken(room, 'gekko');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'paddione');
});

test('handoffAdminToken: holder paddione → gekko succeeds', () => {
  const room = 'token-test-3';
  assignAdminToken(room, 'paddione');
  const result = handoffAdminToken(room, 'paddione', 'gekko');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'gekko');
});

test('handoffAdminToken: rejects when fromPlayerId != current holder', () => {
  const room = 'token-test-4';
  assignAdminToken(room, 'paddione');
  const result = handoffAdminToken(room, 'gekko', 'paddione');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'not-current-holder');
});

test('releaseAdminToken: clears holder', () => {
  const room = 'token-test-5';
  assignAdminToken(room, 'paddione');
  releaseAdminToken(room);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, undefined);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/admin-token.test.js 2>&1 | tail -10`
Expected: FAIL — `assignAdminToken is not a function`.

### Task 3.2: Implement assignAdminToken, handoffAdminToken, releaseAdminToken

**Files:**
- Modify: `brett/server.js` (helpers near session-code helpers)

- [ ] **Step 1: Add helpers**

```js
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
```

Export all four from `module.exports`.

- [ ] **Step 2: Run, verify PASS**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/admin-token.test.js 2>&1 | tail -10`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/admin-token.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): admin-token assign/handoff/release helpers [T000276]"
```

### Task 3.3: Write failing tests for 30s grace-period + auto-claim

**Files:**
- Modify: `brett/test/admin-token.test.js`

- [ ] **Step 1: Append grace-period tests**

```js
test('beginTokenGrace: starts 30s timer; reclaim within window restores holder', async () => {
  const room = 'token-grace-1';
  assignAdminToken(room, 'paddione');
  beginTokenGrace(room, 'paddione', { timeoutMs: 100 }); // shortened for test
  // Within grace: holder still set
  assert.strictEqual(getAdminTokenHolder(room), 'paddione');
  // Reclaim before timeout
  const { reclaimAdminToken } = require('../server.js');
  reclaimAdminToken(room, 'paddione');
  await new Promise(r => setTimeout(r, 150));
  assert.strictEqual(getAdminTokenHolder(room), 'paddione', 'reclaim should keep holder');
});

test('beginTokenGrace: 30s expiry without reclaim → token released', async () => {
  const room = 'token-grace-2';
  assignAdminToken(room, 'paddione');
  beginTokenGrace(room, 'paddione', { timeoutMs: 50 });
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(getAdminTokenHolder(room), null, 'grace expired → released');
});

test('beginTokenGrace expiry: auto-claim to other admin present in room', async () => {
  const room = 'token-grace-3';
  assignAdminToken(room, 'paddione');
  // Simulate gekko present as admin in the room
  const { setRoomAdminPresence } = require('../server.js');
  setRoomAdminPresence(room, ['paddione', 'gekko']);
  beginTokenGrace(room, 'paddione', { timeoutMs: 50 });
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(getAdminTokenHolder(room), 'gekko', 'gekko auto-claims after grace expiry');
});

const { getAdminTokenHolder } = require('../server.js');
```

NOTE: The last `require` line must be at the top of the file or above the tests that use `getAdminTokenHolder`. Move it to the top imports list if not already there.

- [ ] **Step 2: Run, verify FAIL**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/admin-token.test.js 2>&1 | tail -10`
Expected: FAIL — `beginTokenGrace is not a function`.

### Task 3.4: Implement grace-period + auto-claim

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Add helpers**

```js
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
```

Export all new symbols: `beginTokenGrace`, `reclaimAdminToken`, `setRoomAdminPresence`, `getAdminTokenHolder`, `roomAdminPresence`, `tokenGraceTimers`.

- [ ] **Step 2: Run, verify PASS**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/admin-token.test.js 2>&1 | tail -10`
Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/admin-token.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): admin-token 30s grace + auto-claim [T000276]"
```

---

## Phase 4 — New WS Command Handlers (TDD)

### Task 4.1: Extend ADMIN_TYPES + write failing test for admin_session_create

**Files:**
- Modify: `brett/server.js` (extend `ADMIN_TYPES` at L986)

- [ ] **Step 1: Extend `ADMIN_TYPES` array**

Find:
```js
const ADMIN_TYPES = [
  'admin_mayhem_toggle','admin_mode_set','admin_kick',
  'admin_bot_spawn','admin_bot_despawn','admin_round_reset','admin_broadcast',
];
```

Replace with:
```js
const ADMIN_TYPES = [
  'admin_mayhem_toggle','admin_mode_set','admin_kick',
  'admin_bot_spawn','admin_bot_despawn','admin_round_reset','admin_broadcast',
  'admin_session_create','admin_handoff_token','admin_round_stop','admin_round_pause',
];
```

- [ ] **Step 2: Add failing test for admin_session_create**

`brett/test/session-state.test.js` append:
```js
test('admin_session_create: creates session with code + warmup phase + sets holder', () => {
  const { handleAdminSessionCreate } = require('../server.js');
  const room = 'session-create-test-1';
  const result = handleAdminSessionCreate(room, 'paddione');
  assert.strictEqual(result.ok, true);
  assert.match(result.code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.sessionPhase, 'warmup');
  assert.strictEqual(state.sessionCode, result.code);
  assert.strictEqual(state.adminTokenHolder, 'paddione');
});
```

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-state.test.js 2>&1 | tail -5`
Expected: FAIL — `handleAdminSessionCreate is not a function`.

### Task 4.2: Implement handleAdminSessionCreate + wire to ADMIN_TYPES switch

**Files:** `brett/server.js`

- [ ] **Step 1: Add handler function (near other session helpers)**

```js
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
```

Export from `module.exports`.

- [ ] **Step 2: Wire into ADMIN_TYPES switch (server.js around L1060, after last existing case)**

Inside the `switch (msg.type)` block in the admin handler at server.js:996, add new cases before the closing brace:
```js
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
```

- [ ] **Step 3: Run, verify PASS**

Run: `cd /tmp/wt-brett-admin-panel/brett && node --test test/session-state.test.js 2>&1 | tail -5`
Expected: 5 tests pass (4 from earlier + new one).

### Task 4.3: Add admin_handoff_token tests + handler

- [ ] **Step 1: Write failing test in admin-token.test.js**

```js
test('handleAdminHandoffMessage: paddione hands off → gekko, broadcast fired', () => {
  const { handleAdminHandoffMessage } = require('../server.js');
  const room = 'handoff-test-1';
  assignAdminToken(room, 'paddione');
  const broadcasts = [];
  const result = handleAdminHandoffMessage(room, 'paddione', 'gekko', (msg) => broadcasts.push(msg));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(getAdminTokenHolder(room), 'gekko');
  assert.deepStrictEqual(broadcasts, [{
    type: 'admin_token_changed', holderPlayerId: 'gekko', reason: 'handoff'
  }]);
});
```

Run, verify FAIL.

- [ ] **Step 2: Implement**

```js
function handleAdminHandoffMessage(room, fromPlayerId, toPlayerId, broadcastFn) {
  const result = handoffAdminToken(room, fromPlayerId, toPlayerId);
  if (!result.ok) return result;
  broadcastFn({ type: 'admin_token_changed', holderPlayerId: toPlayerId, reason: 'handoff' });
  return result;
}
```

Export.

- [ ] **Step 3: Wire to ADMIN_TYPES switch**

```js
case 'admin_handoff_token': {
  if (typeof msg.targetPlayerId !== 'string') return;
  const fromPlayerId = ws._playerId || ws._session?.name;
  if (!fromPlayerId) return;
  handleAdminHandoffMessage(adminRoom, fromPlayerId, msg.targetPlayerId,
    (out) => broadcast(adminRoom, out));
  schedulePersist(adminRoom);
  break;
}
```

- [ ] **Step 4: Run, verify PASS**

Expected: 9 tests pass in admin-token.test.js.

### Task 4.4: Add admin_round_stop + admin_round_pause handlers (with tests)

- [ ] **Step 1: Write failing tests in session-state.test.js**

```js
test('admin_round_stop: transitions phase to ended, broadcasts session_ended', () => {
  const { handleAdminRoundStop } = require('../server.js');
  const room = 'stop-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const broadcasts = [];
  const result = handleAdminRoundStop(room, (m) => broadcasts.push(m));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'ended');
  assert.ok(broadcasts.some(m => m.type === 'session_phase_change' && m.phase === 'ended'));
  assert.ok(broadcasts.some(m => m.type === 'session_ended'));
});

test('admin_round_pause: active → paused toggle, paused → active toggle', () => {
  const { handleAdminRoundPause } = require('../server.js');
  const room = 'pause-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  handleAdminRoundPause(room, () => {});
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'paused');
  handleAdminRoundPause(room, () => {});
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'active');
});
```

Run, verify FAIL.

- [ ] **Step 2: Implement**

```js
function handleAdminRoundStop(room, broadcastFn) {
  const result = transitionPhase(room, 'ended');
  if (!result.ok) return result;
  broadcastFn({ type: 'session_phase_change', phase: 'ended',
    transitionedAt: new Date().toISOString(), reason: 'admin-stop' });
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
  broadcastFn({ type: 'session_phase_change', phase: next,
    transitionedAt: new Date().toISOString(),
    reason: next === 'paused' ? 'admin-pause' : 'admin-resume' });
  return result;
}
```

Export both.

- [ ] **Step 3: Wire to ADMIN_TYPES switch**

```js
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
```

- [ ] **Step 4: Run all tests**

```bash
cd /tmp/wt-brett-admin-panel/brett && node --test test/*.test.js 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 5: Commit phase 4**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): admin_session_create + handoff + round_stop/pause WS handlers [T000276]"
```

---

## Phase 5 — Reconnect-Phase Guard (HTTP 409 via verifyClient)

### Task 5.1: Write failing test for previousPlayers tracking

**Files:** create `brett/test/reconnect-guard.test.js`

- [ ] **Step 1: Write test**

```js
// brett/test/reconnect-guard.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  trackPlayerInRoom,
  wasPreviouslyInRoom,
  applyMutation,
  shouldRejectReconnect,
} = require('../server.js');

test('trackPlayerInRoom + wasPreviouslyInRoom: roundtrip', () => {
  trackPlayerInRoom('rc-room-1', 'paddione');
  assert.strictEqual(wasPreviouslyInRoom('rc-room-1', 'paddione'), true);
  assert.strictEqual(wasPreviouslyInRoom('rc-room-1', 'gekko'), false);
});

test('shouldRejectReconnect: phase=active + previously joined → reject', () => {
  const room = 'rc-room-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  trackPlayerInRoom(room, 'paddione');
  const decision = shouldRejectReconnect(room, 'paddione');
  assert.strictEqual(decision.reject, true);
  assert.strictEqual(decision.code, 409);
  assert.match(decision.message, /aktiver Runde/i);
});

test('shouldRejectReconnect: phase=warmup → allow even with prior join', () => {
  const room = 'rc-room-3';
  applyMutation(room, { type: 'session_phase_set', phase: 'warmup' });
  trackPlayerInRoom(room, 'paddione');
  const decision = shouldRejectReconnect(room, 'paddione');
  assert.strictEqual(decision.reject, false);
});

test('shouldRejectReconnect: phase=active + first-time join → reject', () => {
  const room = 'rc-room-4';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  // No trackPlayerInRoom — first attempt
  const decision = shouldRejectReconnect(room, 'newcomer');
  assert.strictEqual(decision.reject, true, 'first join during active also forbidden');
});

test('shouldRejectReconnect: no session → allow (legacy room)', () => {
  const decision = shouldRejectReconnect('rc-room-no-session', 'anyone');
  assert.strictEqual(decision.reject, false);
});
```

Run, verify FAIL.

### Task 5.2: Implement previousPlayers tracking + shouldRejectReconnect

**Files:** `brett/server.js`

- [ ] **Step 1: Add helpers near other room helpers**

```js
const roomPreviousPlayers = new Map();   // roomToken -> Set<playerId>

function trackPlayerInRoom(room, playerId) {
  let set = roomPreviousPlayers.get(room);
  if (!set) { set = new Set(); roomPreviousPlayers.set(room, set); }
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
```

Export all four.

Also, in the existing `wss.on('connection')` handler (around L759), inside the existing join logic, add `trackPlayerInRoom(ws._room, ws._playerId)` after the player joins the room.

- [ ] **Step 2: Run, verify tests pass**

Expected: 5 tests pass.

### Task 5.3: Wire verifyClient on WebSocket.Server

**Files:** `brett/server.js` at L501

- [ ] **Step 1: Modify WebSocket.Server construction**

Find:
```js
const wss = new WebSocket.Server({ server, path: '/sync', maxPayload: 64 * 1024 });
```

Replace with:
```js
const wss = new WebSocket.Server({
  server,
  path: '/sync',
  maxPayload: 64 * 1024,
  verifyClient: (info, cb) => {
    // info.req has the http.IncomingMessage
    try {
      const url = new URL(info.req.url, 'http://x'); // host irrelevant — we just need query parsing
      const room = url.searchParams.get('room');
      if (!room) return cb(true); // legacy path: no session check
      // session middleware not yet run here — playerId not available pre-upgrade.
      // Use IP/cookie heuristic: if any previous player was here, treat this as "reconnect"
      // for guard purposes. This is conservative — first connects during active are also rejected per spec.
      const decision = shouldRejectReconnect(room, /* playerId */ null);
      if (decision.reject) {
        return cb(false, decision.code, decision.message);
      }
      cb(true);
    } catch (err) {
      console.error('[brett] verifyClient error:', err);
      cb(true); // fail-open — don't lock people out on errors
    }
  },
});
```

NOTE: The `verifyClient` rejection emits an HTTP 4xx response on the upgrade attempt. Most browser WS clients surface this as a generic close — the structured-body promise in spec section 4D is delivered by the response-status alone (no JSON body via `verifyClient`). If a structured body is required, switch to manual `server.on('upgrade')` handling — defer that as a Phase-10 task if needed.

- [ ] **Step 2: Run all server tests + verify no regression**

```bash
cd /tmp/wt-brett-admin-panel/brett && node --test test/*.test.js 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/reconnect-guard.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): reconnect guard via verifyClient (HTTP 409 in active phase) [T000276]"
```

---

## Phase 6 — Idle-Timeout (lazy-eval + 60s backstop)

### Task 6.1: Write failing tests

**Files:** create `brett/test/idle-timeout.test.js`

- [ ] **Step 1: Write tests**

```js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const {
  applyMutation,
  buildStateFromMutations,
  touchSessionActivity,
  checkSessionIdle,
  checkAllSessions,
  figureMaps,
} = require('../server.js');

test('touchSessionActivity: updates __session_last_activity__', () => {
  const room = 'idle-test-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const before = buildStateFromMutations(room).sessionLastActivity;
  touchSessionActivity(room);
  const after = buildStateFromMutations(room).sessionLastActivity;
  assert.notStrictEqual(before, after);
});

test('checkSessionIdle: returns {ended:true} when no activity > 2 min', () => {
  const room = 'idle-test-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  const oldTs = new Date(Date.now() - 200_000).toISOString(); // > 2 min
  applyMutation(room, { type: 'session_last_activity_set', ts: oldTs });
  const result = checkSessionIdle(room);
  assert.strictEqual(result.ended, true);
  assert.strictEqual(result.reason, 'idle-timeout');
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'ended');
});

test('checkSessionIdle: returns {ended:false} when within 2 min', () => {
  const room = 'idle-test-3';
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });
  applyMutation(room, { type: 'session_last_activity_set', ts: new Date().toISOString() });
  const result = checkSessionIdle(room);
  assert.strictEqual(result.ended, false);
});

test('checkAllSessions: iterates and ends idle rooms only', () => {
  const idleRoom = 'idle-test-4-idle';
  const liveRoom = 'idle-test-4-live';
  applyMutation(idleRoom, { type: 'session_phase_set', phase: 'active' });
  applyMutation(idleRoom, { type: 'session_last_activity_set',
    ts: new Date(Date.now() - 300_000).toISOString() });
  applyMutation(liveRoom, { type: 'session_phase_set', phase: 'active' });
  applyMutation(liveRoom, { type: 'session_last_activity_set', ts: new Date().toISOString() });
  const results = checkAllSessions();
  const idleResult = results.find(r => r.room === idleRoom);
  const liveResult = results.find(r => r.room === liveRoom);
  assert.strictEqual(idleResult.ended, true);
  assert.strictEqual(liveResult?.ended ?? false, false);
});
```

Run, verify FAIL.

### Task 6.2: Implement idle-timeout helpers

**Files:** `brett/server.js`

- [ ] **Step 1: Add helpers**

```js
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
```

Export `touchSessionActivity`, `checkSessionIdle`, `checkAllSessions`.

- [ ] **Step 2: Wire `setInterval(checkAllSessions, 60_000)` near server start**

Add near where server.listen is called (or at module load), guarded by `if (process.env.MOCK_DB !== 'true')` so tests don't fire timers:
```js
if (process.env.MOCK_DB !== 'true') {
  setInterval(() => {
    const results = checkAllSessions();
    for (const r of results) {
      if (r.ended) {
        broadcast(r.room, { type: 'session_phase_change', phase: 'ended',
          transitionedAt: new Date().toISOString(), reason: 'idle-timeout' });
        broadcast(r.room, { type: 'session_ended', reason: 'idle-timeout' });
        schedulePersist(r.room);
      }
    }
  }, 60_000);
}
```

- [ ] **Step 3: Wire `touchSessionActivity` into existing WS-message handler**

Inside `wss.on('connection')` → `ws.on('message')` near the top (after JSON.parse), add:
```js
if (ws._room) touchSessionActivity(ws._room);
```

This updates last-activity on every inbound message.

- [ ] **Step 4: Run tests**

```bash
cd /tmp/wt-brett-admin-panel/brett && node --test test/*.test.js 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/server.js brett/test/idle-timeout.test.js
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): idle-timeout lazy-eval + 60s backstop [T000276]"
```

---

## Phase 7 — Client-Side Drop-In (React UMD + JSX)

### Task 7.1: Copy JSX + CSS from user mockup into worktree

**Files:**
- Create: `brett/public/admin/` (directory)
- Copy: 7× JSX, 2× CSS from `/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/`

- [ ] **Step 1: Create directory and copy**

```bash
mkdir -p /tmp/wt-brett-admin-panel/brett/public/admin
cp "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/App.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/MayhemScene.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/screens-cmdk.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/screens-live.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/screens-pregame.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/screens-setup.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/tweaks-panel.jsx" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/admin.css" \
   "/home/patrick/Bachelorprojekt/assets/grilling-brett-admin-panel/Brett Design System/admin/mayhem.css" \
   /tmp/wt-brett-admin-panel/brett/public/admin/
```

- [ ] **Step 2: Verify**

```bash
ls /tmp/wt-brett-admin-panel/brett/public/admin/
```
Expected: 7 .jsx files + admin.css + mayhem.css (9 files total).

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): import admin-panel JSX + CSS from user mockup [T000276]"
```

### Task 7.2: Modify App.jsx to expose window.AdminPanel surface

**Files:**
- Modify: `brett/public/admin/App.jsx`

- [ ] **Step 1: Read current App.jsx end (lines 310-314 contain ReactDOM.createRoot call)**

Run: `tail -20 /tmp/wt-brett-admin-panel/brett/public/admin/App.jsx`
Confirm it ends with: `ReactDOM.createRoot(document.getElementById('root')).render(<App />);`

- [ ] **Step 2: Replace the bootstrap with mount-API**

Find the trailing line `ReactDOM.createRoot(document.getElementById('root')).render(<App />);` and replace with:
```jsx
// Brett mount API — replaces vanilla admin-panel.js
const __brettAdminState = {
  root: null,
  appRef: null,
  pendingMessages: [],
};

window.AdminPanel = {
  mount({ sendFn, room, roomName, joinMode, isAdmin }) {
    if (__brettAdminState.root) return;
    const container = document.getElementById('admin-root');
    if (!container) {
      console.error('[brett-admin] #admin-root not found in DOM');
      return;
    }
    window.__brettSendFn = sendFn;
    window.__brettRoom = room;
    window.__brettRoomName = roomName;
    window.__brettJoinMode = joinMode;
    __brettAdminState.root = ReactDOM.createRoot(container);
    __brettAdminState.root.render(<App />);
    // Flush pending messages
    setTimeout(() => {
      const fn = window.__brettAdminOnMessage;
      if (fn) {
        for (const m of __brettAdminState.pendingMessages) fn(m);
        __brettAdminState.pendingMessages = [];
      }
    }, 0);
  },
  onMessage(msg) {
    const fn = window.__brettAdminOnMessage;
    if (fn) fn(msg);
    else __brettAdminState.pendingMessages.push(msg);
  },
  toggle() {
    window.dispatchEvent(new CustomEvent('brett-admin:toggle'));
  },
};

// Auto-mount target replaced: the legacy ReactDOM.createRoot call is removed.
// Mount happens via window.AdminPanel.mount() called from index.html WS-open handler.
```

NOTE: The App component itself must register a message handler via `useEffect(() => { window.__brettAdminOnMessage = handler; return () => { window.__brettAdminOnMessage = null; }; }, [...deps])`. That wiring is part of Task 9.x.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/App.jsx
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): expose window.AdminPanel.{mount,onMessage,toggle} from React app [T000276]"
```

### Task 7.3: MayhemScene returns null in prod (gated by tweaks)

**Files:**
- Modify: `brett/public/admin/MayhemScene.jsx`

- [ ] **Step 1: Replace the entire return block**

Add at top of `function MayhemScene(...)`:
```jsx
const tweaks = new URLSearchParams(location.search).has('tweaks');
if (!tweaks) return null;  // Prod: Three.js scene runs outside React tree
```

Keep the rest of the MayhemScene rendering as-is (it's only used in `?tweaks=1` dev mode).

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/MayhemScene.jsx
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): MayhemScene returns null in prod (tweaks-only) [T000276]"
```

### Task 7.4: Tweaks-Panel visibility gated by ?tweaks=1

**Files:**
- Modify: `brett/public/admin/App.jsx`

- [ ] **Step 1: In `function App()`, guard `<BrettTweaks ... />` render**

Find:
```jsx
{/* Tweaks panel · custom */}
<BrettTweaks tweaks={tweaks} setTweak={setTweak} />
```

Replace with:
```jsx
{/* Tweaks panel · custom · only in dev */}
{new URLSearchParams(location.search).has('tweaks') &&
  <BrettTweaks tweaks={tweaks} setTweak={setTweak} />}
```

Also for `DevStrip`:
```jsx
{new URLSearchParams(location.search).has('tweaks') &&
  <DevStrip phase={phase} setPhase={setPhase} user={user}
    setTweak={setTweak} cmdkOpen={cmdkOpen} setCmdkOpen={setCmdkOpen} />}
```

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/App.jsx
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): gate Tweaks/DevStrip on ?tweaks=1 query [T000276]"
```

### Task 7.5: Modify index.html — add CDN scripts, mount-div, JSX script tags, delete admin-panel.js ref, fix dead-code bug

**Files:**
- Modify: `brett/public/index.html`
- Delete: `brett/public/assets/admin-panel.js`

- [ ] **Step 1: Add React + Babel CDN scripts to `<head>`**

Find the existing `<head>` section in index.html and add (anywhere before any `<script>` that uses React):
```html
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
<link rel="stylesheet" href="/admin/admin.css">
<link rel="stylesheet" href="/admin/mayhem.css">
```

- [ ] **Step 2: Remove existing `<script>` reference to admin-panel.js**

Locate the line in index.html that loads admin-panel.js (search for `admin-panel.js`):
```bash
grep -n "admin-panel" /tmp/wt-brett-admin-panel/brett/public/index.html
```
Delete that `<script src=...admin-panel.js"></script>` tag.

- [ ] **Step 3: Delete the file itself**

```bash
git -C /tmp/wt-brett-admin-panel rm brett/public/assets/admin-panel.js
```

- [ ] **Step 4: Add `<div id="admin-root">` + JSX script tags BEFORE closing `</body>`**

Right before `</body>` in index.html, add:
```html
<div id="admin-root"></div>
<script type="text/babel" data-presets="env,react" src="/admin/MayhemScene.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/tweaks-panel.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-pregame.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-setup.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-live.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-cmdk.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/App.jsx"></script>
```

- [ ] **Step 5: Fix dead-code bug at L1343-1353**

Find:
```js
      case "info":
      default:
        if (window.Mayhem) {
          if (msg.type === "snapshot") window.Mayhem.onSnapshot(msg);
          else window.Mayhem.onMessage(msg);
        }
        if (window.AdminPanel) window.AdminPanel.onMessage(msg);
        break;
        STATE.online = msg.count || 1;
        document.getElementById("online-count").textContent = String(STATE.online);
        break;
```

Replace with:
```js
      case "info":
        STATE.online = msg.count || 1;
        document.getElementById("online-count").textContent = String(STATE.online);
        if (window.AdminPanel) window.AdminPanel.onMessage(msg);
        break;
      default:
        if (window.Mayhem) {
          if (msg.type === "snapshot") window.Mayhem.onSnapshot(msg);
          else window.Mayhem.onMessage(msg);
        }
        if (window.AdminPanel) window.AdminPanel.onMessage(msg);
        break;
```

- [ ] **Step 6: Manual smoke test (local dev server)**

```bash
cd /tmp/wt-brett-admin-panel/brett && npm start &
sleep 2
curl -s http://localhost:3000/admin/App.jsx | head -5  # serves the JSX file
curl -s http://localhost:3000/ | grep -c "admin-root" # should output 1
pkill -f "node.*brett/server.js"
```
Expected: JSX file served, `<div id="admin-root">` present in HTML.

- [ ] **Step 7: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/index.html
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): wire React+Babel CDN, mount admin overlay, delete legacy admin-panel.js, fix info-case dead-code bug [T000276]"
```

---

## Phase 8 — Wire onMessage → React, Wire Send-Buttons → WS

### Task 8.1: In App.jsx, register an onMessage handler that dispatches into React state

**Files:**
- Modify: `brett/public/admin/App.jsx`

- [ ] **Step 1: Inside `function App()`, after state declarations, add useEffect**

```jsx
useEffect(() => {
  function handleWsMessage(msg) {
    switch (msg.type) {
      case 'session_phase_change':
        setLog(prev => [...prev, { t: new Date().toLocaleTimeString('de-DE',
          {hour:'2-digit', minute:'2-digit'}), who: 'system',
          msg: `Phase: ${msg.phase} (${msg.reason||'manual'})` }]);
        // Auto-advance phase state if needed
        if (msg.phase === 'active' && phase !== 'live') setPhase('live');
        if (msg.phase === 'ended') setPhase('lobby');
        break;
      case 'admin_token_changed':
        setLog(prev => [...prev, { t: new Date().toLocaleTimeString('de-DE',
          {hour:'2-digit', minute:'2-digit'}), who: 'system',
          msg: `Admin-Token an ${msg.holderPlayerId || '(niemand)'} (${msg.reason})` }]);
        break;
      case 'session_ended':
        setLog(prev => [...prev, { t: new Date().toLocaleTimeString('de-DE',
          {hour:'2-digit', minute:'2-digit'}), who: 'system',
          msg: `Session beendet: ${msg.reason}` }]);
        setPhase('lobby');
        break;
      case 'session_created':
        setLog(prev => [...prev, { t: new Date().toLocaleTimeString('de-DE',
          {hour:'2-digit', minute:'2-digit'}), who: 'system',
          msg: `Session-Code: ${msg.code}` }]);
        break;
      case 'player_join':
      case 'player_leave':
      case 'info':
        // Update player list from existing brett state — to be wired in Task 8.3
        break;
    }
  }
  window.__brettAdminOnMessage = handleWsMessage;
  return () => { window.__brettAdminOnMessage = null; };
}, [phase]);
```

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/App.jsx
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): wire onMessage from WS into React state via window.__brettAdminOnMessage [T000276]"
```

### Task 8.2: Wire send-buttons in screens-pregame.jsx (LobbyHome "Mayhem-Session erstellen")

**Files:**
- Modify: `brett/public/admin/screens-pregame.jsx`

- [ ] **Step 1: Find the LobbyHome component (search for "LobbyHome")**

Replace the existing `onCreateSession` prop wiring to call `window.__brettSendFn({type:'admin_session_create'})`:

Find:
```jsx
function LobbyHome({ user, onCreateSession }) {
```

In the button's onClick that previously called `onCreateSession()`, replace with:
```jsx
onClick={() => {
  if (window.__brettSendFn) window.__brettSendFn({ type: 'admin_session_create' });
  onCreateSession(); // continues local phase change
}}
```

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/screens-pregame.jsx
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): LobbyHome Mayhem-Session-erstellen button sends admin_session_create [T000276]"
```

### Task 8.3: Wire send-buttons in screens-live.jsx (MATCH tab + SPIELER tab actions)

**Files:**
- Modify: `brett/public/admin/screens-live.jsx`

- [ ] **Step 1: Locate AdminSidebar component**

Search for `function AdminSidebar` and its `MatchTab`. Inside MatchTab, the existing mode-switch buttons should be wired to send WS messages.

- [ ] **Step 2: Replace each mode-button click handler**

For each mode button (M, L, D, T, C), the onClick should be:
```jsx
onClick={() => {
  const modeKey = 'mayhem'; // or 'lms', 'duel', 'deathmatch', 'coaching' — match per button
  if (window.__brettSendFn) window.__brettSendFn({ type: 'admin_mode_set', mode: modeKey });
  set.setMode(modeKey); // local optimistic update
}}
```

(Repeat per button; the existing `MODES` array in the JSX should map cleanly.)

- [ ] **Step 3: Wire Mayhem-Toggle**

Find the toggle in MatchTab and wire to `admin_mayhem_toggle`:
```jsx
onChange={(e) => {
  const enabled = e.target.checked;
  if (window.__brettSendFn) window.__brettSendFn({ type: 'admin_mayhem_toggle', enabled });
  set.setMayhem(enabled);
}}
```

- [ ] **Step 4: Wire RUNDE Reset, SPAWNS Reset, STOP, PAUSE**

```jsx
// RUNDE Reset
onClick={() => window.__brettSendFn?.({ type: 'admin_round_reset' })}
// SPAWNS Reset Positionen — use round_reset for now (no separate command in MVP)
onClick={() => window.__brettSendFn?.({ type: 'admin_round_reset' })}
// STOP Runde beenden
onClick={() => window.__brettSendFn?.({ type: 'admin_round_stop' })}
// PAUSE
onClick={() => window.__brettSendFn?.({ type: 'admin_round_pause' })}
```

- [ ] **Step 5: Wire SPIELER tab Handoff button**

Find the SPIELER tab (PlayersTab or similar). For each non-self admin player row, add a "Handoff" button:
```jsx
{!p.you && p.isAdmin && (
  <button onClick={() => window.__brettSendFn?.({
    type: 'admin_handoff_token', targetPlayerId: p.name
  })}>Handoff</button>
)}
```

- [ ] **Step 6: Wire BOTS tab Add/Remove**

```jsx
// Add bot
onClick={() => window.__brettSendFn?.({ type: 'admin_bot_spawn' })}
// Remove bot (per-bot remove button)
onClick={() => window.__brettSendFn?.({ type: 'admin_bot_despawn', botId: bot.id })}
```

- [ ] **Step 7: Commit**

```bash
git -C /tmp/wt-brett-admin-panel add brett/public/admin/screens-live.jsx
git -C /tmp/wt-brett-admin-panel commit -m "feat(brett): wire MATCH/BOTS/SPIELER tabs to WS admin commands [T000276]"
```

---

## Phase 9 — Verification

### Task 9.1: Full test suite

- [ ] **Step 1: Run all brett tests**

```bash
cd /tmp/wt-brett-admin-panel/brett && npm ci && node --test test/*.test.js test/*.test.mjs 2>&1 | tail -20
```
Expected: all tests pass (existing + new).

- [ ] **Step 2: Run repo-level offline tests**

```bash
cd /tmp/wt-brett-admin-panel && task test:all 2>&1 | tail -10
```
Expected: pass.

- [ ] **Step 3: Validate manifests**

```bash
cd /tmp/wt-brett-admin-panel && task workspace:validate 2>&1 | tail -5
```
Expected: pass (no manifest changes in this feature, but verify no incidental break).

### Task 9.2: Deploy to dev.korczewski.de via dev-flow-iterate

- [ ] **Step 1: Build + push brett image**

Invoke `dev-flow-iterate` skill (per the user's iteration preference) targeting `dev.korczewski.de`. The skill handles `task feature:brett` or equivalent image build + push.

OR, manually:
```bash
cd /tmp/wt-brett-admin-panel && task feature:brett 2>&1 | tail -10
```

- [ ] **Step 2: Wait for rollout, verify pod healthy**

```bash
kubectl --context dev -n workspace get pods -l app=brett -w &
WATCH_PID=$!
sleep 60 && kill $WATCH_PID
kubectl --context dev -n workspace logs deploy/brett --tail 50
```
Expected: pod Running 1/1, no startup errors.

### Task 9.3: Manual acceptance criteria walkthrough on dev.korczewski.de

- [ ] **Step 1: Test AC #1 — Admin badge**

Open `https://dev.korczewski.de/brett` as paddione (after Keycloak login). Confirm `ADMIN · paddione` chip in top-right of sidebar header.

- [ ] **Step 2: Test AC #2-4 — Session create + setup + start**

Click "Mayhem-Session erstellen" → Setup-Screen appears. Note Session-Code displayed (e.g. `KRB-9A2`). Add 3 bots via "+ Bot" button. Click "LMS" mode. Click "Spiel starten".

- [ ] **Step 3: Test AC #3 — Setup-Overlay-Toggle**

In Setup-Screen, click the eye-icon (Overlay aus/ein). Verify Three.js scene visible behind, can move with WASD. Click again to restore overlay.

- [ ] **Step 4: Test AC #5 — Second player joins via code**

Open second browser/profile as `gekko@dev`. Navigate to `https://dev.korczewski.de/brett`. Type session code `KRB-9A2` (from AC #2). Confirm joined room, sees `CO-ADMIN · readonly` chip on his sidebar.

- [ ] **Step 5: Test AC #6-7 — Sidebar collapse + ⌘K palette**

As paddione: click ✕ on Sidebar — collapses to `⌘K · Palette` pill bottom-right. Hit ⌘K (or Ctrl+K on non-Mac) — CommandPalette opens with searchable actions.

- [ ] **Step 6: Test AC #8 — Reconnect rejected during active**

In paddione's tab: hit `phase=active` via the dev-strip phase-jumper (or naturally via "Spiel starten"). In gekko's tab: refresh the page. Expect WS-connect to fail; UI shows toast "Reconnect nicht möglich…".

- [ ] **Step 7: Test AC #9 — Handoff token**

paddione's SPIELER tab → click "Handoff" next to Tina (or gekko if no Tina). Confirm `admin_token_changed` log entry. paddione's sidebar becomes readonly; gekko's becomes interactive.

- [ ] **Step 8: Test AC #10 — Idle timeout**

Disconnect all clients for >2 min (or simulate by holding off WS-pong). Verify server logs "session ended: idle-timeout". Next reconnect attempt: phase has reset to no-session.

- [ ] **Step 9: Test AC #11 — <200ms feedback**

In Chrome DevTools Network tab, click a mode-switch button. Verify WS round-trip <200ms (visible in Performance/Timing).

- [ ] **Step 10: Document any failures**

If any AC fails, write a brief inline note in this plan-file (under that step) describing the failure mode. Do not fix in this session — flag for follow-up.

### Task 9.4: Final push to origin

- [ ] **Step 1: Final git status check**

```bash
git -C /tmp/wt-brett-admin-panel status
git -C /tmp/wt-brett-admin-panel log --oneline -20
```
Expected: clean tree, all phase-commits present.

- [ ] **Step 2: Push branch**

```bash
git -C /tmp/wt-brett-admin-panel push origin feature/brett-admin-panel
```

- [ ] **Step 3: Create PR (or note PR creation as next step)**

```bash
gh pr create --repo Paddione/Bachelorprojekt \
  --base main --head feature/brett-admin-panel \
  --title "feat(brett): admin panel + session lifecycle" \
  --body "$(cat <<'EOF'
## Summary
- Adds React+UMD admin overlay to brett (replaces legacy admin-panel.js)
- Adds server-side session-lifecycle state machine via 5 sentinel keys (zero schema migration)
- Adds 4 new WS commands: admin_session_create, admin_handoff_token, admin_round_stop, admin_round_pause
- Adds reconnect-phase guard (HTTP 409 during active phase)
- Adds idle-timeout (2 min) with lazy-eval + 60s backstop
- Fixes dead-code bug at index.html:1343-1353 (online-count never updated)

Closes T000276 (grilling).

## Test plan
- [x] node --test brett/test/*.test.js → all pass (existing + new)
- [x] task test:all → green
- [ ] Deploy to dev.korczewski.de via task feature:brett
- [ ] Manual AC walkthrough (1-11) per docs/superpowers/plans/2026-05-26-brett-admin-panel.md Task 9.3

## Refs
- Spec: docs/superpowers/specs/2026-05-26-brett-admin-panel-design.md
- Plan: docs/superpowers/plans/2026-05-26-brett-admin-panel.md
- Grilling-Ticket: T000276
EOF
)"
```

---

## Follow-Up Work (NOT in this PR — capture as separate tickets)

1. Player-Kick UI wiring (server cmd already exists)
2. Broadcast-Nachrichten UI
3. Player/Time/Score-Limit settings in Setup-Screen
4. Custom Karten-Layouts
5. Audit-Log
6. i18n DE/EN
7. dev-flow-plan Skill update for HTML-Form-Grilling default (memory: `feedback_grilling_html_form.md`)
8. Brett Design System integration as `.claude/skills/brett-design/`
9. esbuild build pipeline for JSX (Performance optimization over Babel-Standalone)
10. CDN-Pin + SRI hashes for React/Babel/ReactDOM (Supply-Chain hardening)
11. Periodic `/auth/me` re-check in client to detect Keycloak token revocation mid-session

---

## Spec Coverage Self-Review

| Spec Section | Plan Coverage |
|---|---|
| §1 Context | Acknowledged in plan-header |
| §2 Funktional | Phase 1-9 (sentinel keys, code gen, token, WS handlers, reconnect, idle, UI wiring) |
| §2 Nicht-funktional | Phase 7-8 (UI) covers mobile, perf, a11y, dark-theme; Phase 9 verifies <200ms |
| §2 Out-of-Scope | Documented in follow-up section |
| §2 Akzeptanzkriterien | Mapped 1:1 in Task 9.3 |
| §3 Architecture | Phase 1-6 implements server layer; Phase 7-8 implements client layer |
| §4A Sentinel keys | Phase 1 |
| §4B Session code parallel index | Phase 2 |
| §4C Admin token 30s grace | Phase 3 |
| §4D HTTP 409 reconnect | Phase 5 (with verifyClient note re: structured-body limitation) |
| §4E Hard replace admin-panel.js | Phase 7 |
| §4F Idle lazy-eval + backstop | Phase 6 |
| §4G Setup-overlay client-only | Already client-state in App.jsx (`setupHidden` useState); no plan task needed — already in mockup |
| §5 File-level impact | All files listed in File Structure section above |
| §6 WS Protocol | Tested in Phase 1-4; verified in Phase 9 |
| §7 Testing | Phases 1-6 are TDD; Phase 9 is manual |
| §8 Rollout | Phase 9 Task 9.2 |
| §9 Known Risks | Acknowledged inline (verifyClient limitation in Task 5.3) |
| §11 Follow-Up | Captured at end of this plan |

**Gaps:** Spec §4D mentions "structured JSON body" in HTTP 409 response — the `verifyClient` callback can only emit status code + reason text, not a JSON body. This is documented in Task 5.3 Step 1 as an acceptable degradation; if structured body is critical, future work converts to `server.on('upgrade')` manual handling. Flagged as Follow-Up #12.

12. Switch reconnect-guard from `verifyClient` to manual `server.on('upgrade')` handler if structured JSON-body 409 response is required.
