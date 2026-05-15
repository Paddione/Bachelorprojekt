---
ticket_id: T000388
title: Brett Mayhem Mode Implementation Plan
domains: []
status: done
pr_number: 779
---

# Brett Mayhem Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-room "Mayhem mode" to Brett where each user controls a chase-camera avatar that can run, flail arms to ragdoll others on collision, and spawn a vehicle that crosses the plane ragdolling whoever it hits — all without disrupting the existing Aufstellung workflow.

**Architecture:** Layer a self-contained `mayhem/` client module onto the existing `brett/public/index.html` and extend `brett/server.js` to relay six new ephemeral message types. Ragdoll uses Brett's existing per-bone spring system with stiffness set to zero plus gravity — no new physics engine. Player and vehicle state are pure WS relay; only the room-wide `mayhem_mode` flag persists.

**Tech Stack:** Three.js (existing `three.min.js`), vanilla ES modules (Brett does not bundle), `ws` for sync, `pg` for room persistence, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-15-brett-ragdoll-mayhem-design.md`

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `brett/public/assets/mayhem/physics.js` | create | Pure helpers: capsule-capsule, AABB-capsule, ragdoll bone integration. Zero Three.js imports, fully unit-testable. |
| `brett/public/assets/mayhem/chase-camera.js` | create | Third-person chase camera + pointer-lock state. |
| `brett/public/assets/mayhem/player-avatar.js` | create | `PlayerAvatar` class: state machine, controls, animation, hit logic. |
| `brett/public/assets/mayhem/vehicle.js` | create | `Vehicle` class: spawn, linear traversal, despawn, AABB collision. |
| `brett/public/assets/mayhem/mayhem.js` | create | Mode controller: toolbar toggle, banner, lifecycle, WS message dispatch. |
| `brett/test/physics.test.js` | create | Unit tests for `physics.js`. |
| `brett/test/server-mayhem.test.js` | create | Server unit tests for new relay/persist behavior. |
| `brett/package.json` | modify | Add `"test": "node --test test/"`. |
| `brett/server.js` | modify | Extend relay allowlist, persist `mayhem_mode`, include in snapshot, broadcast `player_leave` on disconnect. |
| `brett/public/index.html` | modify | Load `mayhem.js`, add toolbar button, wire message dispatch. |

---

## Task 1: Add test runner to Brett

Brett has no test infrastructure. Add minimal node-native test setup first so all subsequent TDD steps work.

**Files:**
- Modify: `brett/package.json`
- Create: `brett/test/.gitkeep`

- [ ] **Step 1: Add test script**

Edit `brett/package.json`. In `"scripts"`, add a `test` entry:

```json
{
  "name": "workspace-brett",
  "version": "0.1.0",
  "private": true,
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  },
  "dependencies": { ... unchanged ... }
}
```

- [ ] **Step 2: Create test directory placeholder**

```bash
mkdir -p brett/test
touch brett/test/.gitkeep
```

- [ ] **Step 3: Verify runner works on empty dir**

```bash
cd brett && npm test
```

Expected: `tests 0 \n pass 0 \n fail 0` (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add brett/package.json brett/test/.gitkeep
git commit -m "chore(brett): add node --test runner scaffold"
```

---

## Task 2: Physics helpers — capsule-capsule intersection

Pure function, TDD. No Three.js dependency.

**Files:**
- Create: `brett/public/assets/mayhem/physics.js`
- Create: `brett/test/physics.test.js`

- [ ] **Step 1: Write failing test**

Create `brett/test/physics.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Brett ships ES modules to the browser; for node --test we eval the file
// in a sandbox that simulates `export` as a global. Simpler: write physics.js
// as a UMD-ish file that exports both CommonJS and global.
const physics = require('../public/assets/mayhem/physics.js');

test('capsuleCapsule: two vertical capsules that overlap horizontally collide', () => {
  const a = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  const b = { x: 0.5, y: 0, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.capsuleCapsule(a, b), true);
});

test('capsuleCapsule: capsules 1.0 m apart do not collide', () => {
  const a = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  const b = { x: 1.0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.capsuleCapsule(a, b), false);
});

test('capsuleCapsule: same xz but vertically offset capsules still collide if heights overlap', () => {
  const a = { x: 0, y: 0,   z: 0, radius: 0.35, height: 1.8 };
  const b = { x: 0, y: 0.5, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.capsuleCapsule(a, b), true);
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd brett && npm test
```

Expected: `Cannot find module '../public/assets/mayhem/physics.js'`.

- [ ] **Step 3: Implement minimal physics.js**

Create `brett/public/assets/mayhem/physics.js`:

```javascript
'use strict';

// Capsule = vertical cylinder from (x, y, z) to (x, y+height, z) with given radius.
// Two capsules collide if the closest distance between their vertical segments is < r1+r2.
function capsuleCapsule(a, b) {
  // y-overlap check
  const aTop = a.y + a.height;
  const bTop = b.y + b.height;
  const yOverlap = Math.max(0, Math.min(aTop, bTop) - Math.max(a.y, b.y));
  if (yOverlap <= 0) return false;
  // horizontal distance
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const distSq = dx * dx + dz * dz;
  const r = a.radius + b.radius;
  return distSq < r * r;
}

const api = { capsuleCapsule };

// Dual export: CommonJS (for node --test) and window global (for browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.MayhemPhysics = api;
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd brett && npm test
```

Expected: `tests 3 \n pass 3 \n fail 0`.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/physics.js brett/test/physics.test.js
git commit -m "feat(brett): capsule-capsule intersection for mayhem physics"
```

---

## Task 3: Physics helpers — AABB-capsule intersection

**Files:**
- Modify: `brett/public/assets/mayhem/physics.js`
- Modify: `brett/test/physics.test.js`

- [ ] **Step 1: Write failing test**

Append to `brett/test/physics.test.js`:

```javascript
test('aabbCapsule: capsule inside AABB collides', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
  const cap = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.aabbCapsule(box, cap), true);
});

test('aabbCapsule: capsule far from AABB does not collide', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
  const cap = { x: 5, y: 0, z: 5, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.aabbCapsule(box, cap), false);
});

test('aabbCapsule: capsule touching corner within radius collides', () => {
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
  const cap = { x: 1.2, y: 0, z: 1.2, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.aabbCapsule(box, cap), true);
});
```

- [ ] **Step 2: Run test, expect failure**

Expected: `TypeError: physics.aabbCapsule is not a function`.

- [ ] **Step 3: Implement aabbCapsule**

In `brett/public/assets/mayhem/physics.js`, add before `const api`:

```javascript
function aabbCapsule(box, cap) {
  const capTop = cap.y + cap.height;
  // y overlap
  if (capTop < box.minY || cap.y > box.maxY) return false;
  // closest point on box footprint to capsule center line (xz plane)
  const cx = Math.max(box.minX, Math.min(cap.x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(cap.z, box.maxZ));
  const dx = cap.x - cx;
  const dz = cap.z - cz;
  return dx * dx + dz * dz < cap.radius * cap.radius;
}
```

Update `api`:

```javascript
const api = { capsuleCapsule, aabbCapsule };
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd brett && npm test
```

Expected: `tests 6 \n pass 6 \n fail 0`.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/physics.js brett/test/physics.test.js
git commit -m "feat(brett): aabb-capsule intersection for mayhem physics"
```

---

## Task 4: Physics helpers — ragdoll bone integration

**Files:**
- Modify: `brett/public/assets/mayhem/physics.js`
- Modify: `brett/test/physics.test.js`

- [ ] **Step 1: Write failing test**

Append to `brett/test/physics.test.js`:

```javascript
test('integrateRagdollBone: rotation decays under damping, gravity pulls toward 0,0 limp', () => {
  const bone = { currentRot: { x: 0.5, z: 0.3 }, velocity: { x: 1.0, z: -0.5 } };
  const dt = 0.016;
  physics.integrateRagdollBone(bone, dt);
  // velocity damped by 0.92
  assert.ok(Math.abs(bone.velocity.x - 1.0 * 0.92) < 1e-6);
  assert.ok(Math.abs(bone.velocity.z - (-0.5) * 0.92) < 1e-6);
  // currentRot advanced by velocity * dt
  assert.ok(Math.abs(bone.currentRot.x - (0.5 + 1.0 * 0.92 * dt)) < 1e-6);
});

test('integrateRagdollRoot: root y falls under gravity until floor (0.2)', () => {
  const root = { y: 1.0, vy: 0 };
  for (let i = 0; i < 100; i++) physics.integrateRagdollRoot(root, 0.016);
  assert.ok(root.y <= 0.21, `expected root to land near floor, got ${root.y}`);
  assert.strictEqual(root.vy, 0); // clamped at floor
});
```

- [ ] **Step 2: Run test, expect failure**

Expected: `TypeError: physics.integrateRagdollBone is not a function`.

- [ ] **Step 3: Implement**

In `brett/public/assets/mayhem/physics.js` add:

```javascript
const RAGDOLL_DAMPING = 0.92;
const GRAVITY = 9.8;
const RAGDOLL_FLOOR_Y = 0.2;

function integrateRagdollBone(bone, dt) {
  bone.velocity.x *= RAGDOLL_DAMPING;
  bone.velocity.z *= RAGDOLL_DAMPING;
  bone.currentRot.x += bone.velocity.x * dt;
  bone.currentRot.z += bone.velocity.z * dt;
}

function integrateRagdollRoot(root, dt) {
  root.vy -= GRAVITY * dt;
  root.y += root.vy * dt;
  if (root.y <= RAGDOLL_FLOOR_Y) {
    root.y = RAGDOLL_FLOOR_Y;
    root.vy = 0;
  }
}
```

Update `api`:

```javascript
const api = { capsuleCapsule, aabbCapsule, integrateRagdollBone, integrateRagdollRoot,
  RAGDOLL_DAMPING, GRAVITY, RAGDOLL_FLOOR_Y };
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd brett && npm test
```

Expected: `tests 8 \n pass 8 \n fail 0`.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/physics.js brett/test/physics.test.js
git commit -m "feat(brett): ragdoll bone + root integrators"
```

---

## Task 5: Server — extend relay allowlist for mayhem messages

**Files:**
- Modify: `brett/server.js:392`
- Create: `brett/test/server-mayhem.test.js`

- [ ] **Step 1: Write failing test**

Create `brett/test/server-mayhem.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');

// We import the in-memory mutation logic only; no real ws/db needed.
process.env.SKIP_PG_CONNECT = '1'; // server.js must honor this (Task 5 step 4)
const { applyMutation, buildStateFromMutations, figureMaps } = require('../server.js');

test('applyMutation: mayhem_mode toggle persists __mayhem__ entry', () => {
  const room = 'test-room-1';
  applyMutation(room, { type: 'mayhem_mode', enabled: true });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.mayhem, true);
});

test('applyMutation: mayhem_mode false clears flag', () => {
  const room = 'test-room-2';
  applyMutation(room, { type: 'mayhem_mode', enabled: true });
  applyMutation(room, { type: 'mayhem_mode', enabled: false });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.mayhem, false);
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd brett && npm test
```

Expected: failure — `server.js` doesn't yet honor `SKIP_PG_CONNECT`, doesn't expose `figureMaps`'s mutation behavior for `mayhem_mode`, and `buildStateFromMutations` doesn't read `__mayhem__`.

- [ ] **Step 3: Make server testable — gate pg connect**

In `brett/server.js`, find the `new Pool(...)` line near the top of the file. Wrap it:

```javascript
const pool = process.env.SKIP_PG_CONNECT
  ? { query: async () => ({ rows: [] }) }
  : new Pool({ connectionString: process.env.DATABASE_URL });
```

(Match the existing connectionString or env-var reference — read the current line first; do not invent a new env name. If the existing code uses something like `PGHOST`/`PGUSER` etc., keep that and only gate it on `SKIP_PG_CONNECT`.)

Also ensure the `server.listen(...)` call is gated:

```javascript
if (!process.env.SKIP_PG_CONNECT) {
  server.listen(PORT, () => console.log(`[brett] listening on ${PORT}`));
}
```

- [ ] **Step 4: Extend relay allowlist + persist mayhem_mode + include in snapshot**

In `brett/server.js`:

(a) `applyMutation` — add a case after `'stiffness'`:

```javascript
    case 'mayhem_mode':
      figs.set('__mayhem__', { id: '__mayhem__', enabled: !!msg.enabled });
      break;
```

(b) Also remove the duplicate `case 'stiffness':` block (lines ~313–317 in current file are a copy of ~308–312 — drop the second one).

(c) `buildStateFromMutations` — extend special-figure filter and result:

```javascript
function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const SPECIAL = ['__optik__', '__stiffness__', '__mayhem__'];
  const figures = Array.from(figs.values()).filter(f => !SPECIAL.includes(f.id));
  const optikEntry  = figs.get('__optik__');
  const stiffEntry  = figs.get('__stiffness__');
  const mayhemEntry = figs.get('__mayhem__');
  const result = { figures };
  if (optikEntry)  result.optik     = optikEntry.settings;
  if (stiffEntry)  result.stiffness = stiffEntry.value;
  if (mayhemEntry) result.mayhem    = !!mayhemEntry.enabled;
  return result;
}
```

(d) Find the relay allowlist (line ~392):

```javascript
      if (['add','move','update','delete','clear','optik','stiffness',
           'mayhem_mode','player_join','player_state','player_leave',
           'hit','vehicle_spawn'].includes(msg.type)) {
        applyMutation(room, msg);
        broadcast(room, msg, ws);
        if (msg.type === 'clear') {
          flushImmediate(room).catch(err => console.error('[brett] flush:', err));
        } else if (msg.type === 'mayhem_mode') {
          schedulePersist(room);
        }
        // player_join/state/leave/hit/vehicle_spawn are pure relay — no persist
      }
```

- [ ] **Step 5: Run test, expect pass**

```bash
cd brett && npm test
```

Expected: `tests 10 \n pass 10 \n fail 0`.

- [ ] **Step 6: Commit**

```bash
git add brett/server.js brett/test/server-mayhem.test.js
git commit -m "feat(brett): server-side mayhem_mode persistence + relay allowlist"
```

---

## Task 6: Server — broadcast player_leave on disconnect

**Files:**
- Modify: `brett/server.js:406-410` (the `ws.on('close', ...)` handler)
- Modify: `brett/test/server-mayhem.test.js`

- [ ] **Step 1: Write failing test**

Append to `brett/test/server-mayhem.test.js`:

```javascript
test('handleDisconnect: emits player_leave when ws had a _playerId', () => {
  const broadcasts = [];
  const fakeBroadcast = (room, msg) => broadcasts.push({ room, msg });
  const ws = { _room: 'test-room-3', _playerId: 'p-abc' };
  const { handleDisconnect } = require('../server.js');
  handleDisconnect(ws, fakeBroadcast);
  const leave = broadcasts.find(b => b.msg.type === 'player_leave');
  assert.ok(leave, 'expected player_leave broadcast');
  assert.strictEqual(leave.msg.playerId, 'p-abc');
});
```

- [ ] **Step 2: Run test, expect failure**

Expected: `TypeError: handleDisconnect is not a function`.

- [ ] **Step 3: Implement & export `handleDisconnect`**

In `brett/server.js`, extract the existing on-close logic into a named function:

```javascript
function handleDisconnect(ws, broadcastFn = broadcast) {
  const room = ws._room;
  if (!room) return;
  if (ws._playerId) {
    broadcastFn(room, { type: 'player_leave', playerId: ws._playerId }, ws);
  }
  leaveRoom(ws);
  broadcastInfo(room);
}
```

Replace the existing `ws.on('close', async () => { ... })` body to call the new function:

```javascript
    ws.on('close', () => handleDisconnect(ws));
```

Extend the bottom `module.exports`:

```javascript
module.exports = { app, server, pool, wss, applyMutation, buildStateFromMutations,
  figureMaps, handleDisconnect };
```

Also: when a `player_join` is relayed, stash the playerId on the ws so disconnect can find it. In the relay branch:

```javascript
        if (msg.type === 'player_join' && typeof msg.playerId === 'string') {
          ws._playerId = msg.playerId;
        }
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd brett && npm test
```

Expected: `tests 11 \n pass 11 \n fail 0`.

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/server-mayhem.test.js
git commit -m "feat(brett): broadcast player_leave on ws disconnect"
```

---

## Task 7: Chase camera module

Pure browser module. No unit tests — covered by visual QA.

**Files:**
- Create: `brett/public/assets/mayhem/chase-camera.js`

- [ ] **Step 1: Implement**

Create `brett/public/assets/mayhem/chase-camera.js`:

```javascript
'use strict';

// Third-person chase camera + pointer-lock yaw/pitch.
// Usage: const cam = new ChaseCamera(threeCamera, canvas);
//        cam.attach(targetObject); cam.update(dt);
class ChaseCamera {
  constructor(threeCamera, canvas) {
    this.cam = threeCamera;
    this.canvas = canvas;
    this.target = null;
    this.yaw = 0;
    this.pitch = -0.2;
    this.distance = 3.0;
    this.height = 1.5;
    this.sensitivity = 0.0025;
    this._locked = false;
    this._onMove = this._onMove.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    canvas.addEventListener('click', () => {
      if (this.target) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mousemove', this._onMove);
  }
  _onLockChange() {
    this._locked = (document.pointerLockElement === this.canvas);
  }
  _onMove(e) {
    if (!this._locked) return;
    this.yaw   -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = Math.max(-1.2, Math.min(0.5, this.pitch));
  }
  attach(obj) { this.target = obj; }
  detach() {
    this.target = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  getYaw() { return this.yaw; }
  update() {
    if (!this.target) return;
    const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw),   cosY = Math.cos(this.yaw);
    const ox = sinY * this.distance * cosP;
    const oz = cosY * this.distance * cosP;
    const oy = this.height + sinP * this.distance;
    this.cam.position.set(
      this.target.position.x + ox,
      this.target.position.y + oy,
      this.target.position.z + oz
    );
    this.cam.lookAt(
      this.target.position.x,
      this.target.position.y + 1.0,
      this.target.position.z
    );
  }
  dispose() {
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMove);
    this.detach();
  }
}

if (typeof window !== 'undefined') window.MayhemChaseCamera = ChaseCamera;
```

- [ ] **Step 2: Commit**

```bash
git add brett/public/assets/mayhem/chase-camera.js
git commit -m "feat(brett): chase camera + pointer-lock for mayhem mode"
```

---

## Task 8: PlayerAvatar module

**Files:**
- Create: `brett/public/assets/mayhem/player-avatar.js`

- [ ] **Step 1: Implement**

Create `brett/public/assets/mayhem/player-avatar.js`:

```javascript
'use strict';
// PlayerAvatar — wraps a mannequin built by index.html's makeMannequin().
// State machine: idle | running | flailing | ragdoll | recovering.
// Local avatars take input. Remote avatars are interpolated from network packets.

const STATE = Object.freeze({
  IDLE: 'idle', RUNNING: 'running', FLAILING: 'flailing',
  RAGDOLL: 'ragdoll', RECOVERING: 'recovering',
});
const WALK_SPEED = 2.6;
const SPRINT_MUL = 1.6;
const JUMP_VY = 4.0;
const FLAIL_AMP_SHOULDER = Math.PI / 2;
const FLAIL_AMP_ELBOW    = Math.PI / 3;
const RAGDOLL_DURATION_MS = 3000;
const RECOVER_DURATION_MS = 400;
const HIT_DEBOUNCE_MS = 200;

class PlayerAvatar {
  constructor({ id, mannequin, local, color }) {
    this.id = id;
    this.mannequin = mannequin;       // result of makeMannequin()
    this.local = !!local;
    this.color = color;
    this.state = STATE.IDLE;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facingY = 0;
    this.flailing = false;
    this.ragdollUntil = 0;
    this.recoverUntil = 0;
    this.lastHits = new Map();        // victimId -> timestamp
    this.netTarget = null;            // remote interp target { x,y,z,yaw,anim,flailing }
    this._t = 0;
    this._applyColor();
  }
  _applyColor() {
    // Tint torso so users are distinguishable.
    const torso = this.mannequin.hips.children[0];
    if (torso && torso.material) torso.material.color.setStyle(this.color);
  }
  setInput(input) { this._input = input; }
  setNetState(payload) { this.netTarget = payload; }
  getStatePayload() {
    return {
      x: this.mannequin.root.position.x,
      y: this.mannequin.root.position.y,
      z: this.mannequin.root.position.z,
      yaw: this.facingY,
      anim: this.state,
      flailing: this.flailing,
    };
  }
  applyHit(impulse, source) {
    this.state = STATE.RAGDOLL;
    this.ragdollUntil = performance.now() + RAGDOLL_DURATION_MS;
    this.vx = impulse.x;
    this.vz = impulse.z;
    this.vy = source === 'vehicle' ? 5.0 : 3.0;
    // seed bone velocities for limp tumble
    const b = this.mannequin.bone;
    for (const k of Object.keys(b)) {
      b[k].velocity.x = (Math.random() - 0.5) * 6;
      b[k].velocity.z = (Math.random() - 0.5) * 6;
      b[k].targetRot.x = 0;
      b[k].targetRot.z = 0;
    }
  }
  canHit(victimId) {
    const t = performance.now();
    const last = this.lastHits.get(victimId) || 0;
    if (t - last < HIT_DEBOUNCE_MS) return false;
    this.lastHits.set(victimId, t);
    return true;
  }
  update(dt, camYaw) {
    const now = performance.now();
    this._t += dt;
    if (this.state === STATE.RAGDOLL) return this._updateRagdoll(dt, now);
    if (this.state === STATE.RECOVERING) return this._updateRecover(dt, now);
    if (this.local) this._updateLocal(dt, camYaw, now);
    else this._updateRemote(dt);
    this._animate(dt);
  }
  _updateLocal(dt, camYaw, now) {
    const inp = this._input || {};
    let fx = 0, fz = 0;
    if (inp.forward)  { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
    if (inp.backward) { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
    if (inp.left)     { fx += Math.sin(camYaw - Math.PI/2); fz += Math.cos(camYaw - Math.PI/2); }
    if (inp.right)    { fx += Math.sin(camYaw + Math.PI/2); fz += Math.cos(camYaw + Math.PI/2); }
    const mag = Math.hypot(fx, fz);
    const speed = WALK_SPEED * (inp.sprint ? SPRINT_MUL : 1);
    if (mag > 0.01) {
      this.vx = (fx / mag) * speed;
      this.vz = (fz / mag) * speed;
      this.facingY = Math.atan2(fx, fz);
      this.state = STATE.RUNNING;
    } else {
      this.vx = 0; this.vz = 0;
      this.state = STATE.IDLE;
    }
    if (inp.jump && this.mannequin.root.position.y <= 0.001) {
      this.vy = JUMP_VY;
    }
    this.vy -= 9.8 * dt;
    this.mannequin.root.position.x += this.vx * dt;
    this.mannequin.root.position.y += this.vy * dt;
    this.mannequin.root.position.z += this.vz * dt;
    if (this.mannequin.root.position.y < 0) {
      this.mannequin.root.position.y = 0; this.vy = 0;
    }
    this.mannequin.root.rotation.y = this.facingY;
    this.flailing = !!inp.flail;
    if (this.flailing) this.state = STATE.FLAILING;
  }
  _updateRemote(dt) {
    if (!this.netTarget) return;
    const r = this.mannequin.root;
    const a = 0.2; // lerp factor per frame at ~60fps ≈ 100ms ease
    r.position.x += (this.netTarget.x - r.position.x) * a;
    r.position.y += (this.netTarget.y - r.position.y) * a;
    r.position.z += (this.netTarget.z - r.position.z) * a;
    this.facingY += (this.netTarget.yaw - this.facingY) * a;
    r.rotation.y = this.facingY;
    this.state = this.netTarget.anim || STATE.IDLE;
    this.flailing = !!this.netTarget.flailing;
  }
  _updateRagdoll(dt, now) {
    const physics = window.MayhemPhysics;
    // Root falls under gravity (simplified — uses physics.integrateRagdollRoot via shim)
    const root = { y: this.mannequin.root.position.y, vy: this.vy };
    physics.integrateRagdollRoot(root, dt);
    this.mannequin.root.position.y = root.y;
    this.vy = root.vy;
    this.mannequin.root.position.x += this.vx * dt;
    this.mannequin.root.position.z += this.vz * dt;
    this.vx *= 0.96; this.vz *= 0.96;
    for (const k of Object.keys(this.mannequin.bone)) {
      physics.integrateRagdollBone(this.mannequin.bone[k], dt);
      this._applyBoneRotation(k);
    }
    if (now >= this.ragdollUntil) {
      this.state = STATE.RECOVERING;
      this.recoverUntil = now + RECOVER_DURATION_MS;
    }
  }
  _updateRecover(dt, now) {
    const t = 1 - Math.max(0, (this.recoverUntil - now) / RECOVER_DURATION_MS);
    // ease bones back to zero
    for (const k of Object.keys(this.mannequin.bone)) {
      const b = this.mannequin.bone[k];
      b.currentRot.x *= (1 - t * 0.2);
      b.currentRot.z *= (1 - t * 0.2);
      b.velocity.x = 0; b.velocity.z = 0;
      this._applyBoneRotation(k);
    }
    this.mannequin.root.position.y += (1.0 - this.mannequin.root.position.y) * t * 0.2;
    if (now >= this.recoverUntil) {
      this.state = STATE.IDLE;
      this.mannequin.root.position.y = 0;
      for (const k of Object.keys(this.mannequin.bone)) {
        const b = this.mannequin.bone[k];
        b.currentRot.x = 0; b.currentRot.z = 0;
        this._applyBoneRotation(k);
      }
    }
  }
  _animate(dt) {
    const b = this.mannequin.bone;
    if (this.state === STATE.RUNNING || this.state === STATE.FLAILING) {
      const phase = this._t * 8;
      // legs swing
      b.lHip.targetRot.x = Math.sin(phase) * 0.6;
      b.rHip.targetRot.x = -Math.sin(phase) * 0.6;
      if (this.flailing) {
        b.lShoulder.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.lShoulder.targetRot.z = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.rShoulder.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.rShoulder.targetRot.z = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.lElbow.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_ELBOW;
        b.rElbow.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_ELBOW;
      } else {
        b.lShoulder.targetRot.x = -Math.sin(phase) * 0.6;
        b.rShoulder.targetRot.x =  Math.sin(phase) * 0.6;
        b.lElbow.targetRot.x = 0; b.rElbow.targetRot.x = 0;
      }
    } else if (this.state === STATE.IDLE) {
      for (const k of Object.keys(b)) {
        b[k].targetRot.x = 0; b[k].targetRot.z = 0;
      }
    }
    // spring solve toward target (matches existing Brett pattern)
    const STIFF = 0.65, DAMP = 0.85;
    for (const k of Object.keys(b)) {
      const bs = b[k];
      const ax = (bs.targetRot.x - bs.currentRot.x) * STIFF;
      const az = (bs.targetRot.z - bs.currentRot.z) * STIFF;
      bs.velocity.x = bs.velocity.x * DAMP + ax * dt * 60;
      bs.velocity.z = bs.velocity.z * DAMP + az * dt * 60;
      bs.currentRot.x += bs.velocity.x * dt;
      bs.currentRot.z += bs.velocity.z * dt;
      this._applyBoneRotation(k);
    }
  }
  _applyBoneRotation(name) {
    const node = this.mannequin.bones[name];
    if (!node) return;
    const r = this.mannequin.bone[name].currentRot;
    node.rotation.x = r.x;
    node.rotation.z = r.z;
  }
  getCapsule() {
    return {
      x: this.mannequin.root.position.x,
      y: this.mannequin.root.position.y,
      z: this.mannequin.root.position.z,
      radius: 0.35, height: 1.8,
    };
  }
  getWristWorldPositions() {
    const out = [];
    for (const name of ['lWrist', 'rWrist']) {
      const node = this.mannequin.bones[name];
      if (!node) continue;
      const v = new window.THREE.Vector3();
      node.getWorldPosition(v);
      out.push({ x: v.x, y: v.y, z: v.z, radius: 0.18 });
    }
    return out;
  }
  remove(scene) {
    scene.remove(this.mannequin.root);
  }
}

PlayerAvatar.STATE = STATE;
if (typeof window !== 'undefined') window.MayhemPlayerAvatar = PlayerAvatar;
```

- [ ] **Step 2: Commit**

```bash
git add brett/public/assets/mayhem/player-avatar.js
git commit -m "feat(brett): PlayerAvatar state machine + animation"
```

---

## Task 9: Vehicle module

**Files:**
- Create: `brett/public/assets/mayhem/vehicle.js`

- [ ] **Step 1: Implement**

Create `brett/public/assets/mayhem/vehicle.js`:

```javascript
'use strict';
const VEHICLE_SPEED = 6.0;
const VEHICLE_DESPAWN_DIST = 12.0;
const VEHICLE_SIZE = { w: 1.5, h: 1.0, d: 1.0 };

class Vehicle {
  constructor({ id, scene, fromX, fromZ, dirX, dirZ, kind = 'cart' }) {
    this.id = id;
    this.kind = kind;
    this.dirX = dirX;
    this.dirZ = dirZ;
    this.startX = fromX;
    this.startZ = fromZ;
    const THREE = window.THREE;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VEHICLE_SIZE.w, VEHICLE_SIZE.h, VEHICLE_SIZE.d),
      new THREE.MeshLambertMaterial({ color: 0x707070 })
    );
    this.mesh.position.set(fromX, VEHICLE_SIZE.h / 2, fromZ);
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);
    scene.add(this.mesh);
    this.alive = true;
  }
  update(dt) {
    if (!this.alive) return;
    this.mesh.position.x += this.dirX * VEHICLE_SPEED * dt;
    this.mesh.position.z += this.dirZ * VEHICLE_SPEED * dt;
    const dx = this.mesh.position.x - this.startX;
    const dz = this.mesh.position.z - this.startZ;
    if (Math.hypot(dx, dz) > VEHICLE_DESPAWN_DIST) this.alive = false;
  }
  getAABB() {
    const p = this.mesh.position;
    return {
      minX: p.x - VEHICLE_SIZE.w / 2, maxX: p.x + VEHICLE_SIZE.w / 2,
      minY: p.y - VEHICLE_SIZE.h / 2, maxY: p.y + VEHICLE_SIZE.h / 2,
      minZ: p.z - VEHICLE_SIZE.d / 2, maxZ: p.z + VEHICLE_SIZE.d / 2,
    };
  }
  getImpulse() {
    const M = 12.0;
    return { x: this.dirX * M, z: this.dirZ * M };
  }
  remove(scene) { scene.remove(this.mesh); this.alive = false; }
}

Vehicle.SPEED = VEHICLE_SPEED;
if (typeof window !== 'undefined') window.MayhemVehicle = Vehicle;
```

- [ ] **Step 2: Commit**

```bash
git add brett/public/assets/mayhem/vehicle.js
git commit -m "feat(brett): Vehicle class — straight-line traversal + AABB"
```

---

## Task 10: Mayhem mode controller

**Files:**
- Create: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Step 1: Implement**

Create `brett/public/assets/mayhem/mayhem.js`:

```javascript
'use strict';
// Mode controller. Wires together avatars, vehicle, camera, input, networking.
// External API:
//   Mayhem.init({ scene, camera, canvas, makeMannequin, sendMessage, roomToken });
//   Mayhem.onSnapshot(snapshot);   // called once per join with server snapshot
//   Mayhem.onMessage(msg);         // called for every relayed message
//   Mayhem.toggle();               // toolbar action
//   Mayhem.tick(dt);               // called from render loop every frame

const Mayhem = (() => {
  const STATE_RATE_HZ = 15;
  const VEHICLE_COOLDOWN_MS = 5000;
  let scene, camera, canvas, makeMannequin, send, room;
  let enabled = false;
  let localAvatar = null;
  const remoteAvatars = new Map();   // playerId -> PlayerAvatar
  const vehicles = new Map();         // vehicleId -> Vehicle
  let chaseCam = null;
  let banner = null;
  let lastStateSent = 0;
  let lastVehicleSpawn = 0;
  const input = { forward: false, backward: false, left: false, right: false,
                  sprint: false, jump: false, flail: false };
  let playerId = null;

  function init(opts) {
    ({ scene, camera, canvas, makeMannequin, sendMessage: send, roomToken: room } = opts);
    if (!opts.sendMessage) throw new Error('Mayhem.init: sendMessage required');
    send = opts.sendMessage;
    playerId = crypto.randomUUID();
    bindKeys();
    chaseCam = new window.MayhemChaseCamera(camera, canvas);
  }

  function bindKeys() {
    const map = {
      'KeyW': 'forward', 'KeyS': 'backward', 'KeyA': 'left', 'KeyD': 'right',
      'ShiftLeft': 'sprint', 'ShiftRight': 'sprint',
      'Space': 'jump', 'KeyF': 'flail',
    };
    window.addEventListener('keydown', (e) => {
      if (!enabled) return;
      if (map[e.code]) { input[map[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyV') spawnVehicleLocal();
      if (e.code === 'KeyM') toggle();
    });
    window.addEventListener('keyup', (e) => {
      if (map[e.code]) input[map[e.code]] = false;
    });
    canvas.addEventListener('mousedown', (e) => { if (enabled && e.button === 0) input.flail = true; });
    canvas.addEventListener('mouseup',   (e) => { if (e.button === 0) input.flail = false; });
  }

  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    if (on) start(); else stop();
  }

  function toggle() {
    send({ type: 'mayhem_mode', enabled: !enabled });
  }

  function start() {
    showBanner();
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const edge = randomEdgeSpawn();
    const mannequin = makeMannequin(playerId, edge);
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color });
    chaseCam.attach(localAvatar.mannequin.root);
    send({ type: 'player_join', playerId, color });
  }

  function stop() {
    hideBanner();
    if (localAvatar) {
      send({ type: 'player_leave', playerId });
      localAvatar.remove(scene);
      localAvatar = null;
    }
    for (const a of remoteAvatars.values()) a.remove(scene);
    remoteAvatars.clear();
    for (const v of vehicles.values()) v.remove(scene);
    vehicles.clear();
    chaseCam.detach();
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:8px;' +
      'font:14px sans-serif;z-index:1000;pointer-events:none;';
    banner.textContent = '🤸 Mayhem-Modus aktiv — WASD/Maus zum Steuern, F flailen, V Fahrzeug, M zum Beenden';
    document.body.appendChild(banner);
  }
  function hideBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  function randomEdgeSpawn() {
    const edge = Math.floor(Math.random() * 4);
    const r = 4;
    if (edge === 0) return { x: -r, z: (Math.random() - 0.5) * 2 * r };
    if (edge === 1) return { x:  r, z: (Math.random() - 0.5) * 2 * r };
    if (edge === 2) return { x: (Math.random() - 0.5) * 2 * r, z: -r };
    return { x: (Math.random() - 0.5) * 2 * r, z:  r };
  }

  function spawnVehicleLocal() {
    const now = performance.now();
    if (now - lastVehicleSpawn < VEHICLE_COOLDOWN_MS) return;
    if (!localAvatar) return;
    lastVehicleSpawn = now;
    const yaw = localAvatar.facingY;
    const dirX = Math.cos(yaw);
    const dirZ = -Math.sin(yaw);
    const fromX = localAvatar.mannequin.root.position.x - dirX * 6;
    const fromZ = localAvatar.mannequin.root.position.z - dirZ * 6;
    const id = crypto.randomUUID();
    send({ type: 'vehicle_spawn', vehicleId: id, kind: 'cart',
           fromX, fromZ, dirX, dirZ, speed: window.MayhemVehicle.SPEED, spawnedAt: Date.now() });
    spawnVehicleFromMsg({ vehicleId: id, fromX, fromZ, dirX, dirZ });
  }

  function spawnVehicleFromMsg(msg) {
    const v = new window.MayhemVehicle({
      id: msg.vehicleId, scene, fromX: msg.fromX, fromZ: msg.fromZ,
      dirX: msg.dirX, dirZ: msg.dirZ,
    });
    vehicles.set(msg.vehicleId, v);
  }

  function onSnapshot(snap) {
    setEnabled(!!snap.mayhem);
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'mayhem_mode': setEnabled(!!msg.enabled); break;
      case 'player_join':
        if (msg.playerId === playerId) return;
        if (remoteAvatars.has(msg.playerId)) return;
        const m = makeMannequin(msg.playerId, { x: 0, z: 0 });
        remoteAvatars.set(msg.playerId,
          new window.MayhemPlayerAvatar({ id: msg.playerId, mannequin: m, local: false, color: msg.color || '#888' }));
        break;
      case 'player_state':
        if (msg.playerId === playerId) return;
        const a = remoteAvatars.get(msg.playerId);
        if (a) a.setNetState(msg);
        break;
      case 'player_leave':
        const al = remoteAvatars.get(msg.playerId);
        if (al) { al.remove(scene); remoteAvatars.delete(msg.playerId); }
        break;
      case 'hit':
        const victim = (msg.victimId === playerId) ? localAvatar : remoteAvatars.get(msg.victimId);
        if (victim) victim.applyHit(msg.impulse, msg.source);
        break;
      case 'vehicle_spawn':
        if (!vehicles.has(msg.vehicleId)) spawnVehicleFromMsg(msg);
        break;
    }
  }

  function tick(dt) {
    if (!enabled) return;
    const yaw = chaseCam ? chaseCam.getYaw() : 0;
    if (localAvatar) {
      localAvatar.setInput(input);
      localAvatar.update(dt, yaw);
    }
    for (const a of remoteAvatars.values()) a.update(dt, 0);
    for (const v of vehicles.values()) {
      v.update(dt);
      if (!v.alive) { v.remove(scene); vehicles.delete(v.id); }
    }
    chaseCam.update();
    detectCollisions();
    maybeSendState();
  }

  function detectCollisions() {
    if (!localAvatar) return;
    const physics = window.MayhemPhysics;
    // Flail wrist -> other avatar torsos
    if (localAvatar.flailing) {
      const wrists = localAvatar.getWristWorldPositions();
      for (const a of remoteAvatars.values()) {
        if (a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        const cap = a.getCapsule();
        for (const w of wrists) {
          // wrist sphere = treat as zero-height capsule
          const sphereAsCap = { x: w.x, y: w.y - 0.18, z: w.z, radius: w.radius, height: 0.36 };
          if (physics.capsuleCapsule(sphereAsCap, cap)) {
            if (localAvatar.canHit(a.id)) sendHit(a.id, 'flail', impulseToward(a, localAvatar, 4));
          }
        }
      }
    }
    // Vehicle AABB -> all avatars (local + remote)
    for (const v of vehicles.values()) {
      const box = v.getAABB();
      const targets = [localAvatar, ...remoteAvatars.values()];
      for (const a of targets) {
        if (!a || a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        if (physics.aabbCapsule(box, a.getCapsule())) {
          if (localAvatar.canHit(a.id)) sendHit(a.id, 'vehicle', v.getImpulse());
        }
      }
    }
  }

  function impulseToward(target, source, mag) {
    const dx = target.mannequin.root.position.x - source.mannequin.root.position.x;
    const dz = target.mannequin.root.position.z - source.mannequin.root.position.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: (dx / m) * mag, z: (dz / m) * mag };
  }

  function sendHit(victimId, source, impulse) {
    const msg = { type: 'hit', victimId, source, impulse, durationMs: 3000 };
    send(msg);
    // apply locally too so we don't wait for echo
    const v = (victimId === playerId) ? localAvatar : remoteAvatars.get(victimId);
    if (v) v.applyHit(impulse, source);
  }

  function maybeSendState() {
    if (!localAvatar) return;
    const now = performance.now();
    if (now - lastStateSent < 1000 / STATE_RATE_HZ) return;
    lastStateSent = now;
    send({ type: 'player_state', playerId, ...localAvatar.getStatePayload() });
  }

  return { init, onSnapshot, onMessage, toggle, tick, setEnabled,
           _internal: { remoteAvatars, vehicles, get localAvatar() { return localAvatar; } } };
})();

if (typeof window !== 'undefined') window.Mayhem = Mayhem;
```

- [ ] **Step 2: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): mayhem mode controller + WS message dispatch"
```

---

## Task 11: Wire mayhem into `index.html`

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add script tags**

In `brett/public/index.html`, find the existing `<script src="assets/three.min.js"></script>` tag (search for `three.min.js`). Immediately after the closing `</script>` of the existing inline scene code (i.e. at the very end of the body, after Brett's main script), add:

```html
<script src="assets/mayhem/physics.js"></script>
<script src="assets/mayhem/chase-camera.js"></script>
<script src="assets/mayhem/player-avatar.js"></script>
<script src="assets/mayhem/vehicle.js"></script>
<script src="assets/mayhem/mayhem.js"></script>
```

Place these BEFORE the Brett main inline `<script>` so that `window.Mayhem` is available when Brett initialises. Adjust as needed — confirm by reading the current bottom of `index.html`.

- [ ] **Step 2: Add toolbar button**

Find the existing toolbar (search for the first button in `index.html`, e.g. `figPanelBtn` or "Hinzufügen"). Adjacent to it add:

```html
<button id="mayhem-btn" type="button" style="margin-left:8px;">🤸 Mayhem</button>
```

- [ ] **Step 3: Wire button + dispatch**

In Brett's main inline `<script>`, after `scene`, `camera`, `renderer`, and the websocket are constructed (search for `new WebSocket(` and the place where snapshots/messages are handled), add an init block:

```javascript
// --- Mayhem mode wiring ---
if (window.Mayhem) {
  // Find the existing send-message helper or wrap ws.send:
  const mayhemSend = (msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* ignore */ } };
  const canvasEl = renderer.domElement;
  window.Mayhem.init({
    scene, camera, canvas: canvasEl,
    makeMannequin: (id, pos) => makeMannequin(id, pos),
    sendMessage: mayhemSend,
    roomToken: ROOM_TOKEN,
  });
  document.getElementById('mayhem-btn').addEventListener('click', () => window.Mayhem.toggle());
}
```

Then locate the inline `ws.onmessage` handler. After Brett finishes its own handling for a message, route remaining message types to Mayhem:

```javascript
// after Brett's existing dispatch:
if (window.Mayhem) {
  if (msg.type === 'snapshot') window.Mayhem.onSnapshot(msg);
  else window.Mayhem.onMessage(msg);
}
```

In the render loop (search for `requestAnimationFrame` or the function that calls `renderer.render`), add at the top of the per-frame work:

```javascript
const dt = Math.min(0.05, (now - lastFrame) / 1000); // already exists in some form
if (window.Mayhem) window.Mayhem.tick(dt);
```

If Brett's existing render loop doesn't have a `dt`, derive one with `performance.now()` from the last frame timestamp.

- [ ] **Step 4: Smoke test in dev cluster**

```bash
task dev:redeploy:brett
```

Then open `https://brett.dev.mentolder.de/` (or whichever dev URL Brett is at — check `task dev:cluster:status`). Verify:

- Brett loads normally
- Toolbar shows "🤸 Mayhem" button
- Clicking it shows the banner
- WASD moves the avatar; mouse rotates camera after canvas click
- Holding F flails arms
- V spawns a vehicle that crosses the plane
- Open in a second browser tab in the same room: two avatars visible, hits ragdoll each other

Manual QA — record findings, file follow-up bugs as separate T-tickets if anything is off.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): wire mayhem mode into index.html"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd brett && npm test
```

Expected: all unit tests pass.

- [ ] **Step 2: Validate manifests**

```bash
task workspace:validate
```

Expected: dry-run passes (no manifest changes were made, this is sanity).

- [ ] **Step 3: Workspace test suite**

```bash
task test:all
```

Expected: all offline tests pass.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/brett-ragdoll-mayhem
```

- [ ] **Step 5: PR**

Use `commit-commands:commit-push-pr` or `gh pr create`. Title: `feat(brett): mayhem mode — running, flailing, ragdoll vehicles`. Body summarises spec and links the design doc + ticket.

---

## Acceptance Checklist (post-deploy, manual QA)

After merging and deploying via `task feature:brett`:

- [ ] Mayhem toggle persists across page reload (server-side state)
- [ ] Joining a room with mayhem ON spawns your avatar at an edge
- [ ] WASD controls work; Shift sprints; Space hops; mouse rotates camera after canvas click; Esc releases lock
- [ ] Holding F flails arms — visible large oscillation
- [ ] Flail wrist hitting another avatar's torso triggers ragdoll on that avatar
- [ ] Ragdolled avatar collapses for ~3 s, then stands up
- [ ] V spawns a vehicle that crosses the plane in a straight line
- [ ] Vehicle hitting an avatar ragdolls them
- [ ] Toggling mayhem OFF clears avatars/vehicles; Aufstellung figures unchanged
- [ ] Two browsers in the same room see each other's avatars + hits sync
- [ ] No console errors on either mode
