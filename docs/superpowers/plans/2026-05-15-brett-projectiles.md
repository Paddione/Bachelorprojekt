---
title: Brett Projectiles & Combat System — Implementation Plan
domains: []
status: active
pr_number: null
---

# Brett Projectiles & Combat System — Implementation Plan
ticket_id: T000404

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five weapons (handgun, rifle, fireball, club, katana), victim-authoritative HP, blood/fire FX, cover obstacles, and three game modes (Warmup/Deathmatch/LMS) to the Systembrett Mayhem mode.

**Architecture:** All game logic runs client-side in vanilla JS loaded via `<script>` tags; the Node.js WebSocket server is a dumb relay except for LMS alive-tracking. New modules (`weapons.js`, `projectiles.js`, `effects.js`, `obstacles.js`, `game-mode.js`) follow the existing IIFE + `window.*` global pattern. Victim's client is authoritative for HP — it receives `hit`, deducts HP, and broadcasts `hp_update`.

**Tech Stack:** Three.js (already bundled as `three.min.js`), vanilla JS ES2020, Node.js `node:test` for server/physics tests, browser for manual FX verification.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `brett/public/assets/mayhem/physics.js` | Add `integrateRagdollRoot`, `integrateRagdollBone` |
| Modify | `brett/public/assets/mayhem/player-avatar.js` | Add `hp`, `applyDamage()`, `isDead`, Death state, fix leg anim |
| Modify | `brett/server.js` | Relay new message types; LMS alive-set per room |
| Create | `brett/public/assets/mayhem/obstacles.js` | Layout gen, AABB collision for projectiles + player push-out |
| Create | `brett/public/assets/mayhem/weapons.js` | Weapon configs, active weapon, cooldown, keybindings 1–5 |
| Create | `brett/public/assets/mayhem/projectiles.js` | Projectile movement, hit-detection vs players + obstacles |
| Create | `brett/public/assets/mayhem/effects.js` | Blood decals, fire particles, swoosh, floating HP bars, HUD |
| Create | `brett/public/assets/mayhem/game-mode.js` | Mode FSM: warmup/deathmatch/lms, respawn logic, LMS spectator cam |
| Modify | `brett/public/index.html` | 5 new script tags, HUD div, mode toggle button |
| Modify | `brett/public/assets/mayhem/mayhem.js` | Init/tick/route new modules + new message types |
| Modify | `brett/test/physics.test.js` | Tests for new ragdoll integration functions |
| Modify | `brett/test/server-mayhem.test.js` | Tests for new relay types + LMS server logic |

---

## Task 1: Fix Physics — integrateRagdollRoot + integrateRagdollBone

These two functions are called in `player-avatar.js` but missing from `physics.js`. Ragdoll currently crashes silently.

**Files:**
- Modify: `brett/public/assets/mayhem/physics.js`
- Modify: `brett/test/physics.test.js`

- [ ] **Step 1: Write failing tests**

Append to `brett/test/physics.test.js`:

```js
test('integrateRagdollRoot: applies gravity and integrates y', () => {
  const root = { y: 2.0, vy: 0 };
  physics.integrateRagdollRoot(root, 0.1);
  // vy should become -9.8 * 0.1 = -0.98; y should become 2.0 + (-0.98 * 0.1) = 1.902
  assert.ok(root.vy < 0, 'vy should be negative after gravity');
  assert.ok(root.y < 2.0, 'y should decrease');
});

test('integrateRagdollRoot: clamps y at ground and zeroes vy', () => {
  const root = { y: 0.0, vy: -5.0 };
  physics.integrateRagdollRoot(root, 0.1);
  assert.strictEqual(root.y, 0);
  assert.strictEqual(root.vy, 0);
});

test('integrateRagdollBone: damps velocity and integrates rotation', () => {
  const bone = { velocity: { x: 1.0, z: 0.5 }, currentRot: { x: 0, z: 0 } };
  physics.integrateRagdollBone(bone, 0.016);
  assert.ok(bone.velocity.x < 1.0, 'velocity should damp');
  assert.ok(bone.currentRot.x !== 0, 'rotation should integrate');
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd brett && node --test test/physics.test.js
```

Expected: `TypeError: physics.integrateRagdollRoot is not a function`

- [ ] **Step 3: Implement the functions**

In `brett/public/assets/mayhem/physics.js`, add before `const api = ...`:

```js
function integrateRagdollRoot(root, dt) {
  root.vy -= 9.8 * dt;
  root.y += root.vy * dt;
  if (root.y < 0) { root.y = 0; root.vy = 0; }
}

function integrateRagdollBone(bone, dt) {
  bone.velocity.x *= 0.85;
  bone.velocity.z *= 0.85;
  bone.currentRot.x += bone.velocity.x * dt;
  bone.currentRot.z += bone.velocity.z * dt;
}
```

Add both to `const api`:

```js
const api = { capsuleCapsule, aabbCapsule, integrateRagdollRoot, integrateRagdollBone };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd brett && node --test test/physics.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/physics.js brett/test/physics.test.js
git commit -m "fix(brett): add missing integrateRagdollRoot and integrateRagdollBone to physics"
```

---

## Task 2: Player Avatar — HP System + Leg Animation Fix

**Files:**
- Modify: `brett/public/assets/mayhem/player-avatar.js`

- [ ] **Step 1: Add `hp`, `applyDamage`, `isDead`, Death state, and fix leg anim**

In the `constructor`, after `this.lastHits = new Map();`:

```js
this.hp = 100;
this.burnInterval = null;
```

After the existing `applyHit` method, add:

```js
applyDamage(amount) {
  if (this.isDead) return;
  this.hp = Math.max(0, this.hp - amount);
}

get isDead() { return this.hp <= 0; }

resetHp() {
  this.hp = 100;
  if (this.burnInterval) { clearInterval(this.burnInterval); this.burnInterval = null; }
}

startBurn(damagePerSec, durationSec, onTick) {
  if (this.burnInterval) { clearInterval(this.burnInterval); }
  let elapsed = 0;
  this.burnInterval = setInterval(() => {
    elapsed++;
    this.applyDamage(damagePerSec);
    if (onTick) onTick(this.hp);
    if (elapsed >= durationSec || this.isDead) {
      clearInterval(this.burnInterval);
      this.burnInterval = null;
    }
  }, 1000);
}
```

Add `STATE.DEAD` to the STATE object at the top of the file:

```js
const STATE = Object.freeze({
  IDLE: 'idle', RUNNING: 'running', FLAILING: 'flailing',
  RAGDOLL: 'ragdoll', RECOVERING: 'recovering', DEAD: 'dead',
});
```

In `applyHit`, at the very start add a dead-guard:

```js
applyHit(impulse, source) {
  if (this.isDead) return;
  // ... rest unchanged
```

Fix leg animation speed in `_animate`. Find `const phase = this._t * 8;` and replace with:

```js
const inp = this._input || {};
const phase = this._t * (inp.sprint ? 14 : 10);
```

- [ ] **Step 2: Verify no test regressions**

```bash
cd brett && node --test test/
```

Expected: all tests pass (player-avatar.js is browser-only so no direct unit test — regressions caught in server/physics tests).

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/player-avatar.js
git commit -m "feat(brett): add HP system, applyDamage, burn, Death state; fix leg anim speed"
```

---

## Task 3: Server — New Relay Types + LMS Tracking

**Files:**
- Modify: `brett/server.js`
- Modify: `brett/test/server-mayhem.test.js`

- [ ] **Step 1: Write failing tests**

Append to `brett/test/server-mayhem.test.js`:

```js
test('relay list includes hp_update and player_death', () => {
  const { RELAY_TYPES } = require('../server.js');
  assert.ok(RELAY_TYPES.includes('hp_update'), 'hp_update should relay');
  assert.ok(RELAY_TYPES.includes('player_death'), 'player_death should relay');
  assert.ok(RELAY_TYPES.includes('player_respawn'), 'player_respawn should relay');
  assert.ok(RELAY_TYPES.includes('obstacle_layout'), 'obstacle_layout should relay');
  assert.ok(RELAY_TYPES.includes('game_mode_change'), 'game_mode_change should relay');
});

test('applyMutation: game_mode_change stored in room state', () => {
  const { applyMutation, buildStateFromMutations } = require('../server.js');
  const room = 'test-lms-1';
  applyMutation(room, { type: 'game_mode_change', mode: 'lms' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.gameMode, 'lms');
});

test('lms: player_death removes player from alive set', () => {
  const { lmsAlive, handleLmsDeath } = require('../server.js');
  const room = 'test-lms-2';
  lmsAlive.set(room, new Set(['p1', 'p2', 'p3']));
  const result = handleLmsDeath(room, 'p2');
  assert.strictEqual(lmsAlive.get(room).size, 2);
  assert.strictEqual(result.winner, null);
});

test('lms: player_death with one remaining returns winner', () => {
  const { lmsAlive, handleLmsDeath } = require('../server.js');
  const room = 'test-lms-3';
  lmsAlive.set(room, new Set(['p1', 'p2']));
  const result = handleLmsDeath(room, 'p2');
  assert.strictEqual(result.winner, 'p1');
});

test('lms: simultaneous death returns draw', () => {
  const { lmsAlive, handleLmsDeath } = require('../server.js');
  const room = 'test-lms-4';
  lmsAlive.set(room, new Set(['p1']));
  const result = handleLmsDeath(room, 'p1');
  assert.strictEqual(result.draw, true);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd brett && node --test test/server-mayhem.test.js
```

Expected: `TypeError: RELAY_TYPES is not exported` or similar.

- [ ] **Step 3: Implement server changes**

In `brett/server.js`, extract the relay type list into a named constant. Find the inline array in the ws message handler:

```js
if (['add','move','update','delete','clear','optik','stiffness','jump',
     'mayhem_mode','player_join','player_state','player_leave',
     'hit','vehicle_spawn'].includes(msg.type)) {
```

Replace with a constant defined at module top (after the `const pending = new Map()` line):

```js
const RELAY_TYPES = [
  'add','move','update','delete','clear','optik','stiffness','jump',
  'mayhem_mode','player_join','player_state','player_leave',
  'hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
  'obstacle_layout','game_mode_change',
];
```

And update the condition to use it:

```js
if (RELAY_TYPES.includes(msg.type)) {
```

Also update the no-persist condition to include the new transient types. Find:

```js
} else if (msg.type !== 'jump' && msg.type !== 'player_join' &&
           msg.type !== 'player_state' && msg.type !== 'player_leave' &&
           msg.type !== 'hit' && msg.type !== 'vehicle_spawn') {
```

Replace with:

```js
const TRANSIENT_TYPES = new Set([
  'jump','player_join','player_state','player_leave','hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
]);
} else if (!TRANSIENT_TYPES.has(msg.type)) {
```

Add `game_mode_change` and LMS tracking to `applyMutation`. In the switch, after the `mayhem_mode` case:

```js
case 'game_mode_change':
  if (['warmup','deathmatch','lms'].includes(msg.mode)) {
    figs.set('__game_mode__', { id: '__game_mode__', mode: msg.mode });
    if (msg.mode === 'lms') {
      // Snapshot current players into alive set — populated from player_join tracking
      // (alive set is rebuilt when lms starts; see lmsAlive below)
    }
  }
  break;
```

In `buildStateFromMutations`, add after the `mayhemEntry` block:

```js
const gameModeEntry = figs.get('__game_mode__');
const SPECIAL = ['__optik__', '__stiffness__', '__mayhem__', '__game_mode__'];
// (update SPECIAL array to include __game_mode__)
if (gameModeEntry) result.gameMode = gameModeEntry.mode;
```

Add LMS tracking map and helper function near the top of server.js (after `const pending = new Map()`):

```js
const lmsAlive = new Map(); // room -> Set<playerId>

function handleLmsDeath(room, victimId) {
  const alive = lmsAlive.get(room);
  if (!alive) return { winner: null, draw: false };
  alive.delete(victimId);
  if (alive.size === 0) return { winner: null, draw: true };
  if (alive.size === 1) return { winner: [...alive][0], draw: false };
  return { winner: null, draw: false };
}
```

In the ws message handler, after the relay broadcast, add LMS logic:

```js
if (msg.type === 'player_join' && typeof msg.playerId === 'string') {
  ws._playerId = msg.playerId;
  // Track in lms alive set if lms mode active
  const state = buildStateFromMutations(room);
  if (state && state.gameMode === 'lms') {
    if (!lmsAlive.has(room)) lmsAlive.set(room, new Set());
    lmsAlive.get(room).add(msg.playerId);
  }
}

if (msg.type === 'game_mode_change' && msg.mode === 'lms') {
  // Rebuild alive set from currently connected players
  const alive = new Set();
  if (rooms.has(room)) {
    for (const ws of rooms.get(room)) {
      if (ws._playerId) alive.add(ws._playerId);
    }
  }
  lmsAlive.set(room, alive);
}

if (msg.type === 'player_death') {
  const state = buildStateFromMutations(room);
  if (state && state.gameMode === 'lms') {
    const result = handleLmsDeath(room, msg.playerId);
    if (result.draw) broadcast(room, { type: 'lms_draw' });
    else if (result.winner) broadcast(room, { type: 'lms_winner', playerId: result.winner });
  }
}
```

Export new items at the bottom:

```js
module.exports = {
  app, server, pool, wss,
  applyMutation, buildStateFromMutations, figureMaps,
  handleDisconnect, RELAY_TYPES, lmsAlive, handleLmsDeath,
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd brett && node --test test/
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/server-mayhem.test.js
git commit -m "feat(brett): relay new combat message types, add LMS server tracking"
```

---

## Task 4: Obstacles Module

**Files:**
- Create: `brett/public/assets/mayhem/obstacles.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const MayhemObstacles = (() => {
  let scene = null;
  const meshes = [];  // { mesh, aabb }

  const TYPES = {
    pillar:  { w: 0.6,  h: 2.0, d: 0.6,  color: 0x556677 },
    crate:   { w: 0.9,  h: 0.9, d: 0.9,  color: 0x8B6914 },
    barrel:  { w: 0.5,  h: 1.0, d: 0.5,  color: 0x445566 },
    wall_l:  { w: 2.0,  h: 1.5, d: 0.4,  color: 0x667788 },
  };

  function seededRandom(seed) {
    let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 1);
    return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
  }

  function generateLayout(roomToken) {
    const rng = seededRandom(roomToken);
    const obstacles = [];
    const specs = [
      ...Array(5).fill('pillar'),
      ...Array(2).fill('wall_l'),
      ...Array(4).fill('crate'),
      ...Array(3).fill('barrel'),
    ];

    for (const kind of specs) {
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        const x = (rng() - 0.5) * 12;
        const z = (rng() - 0.5) * 12;
        const rotY = rng() * Math.PI * 2;
        if (Math.hypot(x, z) < 2.5) continue; // keep center clear for spawning
        const tooClose = obstacles.some(o => Math.hypot(o.x - x, o.z - z) < 1.8);
        if (tooClose) continue;
        obstacles.push({ kind, x, z, rotY });
        break;
      }
    }
    return obstacles;
  }

  function spawnObstacle({ kind, x, z, rotY }) {
    const THREE = window.THREE;
    const spec = TYPES[kind];
    if (!spec) return;
    let geo;
    if (kind === 'pillar' || kind === 'barrel') {
      geo = new THREE.CylinderGeometry(spec.w / 2, spec.w / 2, spec.h, 8);
    } else {
      geo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
    }
    const mat = new THREE.MeshLambertMaterial({ color: spec.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, spec.h / 2, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);

    // Axis-aligned bounding box (ignore rotY for simplicity — conservative)
    const hw = Math.max(spec.w, spec.d) / 2;
    const aabb = {
      minX: x - hw, maxX: x + hw,
      minY: 0,       maxY: spec.h,
      minZ: z - hw, maxZ: z + hw,
    };
    meshes.push({ mesh, aabb });
  }

  function init(sceneRef) {
    scene = sceneRef;
  }

  function applyLayout(obstacles) {
    clear();
    for (const o of obstacles) spawnObstacle(o);
  }

  function clear() {
    for (const { mesh } of meshes) scene.remove(mesh);
    meshes.length = 0;
  }

  function getAABBs() {
    return meshes.map(m => m.aabb);
  }

  // Returns true if capsule overlaps any obstacle AABB.
  function capsuleHitsAny(cap) {
    return meshes.some(({ aabb }) => window.MayhemPhysics.aabbCapsule(aabb, cap));
  }

  // Push a position out of all obstacle AABBs (XZ only).
  function pushOutXZ(pos, radius) {
    for (const { aabb } of meshes) {
      const cx = Math.max(aabb.minX, Math.min(pos.x, aabb.maxX));
      const cz = Math.max(aabb.minZ, Math.min(pos.z, aabb.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist < radius && dist > 0) {
        const over = radius - dist;
        pos.x += (dx / dist) * over;
        pos.z += (dz / dist) * over;
      } else if (dist === 0) {
        pos.x += radius; // degenerate: push right
      }
    }
  }

  return { init, generateLayout, applyLayout, clear, getAABBs, capsuleHitsAny, pushOutXZ };
})();

if (typeof window !== 'undefined') window.MayhemObstacles = MayhemObstacles;
```

- [ ] **Step 2: Verify file exists and syntax is clean**

```bash
node -e "
const { JSDOM } = require('jsdom') || {};
// Basic syntax check via Node
" 2>&1 || node --input-type=module < brett/public/assets/mayhem/obstacles.js 2>&1 | head -5 || echo "syntax ok (browser module)"
```

Since this is a browser module, do a basic Node syntax check:

```bash
node -c brett/public/assets/mayhem/obstacles.js
```

Expected: `brett/public/assets/mayhem/obstacles.js OK`

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/obstacles.js
git commit -m "feat(brett): add MayhemObstacles module with seeded layout + AABB collision"
```

---

## Task 5: Weapons Module

**Files:**
- Create: `brett/public/assets/mayhem/weapons.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const MayhemWeapons = (() => {
  const DEFS = {
    handgun: {
      slot: 1, label: 'Handgun', type: 'ranged',
      damage: 35, cooldownMs: 600, projectileSpeed: 18,
      burst: 1, burstDelayMs: 0,
    },
    rifle: {
      slot: 2, label: 'Rifle', type: 'ranged',
      damage: 20, cooldownMs: 900, projectileSpeed: 22,
      burst: 3, burstDelayMs: 120,
    },
    fireball: {
      slot: 3, label: 'Fireball', type: 'ranged',
      damage: 15, cooldownMs: 1200, projectileSpeed: 10,
      burst: 1, burstDelayMs: 0,
      gravity: true, burnDps: 5, burnDuration: 4,
    },
    club: {
      slot: 4, label: 'Keule', type: 'melee',
      damage: 55, cooldownMs: 1200,
      windupMs: 500, arcRadius: 1.5, arcAngle: Math.PI * 0.7,
    },
    katana: {
      slot: 5, label: 'Katana', type: 'melee',
      damage: 25, cooldownMs: 300,
      windupMs: 50, arcRadius: 2.0, arcAngle: Math.PI * 0.8,
    },
  };

  const SLOT_MAP = Object.fromEntries(
    Object.entries(DEFS).map(([k, v]) => [v.slot, k])
  );

  let activeKey = 'handgun';
  let lastFiredAt = 0;
  let burstState = null; // { remaining, nextAt, weaponKey }

  function getActive() { return DEFS[activeKey]; }
  function getActiveKey() { return activeKey; }

  function selectSlot(slot) {
    const key = SLOT_MAP[slot];
    if (key) { activeKey = key; lastFiredAt = 0; }
  }

  // Returns array of fire events if weapon is ready, else [].
  // Each event: { weaponKey, def, burstIndex }
  function tryFire(now) {
    const def = DEFS[activeKey];
    const cooldown = def.cooldownMs;
    if (now - lastFiredAt < cooldown) return [];
    lastFiredAt = now;
    if (def.burst <= 1) return [{ weaponKey: activeKey, def, burstIndex: 0 }];
    // Multi-burst: return first shot now; schedule rest via burstState
    burstState = { remaining: def.burst - 1, nextAt: now + def.burstDelayMs, weaponKey: activeKey };
    return [{ weaponKey: activeKey, def, burstIndex: 0 }];
  }

  // Call each tick to emit pending burst shots.
  function tickBurst(now) {
    if (!burstState || burstState.remaining <= 0) return [];
    if (now < burstState.nextAt) return [];
    const wk = burstState.weaponKey; // capture before possible null
    const def = DEFS[wk];
    const index = def.burst - burstState.remaining;
    burstState.remaining--;
    burstState.nextAt = now + def.burstDelayMs;
    if (burstState.remaining <= 0) burstState = null;
    return [{ weaponKey: wk, def, burstIndex: index }];
  }

  function getDefs() { return DEFS; }

  return { getActive, getActiveKey, selectSlot, tryFire, tickBurst, getDefs };
})();

if (typeof window !== 'undefined') window.MayhemWeapons = MayhemWeapons;
```

- [ ] **Step 2: Syntax check**

```bash
node -c brett/public/assets/mayhem/weapons.js
```

Expected: `brett/public/assets/mayhem/weapons.js OK`

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/weapons.js
git commit -m "feat(brett): add MayhemWeapons module with 5 weapon definitions and cooldown/burst logic"
```

---

## Task 6: Projectiles Module

**Files:**
- Create: `brett/public/assets/mayhem/projectiles.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const MayhemProjectiles = (() => {
  const MAX_RANGE = 30;
  let scene = null;
  const active = new Map(); // id -> projectile

  function init(sceneRef) { scene = sceneRef; }

  function spawn({ id, weaponKey, def, fromPos, facingY, send }) {
    const THREE = window.THREE;
    const dirX = Math.sin(facingY);
    const dirZ = Math.cos(facingY);

    const color = weaponKey === 'fireball' ? 0xff6600 :
                  weaponKey === 'handgun'  ? 0xffff88 : 0xffffff;
    const size  = weaponKey === 'fireball' ? 0.25 : 0.08;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.set(fromPos.x, fromPos.y + 1.2, fromPos.z);
    scene.add(mesh);

    active.set(id, {
      id, weaponKey, def, mesh,
      dirX, dirZ, vy: 0,
      traveledSq: 0, send,
      startX: fromPos.x, startZ: fromPos.z,
    });
  }

  function tick(dt, localAvatar, remoteAvatars) {
    for (const [id, p] of active) {
      const speed = p.def.projectileSpeed || 15;
      const dx = p.dirX * speed * dt;
      const dz = p.dirZ * speed * dt;

      if (p.def.gravity) p.vy -= 2.0 * dt;
      p.mesh.position.x += dx;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += dz;
      if (p.mesh.position.y < 0.05) p.mesh.position.y = 0.05;

      p.traveledSq += dx * dx + dz * dz;

      // Despawn if out of range
      if (p.traveledSq > MAX_RANGE * MAX_RANGE) { _remove(id); continue; }

      // Obstacle hit
      const pCap = { x: p.mesh.position.x, y: 0, z: p.mesh.position.z, radius: 0.12, height: 1.8 };
      if (window.MayhemObstacles && window.MayhemObstacles.capsuleHitsAny(pCap)) {
        _remove(id); continue;
      }

      // Player hit
      let hit = false;
      const targets = [];
      if (localAvatar) targets.push(localAvatar);
      for (const a of remoteAvatars.values()) targets.push(a);

      for (const avatar of targets) {
        if (avatar.isDead) continue;
        const cap = avatar.getCapsule();
        const projAsSphere = { x: p.mesh.position.x, y: p.mesh.position.y - 0.12, z: p.mesh.position.z, radius: 0.15, height: 0.24 };
        if (window.MayhemPhysics.capsuleCapsule(projAsSphere, cap)) {
          const impulse = { x: p.dirX * 3, z: p.dirZ * 3 };
          p.send({
            type: 'hit',
            victimId: avatar.id,
            shooterId: localAvatar ? localAvatar.id : null,
            damage: p.def.damage,
            weaponType: p.weaponKey,
            impulse,
            durationMs: 1500,
          });
          _remove(id);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }
  }

  function _remove(id) {
    const p = active.get(id);
    if (p) { scene.remove(p.mesh); active.delete(id); }
  }

  function clear() {
    for (const id of active.keys()) _remove(id);
  }

  return { init, spawn, tick, clear };
})();

if (typeof window !== 'undefined') window.MayhemProjectiles = MayhemProjectiles;
```

- [ ] **Step 2: Syntax check**

```bash
node -c brett/public/assets/mayhem/projectiles.js
```

Expected: `brett/public/assets/mayhem/projectiles.js OK`

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/projectiles.js
git commit -m "feat(brett): add MayhemProjectiles module with per-tick movement and hit detection"
```

---

## Task 7: Effects Module

**Files:**
- Create: `brett/public/assets/mayhem/effects.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const MayhemEffects = (() => {
  const THREE = () => window.THREE;
  let scene = null;

  const bloodDecals = [];
  const MAX_DECALS = 40;

  const floatingBars = new Map(); // playerId -> { sprite, canvas, ctx }

  let hudHpBar = null;
  let hudWeaponLabel = null;
  let hudSlots = [];

  // ── Blood splat ────────────────────────────────────────────────
  function spawnBlood(x, z) {
    const T = THREE();
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8B0000';
    // Irregular blob via arcs
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const rx = 20 + Math.random() * 40;
      const ry = 20 + Math.random() * 40;
      const ox = 20 + Math.random() * 88;
      const oy = 20 + Math.random() * 88;
      ctx.ellipse(ox, oy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new T.CanvasTexture(canvas);
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const geo = new T.PlaneGeometry(0.8 + Math.random() * 0.6, 0.8 + Math.random() * 0.6);
    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, 0.01, z);
    scene.add(mesh);
    const entry = { mesh, mat, born: performance.now(), life: 6000 };
    bloodDecals.push(entry);
    if (bloodDecals.length > MAX_DECALS) {
      const old = bloodDecals.shift();
      scene.remove(old.mesh);
    }
  }

  // ── Fire effect (attached to avatar root) ─────────────────────
  const fireParticleSets = new Map(); // victimId -> [sprites]

  function startFire(victimId, avatarRoot) {
    stopFire(victimId);
    const T = THREE();
    const sprites = [];
    for (let i = 0; i < 10; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      const grd = ctx.createRadialGradient(16, 16, 2, 16, 16, 14);
      grd.addColorStop(0, 'rgba(255,220,0,0.9)');
      grd.addColorStop(0.5, 'rgba(255,80,0,0.6)');
      grd.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2); ctx.fill();
      const tex = new T.CanvasTexture(canvas);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true }));
      const offset = { x: (Math.random() - 0.5) * 0.5, y: 0.5 + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.5 };
      sp.userData.offset = offset;
      sp.scale.set(0.4, 0.5, 1);
      scene.add(sp);
      sprites.push(sp);
    }
    fireParticleSets.set(victimId, { sprites, root: avatarRoot, born: performance.now() });
  }

  function stopFire(victimId) {
    const set = fireParticleSets.get(victimId);
    if (!set) return;
    for (const sp of set.sprites) scene.remove(sp);
    fireParticleSets.delete(victimId);
  }

  function tickFire(now) {
    for (const [id, set] of fireParticleSets) {
      if (now - set.born > 4000) { stopFire(id); continue; }
      for (const sp of set.sprites) {
        const t = ((now * 0.001 + sp.userData.offset.y) % 1.0);
        sp.position.set(
          set.root.position.x + sp.userData.offset.x,
          set.root.position.y + sp.userData.offset.y + t * 0.3,
          set.root.position.z + sp.userData.offset.z,
        );
        sp.material.opacity = 1 - t;
      }
    }
  }

  // ── Floating HP bars ──────────────────────────────────────────
  function createFloatingBar(playerId) {
    const T = THREE();
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 10;
    const ctx = canvas.getContext('2d');
    const tex = new T.CanvasTexture(canvas);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.0, 0.16, 1);
    scene.add(sp);
    floatingBars.set(playerId, { sprite: sp, canvas, ctx, tex });
  }

  function updateFloatingBar(playerId, hp, rootPosition) {
    if (!floatingBars.has(playerId)) createFloatingBar(playerId);
    const { sprite, canvas, ctx, tex } = floatingBars.get(playerId);
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 64, 10);
    const pct = Math.max(0, Math.min(1, hp / 100));
    ctx.fillStyle = pct > 0.5 ? '#44cc44' : pct > 0.25 ? '#cccc00' : '#cc2222';
    ctx.fillRect(1, 1, Math.round(62 * pct), 8);
    tex.needsUpdate = true;
    sprite.position.set(rootPosition.x, rootPosition.y + 2.3, rootPosition.z);
  }

  function removeFloatingBar(playerId) {
    const bar = floatingBars.get(playerId);
    if (bar) { scene.remove(bar.sprite); floatingBars.delete(playerId); }
  }

  // ── HUD ───────────────────────────────────────────────────────
  function initHud(weaponDefs) {
    const hud = document.createElement('div');
    hud.id = 'mayhem-hud';
    hud.style.cssText = 'position:fixed;bottom:16px;left:16px;pointer-events:none;z-index:999;font:13px sans-serif;';

    // HP bar
    const hpWrap = document.createElement('div');
    hpWrap.style.cssText = 'background:#333;width:180px;height:14px;border-radius:4px;margin-bottom:8px;overflow:hidden;';
    hudHpBar = document.createElement('div');
    hudHpBar.style.cssText = 'height:100%;width:100%;background:#44cc44;transition:width 0.1s,background 0.1s;';
    hpWrap.appendChild(hudHpBar);

    // Weapon slots
    const slots = document.createElement('div');
    slots.style.cssText = 'display:flex;gap:6px;';
    hudSlots = [];
    for (const [key, def] of Object.entries(weaponDefs)) {
      const slot = document.createElement('div');
      slot.dataset.weapon = key;
      slot.style.cssText = 'padding:4px 8px;background:rgba(0,0,0,0.6);color:#ccc;border-radius:4px;border:1px solid #555;';
      slot.textContent = `${def.slot} ${def.label}`;
      slots.appendChild(slot);
      hudSlots.push(slot);
    }

    // Weapon label
    hudWeaponLabel = document.createElement('div');
    hudWeaponLabel.style.cssText = 'color:#fff;margin-top:6px;font-weight:bold;';

    hud.appendChild(hpWrap);
    hud.appendChild(slots);
    hud.appendChild(hudWeaponLabel);
    document.body.appendChild(hud);
  }

  function updateHudHp(hp) {
    if (!hudHpBar) return;
    const pct = Math.max(0, Math.min(100, hp));
    hudHpBar.style.width = pct + '%';
    hudHpBar.style.background = pct > 50 ? '#44cc44' : pct > 25 ? '#cccc00' : '#cc2222';
  }

  function updateHudWeapon(activeKey) {
    for (const slot of hudSlots) {
      const active = slot.dataset.weapon === activeKey;
      slot.style.border = active ? '1px solid #fff' : '1px solid #555';
      slot.style.color = active ? '#fff' : '#888';
    }
    if (hudWeaponLabel) hudWeaponLabel.textContent = activeKey.toUpperCase();
  }

  function removeHud() {
    const el = document.getElementById('mayhem-hud');
    if (el) el.remove();
    hudHpBar = null; hudWeaponLabel = null; hudSlots = [];
  }

  // ── Katana swoosh ─────────────────────────────────────────────
  const swooshes = [];

  function spawnSwoosh(x, y, z, facingY) {
    const T = THREE();
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 128, 0);
    grd.addColorStop(0, 'rgba(200,220,255,0)');
    grd.addColorStop(0.4, 'rgba(200,220,255,0.7)');
    grd.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 8, 128, 16);
    const tex = new T.CanvasTexture(canvas);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(2.0, 0.5, 1);
    sp.position.set(
      x + Math.sin(facingY) * 1.0,
      y + 1.0,
      z + Math.cos(facingY) * 1.0,
    );
    scene.add(sp);
    swooshes.push({ sprite: sp, mat: sp.material, born: performance.now() });
  }

  function tickSwooshes(now) {
    for (let i = swooshes.length - 1; i >= 0; i--) {
      const s = swooshes[i];
      const age = now - s.born;
      if (age > 150) { scene.remove(s.sprite); swooshes.splice(i, 1); continue; }
      s.mat.opacity = 1 - age / 150;
    }
  }

  // ── Blood decal tick ──────────────────────────────────────────
  function tickDecals(now) {
    for (let i = bloodDecals.length - 1; i >= 0; i--) {
      const d = bloodDecals[i];
      const age = now - d.born;
      if (age > d.life) { scene.remove(d.mesh); bloodDecals.splice(i, 1); continue; }
      if (age > d.life * 0.7) d.mat.opacity = 1 - (age - d.life * 0.7) / (d.life * 0.3);
    }
  }

  // ── Main tick ─────────────────────────────────────────────────
  function tick() {
    const now = performance.now();
    tickFire(now);
    tickSwooshes(now);
    tickDecals(now);
  }

  function init(sceneRef, weaponDefs) {
    scene = sceneRef;
    initHud(weaponDefs);
  }

  function destroy() {
    for (const d of bloodDecals) scene.remove(d.mesh);
    bloodDecals.length = 0;
    for (const [id] of fireParticleSets) stopFire(id);
    for (const [id, bar] of floatingBars) scene.remove(bar.sprite);
    floatingBars.clear();
    for (const s of swooshes) scene.remove(s.sprite);
    swooshes.length = 0;
    removeHud();
  }

  return {
    init, tick, destroy,
    spawnBlood, startFire, stopFire,
    updateFloatingBar, removeFloatingBar,
    updateHudHp, updateHudWeapon,
    spawnSwoosh,
  };
})();

if (typeof window !== 'undefined') window.MayhemEffects = MayhemEffects;
```

- [ ] **Step 2: Syntax check**

```bash
node -c brett/public/assets/mayhem/effects.js
```

Expected: `brett/public/assets/mayhem/effects.js OK`

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/effects.js
git commit -m "feat(brett): add MayhemEffects with blood decals, fire particles, floating HP bars, HUD, swoosh"
```

---

## Task 8: Game Mode Module

**Files:**
- Create: `brett/public/assets/mayhem/game-mode.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const MayhemGameMode = (() => {
  const MODES = ['warmup', 'deathmatch', 'lms'];
  let mode = 'warmup';
  let send = null;
  let localPlayerId = null;
  let chaseCam = null;

  let respawnTimer = null;
  let killCounts = new Map(); // playerId -> count
  let lmsAliveCount = 0;

  let respawnBanner = null;
  let killCounterEl = null;
  let lmsCounterEl = null;

  function init(opts) {
    send = opts.send;
    localPlayerId = opts.localPlayerId;
    chaseCam = opts.chaseCam;
    _initUI();
  }

  function _initUI() {
    respawnBanner = document.createElement('div');
    respawnBanner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:rgba(0,0,0,0.8);color:#fff;padding:20px 36px;border-radius:12px;' +
      'font:22px sans-serif;z-index:2000;display:none;text-align:center;';
    document.body.appendChild(respawnBanner);

    killCounterEl = document.createElement('div');
    killCounterEl.style.cssText = 'position:fixed;top:12px;right:16px;color:#fff;' +
      'font:bold 16px sans-serif;display:none;z-index:999;';
    document.body.appendChild(killCounterEl);

    lmsCounterEl = document.createElement('div');
    lmsCounterEl.style.cssText = 'position:fixed;top:12px;right:16px;color:#ff8800;' +
      'font:bold 16px sans-serif;display:none;z-index:999;';
    document.body.appendChild(lmsCounterEl);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && mode === 'warmup') _doRespawn();
    });
  }

  function getMode() { return mode; }

  function setMode(newMode, allAvatars) {
    if (!MODES.includes(newMode)) return;
    mode = newMode;
    killCounts.clear();
    killCounterEl.style.display = mode === 'deathmatch' ? 'block' : 'none';
    lmsCounterEl.style.display = mode === 'lms' ? 'block' : 'none';
    lmsAliveCount = allAvatars ? allAvatars.size + 1 : 1;
    _updateLmsCounter();
  }

  function onPlayerDeath(victimId, killerId, localAvatar, remoteAvatars) {
    const isLocal = victimId === localPlayerId;

    // Kill counter for deathmatch
    if (mode === 'deathmatch' && killerId) {
      killCounts.set(killerId, (killCounts.get(killerId) || 0) + 1);
      _updateKillCounter(localPlayerId);
    }

    if (isLocal) {
      if (mode === 'warmup') {
        _showRespawnBanner('💀 Du bist tot — [R] zum Respawnen');
      } else if (mode === 'deathmatch') {
        _showRespawnBanner('💀 Respawning…');
        respawnTimer = setTimeout(() => _doRespawn(), 3000);
      } else if (mode === 'lms') {
        _showRespawnBanner('💀 Eliminated — Spectating');
        _startSpectate(remoteAvatars);
      }
    }

    if (mode === 'lms') {
      lmsAliveCount = Math.max(0, lmsAliveCount - 1);
      _updateLmsCounter();
    }
  }

  function onLmsWinner(winnerId) {
    const msg = winnerId === localPlayerId ? '🏆 Du hast gewonnen!' : `🏆 Spieler gewonnen!`;
    _showRespawnBanner(msg);
    setTimeout(() => _hideRespawnBanner(), 5000);
  }

  function onLmsDraw() {
    _showRespawnBanner('🤝 Unentschieden!');
    setTimeout(() => _hideRespawnBanner(), 4000);
  }

  function onRespawn() {
    _hideRespawnBanner();
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
  }

  function _doRespawn() {
    const edge = _randomEdge();
    send({ type: 'player_respawn', playerId: localPlayerId, x: edge.x, z: edge.z });
    _hideRespawnBanner();
  }

  function _randomEdge() {
    const r = 5;
    const e = Math.floor(Math.random() * 4);
    if (e === 0) return { x: -r, z: (Math.random() - 0.5) * 2 * r };
    if (e === 1) return { x:  r, z: (Math.random() - 0.5) * 2 * r };
    if (e === 2) return { x: (Math.random() - 0.5) * 2 * r, z: -r };
    return { x: (Math.random() - 0.5) * 2 * r, z: r };
  }

  function _startSpectate(remoteAvatars) {
    const alive = [...remoteAvatars.values()].filter(a => !a.isDead);
    if (alive.length > 0 && chaseCam) {
      chaseCam.attach(alive[0].mannequin.root);
    }
  }

  function _updateKillCounter(myId) {
    killCounterEl.textContent = `Kills: ${killCounts.get(myId) || 0}`;
  }

  function _updateLmsCounter() {
    lmsCounterEl.textContent = `Alive: ${lmsAliveCount}`;
  }

  function _showRespawnBanner(text) {
    respawnBanner.textContent = text;
    respawnBanner.style.display = 'block';
  }

  function _hideRespawnBanner() {
    respawnBanner.style.display = 'none';
  }

  function destroy() {
    if (respawnTimer) clearTimeout(respawnTimer);
    if (respawnBanner) respawnBanner.remove();
    if (killCounterEl) killCounterEl.remove();
    if (lmsCounterEl) lmsCounterEl.remove();
  }

  return { init, getMode, setMode, onPlayerDeath, onLmsWinner, onLmsDraw, onRespawn, destroy };
})();

if (typeof window !== 'undefined') window.MayhemGameMode = MayhemGameMode;
```

- [ ] **Step 2: Syntax check**

```bash
node -c brett/public/assets/mayhem/game-mode.js
```

Expected: `brett/public/assets/mayhem/game-mode.js OK`

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/game-mode.js
git commit -m "feat(brett): add MayhemGameMode with warmup/deathmatch/LMS respawn and spectator logic"
```

---

## Task 9: Wire Everything — index.html + mayhem.js

**Files:**
- Modify: `brett/public/index.html`
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Step 1: Add script tags and HUD to index.html**

In `brett/public/index.html`, find the existing script tags block at the bottom:

```html
<script src="assets/mayhem/physics.js"></script>
<script src="assets/mayhem/chase-camera.js"></script>
<script src="assets/mayhem/player-avatar.js"></script>
<script src="assets/mayhem/vehicle.js"></script>
<script src="assets/mayhem/mayhem.js"></script>
```

Replace with:

```html
<script src="assets/mayhem/physics.js"></script>
<script src="assets/mayhem/chase-camera.js"></script>
<script src="assets/mayhem/player-avatar.js"></script>
<script src="assets/mayhem/vehicle.js"></script>
<script src="assets/mayhem/obstacles.js"></script>
<script src="assets/mayhem/weapons.js"></script>
<script src="assets/mayhem/projectiles.js"></script>
<script src="assets/mayhem/effects.js"></script>
<script src="assets/mayhem/game-mode.js"></script>
<script src="assets/mayhem/mayhem.js"></script>
```

Find the mayhem button line:

```html
<button id="mayhem-btn" type="button" style="margin-left:8px;">🤸 Mayhem</button>
```

Add a mode toggle button after it:

```html
<button id="mayhem-btn" type="button" style="margin-left:8px;">🤸 Mayhem</button>
<button id="mayhem-mode-btn" type="button" style="margin-left:4px;display:none;">🎮 Warmup</button>
```

- [ ] **Step 2: Rewrite mayhem.js to wire all new modules**

Replace `brett/public/assets/mayhem/mayhem.js` with the full wired version:

```js
'use strict';

const Mayhem = (() => {
  const STATE_RATE_HZ = 15;
  const VEHICLE_COOLDOWN_MS = 5000;
  let scene, camera, canvas, makeMannequin, send, room;
  let enabled = false;
  let localAvatar = null;
  const remoteAvatars = new Map();
  const vehicles = new Map();
  let chaseCam = null;
  let banner = null;
  let lastStateSent = 0;
  let lastVehicleSpawn = 0;
  const input = { forward: false, backward: false, left: false, right: false,
                  sprint: false, jump: false, flail: false, fire: false };
  let playerId = null;
  let obstacleLayoutSent = false;

  function init(opts) {
    ({ scene, camera, canvas, makeMannequin, sendMessage: send, roomToken: room } = opts);
    send = opts.sendMessage;
    playerId = crypto.randomUUID();
    bindKeys();
    chaseCam = new window.MayhemChaseCamera(camera, canvas);

    window.MayhemObstacles.init(scene);
    window.MayhemProjectiles.init(scene);
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
      if (e.code === 'Digit1') window.MayhemWeapons.selectSlot(1);
      if (e.code === 'Digit2') window.MayhemWeapons.selectSlot(2);
      if (e.code === 'Digit3') window.MayhemWeapons.selectSlot(3);
      if (e.code === 'Digit4') window.MayhemWeapons.selectSlot(4);
      if (e.code === 'Digit5') window.MayhemWeapons.selectSlot(5);
      window.MayhemEffects.updateHudWeapon(window.MayhemWeapons.getActiveKey());
    });
    window.addEventListener('keyup', (e) => {
      if (map[e.code]) input[map[e.code]] = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!enabled) return;
      if (e.button === 0) input.fire = true;
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) input.fire = false;
    });

    document.getElementById('mayhem-mode-btn')?.addEventListener('click', () => {
      const modes = ['warmup', 'deathmatch', 'lms'];
      const cur = modes.indexOf(window.MayhemGameMode.getMode());
      const next = modes[(cur + 1) % modes.length];
      send({ type: 'game_mode_change', mode: next });
      _applyMode(next);
    });
  }

  function _applyMode(newMode) {
    window.MayhemGameMode.setMode(newMode, remoteAvatars);
    const btn = document.getElementById('mayhem-mode-btn');
    if (btn) btn.textContent = `🎮 ${newMode.charAt(0).toUpperCase() + newMode.slice(1)}`;
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

    window.MayhemEffects.init(scene, window.MayhemWeapons.getDefs());
    window.MayhemEffects.updateHudWeapon(window.MayhemWeapons.getActiveKey());
    window.MayhemEffects.updateHudHp(100);

    window.MayhemGameMode.init({ send, localPlayerId: playerId, chaseCam });

    document.getElementById('mayhem-mode-btn').style.display = '';

    // First player generates obstacle layout
    if (!obstacleLayoutSent) {
      obstacleLayoutSent = true;
      const obstacles = window.MayhemObstacles.generateLayout(room);
      window.MayhemObstacles.applyLayout(obstacles);
      send({ type: 'obstacle_layout', obstacles });
    }
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
    window.MayhemProjectiles.clear();
    window.MayhemObstacles.clear();
    window.MayhemEffects.destroy();
    window.MayhemGameMode.destroy();
    obstacleLayoutSent = false;
    document.getElementById('mayhem-mode-btn').style.display = 'none';
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:8px;' +
      'font:14px sans-serif;z-index:1000;pointer-events:none;';
    banner.textContent = '🤸 Mayhem — WASD/Maus, 1-5 Waffe, Klick Schießen, F Flail, V Fahrzeug, M Ende';
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
    if (snap.gameMode) _applyMode(snap.gameMode);
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'mayhem_mode': setEnabled(!!msg.enabled); break;

      case 'game_mode_change':
        _applyMode(msg.mode);
        break;

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
        if (al) {
          al.remove(scene);
          window.MayhemEffects.removeFloatingBar(msg.playerId);
          remoteAvatars.delete(msg.playerId);
        }
        break;

      case 'hit': {
        const victim = (msg.victimId === playerId) ? localAvatar : remoteAvatars.get(msg.victimId);
        if (victim) {
          victim.applyHit(msg.impulse, msg.source || msg.weaponType);
          // Blood on hit position
          if (victim.mannequin) {
            const pos = victim.mannequin.root.position;
            window.MayhemEffects.spawnBlood(pos.x, pos.z);
          }
          // Victim-authoritative HP
          if (msg.victimId === playerId && localAvatar) {
            localAvatar.applyDamage(msg.damage || 0);
            window.MayhemEffects.updateHudHp(localAvatar.hp);
            send({ type: 'hp_update', playerId, hp: localAvatar.hp });
            if (msg.weaponType === 'fireball') {
              localAvatar.startBurn(5, 4, (hp) => {
                window.MayhemEffects.updateHudHp(hp);
                send({ type: 'hp_update', playerId, hp });
                if (localAvatar.isDead) {
                  send({ type: 'player_death', playerId, killerId: msg.shooterId });
                  window.MayhemGameMode.onPlayerDeath(playerId, msg.shooterId, localAvatar, remoteAvatars);
                }
              });
              window.MayhemEffects.startFire(playerId, localAvatar.mannequin.root);
            }
            if (localAvatar.isDead) {
              send({ type: 'player_death', playerId, killerId: msg.shooterId });
              window.MayhemGameMode.onPlayerDeath(playerId, msg.shooterId, localAvatar, remoteAvatars);
            }
          }
          // Fire FX for remote victims
          if (msg.victimId !== playerId && msg.weaponType === 'fireball') {
            const rv = remoteAvatars.get(msg.victimId);
            if (rv) window.MayhemEffects.startFire(msg.victimId, rv.mannequin.root);
          }
        }
        break;
      }

      case 'hp_update': {
        if (msg.playerId === playerId) return;
        const av = remoteAvatars.get(msg.playerId);
        if (av) {
          av.hp = msg.hp;
          window.MayhemEffects.updateFloatingBar(msg.playerId, msg.hp, av.mannequin.root.position);
        }
        break;
      }

      case 'player_death': {
        if (msg.playerId !== playerId) {
          const dav = remoteAvatars.get(msg.playerId);
          if (dav) dav.hp = 0;
        }
        window.MayhemGameMode.onPlayerDeath(msg.playerId, msg.killerId, localAvatar, remoteAvatars);
        break;
      }

      case 'player_respawn': {
        const rav = (msg.playerId === playerId) ? localAvatar : remoteAvatars.get(msg.playerId);
        if (rav) {
          rav.mannequin.root.position.set(msg.x, 0, msg.z);
          rav.resetHp();
          rav.state = window.MayhemPlayerAvatar.STATE.IDLE;
          if (msg.playerId === playerId) {
            window.MayhemEffects.updateHudHp(100);
            window.MayhemGameMode.onRespawn();
            chaseCam.attach(rav.mannequin.root);
          }
        }
        break;
      }

      case 'obstacle_layout':
        if (!obstacleLayoutSent) {
          window.MayhemObstacles.applyLayout(msg.obstacles);
          obstacleLayoutSent = true;
        }
        break;

      case 'lms_winner':
        window.MayhemGameMode.onLmsWinner(msg.playerId);
        break;

      case 'lms_draw':
        window.MayhemGameMode.onLmsDraw();
        break;

      case 'vehicle_spawn':
        if (!vehicles.has(msg.vehicleId)) spawnVehicleFromMsg(msg);
        break;
    }
  }

  function tick(dt) {
    if (!enabled) return;
    const now = performance.now();
    const yaw = chaseCam ? chaseCam.getYaw() : 0;

    if (localAvatar && !localAvatar.isDead) {
      localAvatar.setInput(input);
      localAvatar.update(dt, yaw);

      // Push out of obstacles
      const pos = localAvatar.mannequin.root.position;
      window.MayhemObstacles.pushOutXZ(pos, 0.35);

      // Weapon fire — tryFire/tickBurst gate melee cooldown too
      if (input.fire) {
        const events = window.MayhemWeapons.tryFire(now);
        for (const ev of events) {
          if (ev.def.type === 'ranged') _doFire(ev, yaw);
          else _doMeleeCheck(ev.def, yaw, now);
        }
      }
      // Rifle burst follow-up shots
      const burstEvents = window.MayhemWeapons.tickBurst(now);
      for (const ev of burstEvents) _doFire(ev, yaw);

      // Update own floating HP bar
      window.MayhemEffects.updateFloatingBar(playerId, localAvatar.hp, localAvatar.mannequin.root.position);
    }

    for (const a of remoteAvatars.values()) {
      a.update(dt, 0);
      if (!a.isDead) {
        window.MayhemEffects.updateFloatingBar(a.id, a.hp, a.mannequin.root.position);
      }
    }

    for (const v of vehicles.values()) {
      v.update(dt);
      if (!v.alive) { v.remove(scene); vehicles.delete(v.id); }
    }

    window.MayhemProjectiles.tick(dt, localAvatar, remoteAvatars);
    window.MayhemEffects.tick();

    chaseCam.update();
    detectCollisions();
    maybeSendState();
  }

  function _doFire(ev, yaw) {
    if (!localAvatar || localAvatar.isDead) return;
    if (ev.def.type !== 'ranged') return;
    const pos = localAvatar.mannequin.root.position;
    window.MayhemProjectiles.spawn({
      id: crypto.randomUUID(),
      weaponKey: ev.weaponKey,
      def: ev.def,
      fromPos: pos,
      facingY: localAvatar.facingY,
      send,
    });
  }

  function _doMeleeCheck(def, yaw, now) {
    if (!localAvatar || localAvatar.isDead) return;
    if (!localAvatar.canHit('__melee_cooldown__' + def.slot)) return;

    if (def.slot === 5) { // katana
      window.MayhemEffects.spawnSwoosh(
        localAvatar.mannequin.root.position.x,
        localAvatar.mannequin.root.position.y,
        localAvatar.mannequin.root.position.z,
        localAvatar.facingY,
      );
    }

    const px = localAvatar.mannequin.root.position.x;
    const pz = localAvatar.mannequin.root.position.z;
    const facing = localAvatar.facingY;
    const arcR = def.arcRadius;
    const halfArc = def.arcAngle / 2;

    const targets = [...remoteAvatars.values()];
    for (const a of targets) {
      if (a.isDead) continue;
      const dx = a.mannequin.root.position.x - px;
      const dz = a.mannequin.root.position.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > arcR) continue;
      const angle = Math.atan2(dx, dz);
      let diff = angle - facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > halfArc) continue;

      const impulse = { x: (dx / dist) * (def.slot === 4 ? 8 : 4), z: (dz / dist) * (def.slot === 4 ? 8 : 4) };
      sendHit(a.id, def.slot === 4 ? 'club' : 'katana', impulse, def.damage);
    }
  }

  function detectCollisions() {
    if (!localAvatar) return;
    const physics = window.MayhemPhysics;
    if (localAvatar.flailing) {
      const wrists = localAvatar.getWristWorldPositions();
      for (const a of remoteAvatars.values()) {
        if (a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        const cap = a.getCapsule();
        for (const w of wrists) {
          const sphereAsCap = { x: w.x, y: w.y - 0.18, z: w.z, radius: w.radius, height: 0.36 };
          if (physics.capsuleCapsule(sphereAsCap, cap)) {
            if (localAvatar.canHit(a.id)) sendHit(a.id, 'flail', impulseToward(a, localAvatar, 4), 0);
          }
        }
      }
    }
    for (const v of vehicles.values()) {
      const box = v.getAABB();
      const targets = [localAvatar, ...remoteAvatars.values()];
      for (const a of targets) {
        if (!a || a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        if (physics.aabbCapsule(box, a.getCapsule())) {
          if (localAvatar.canHit(a.id)) sendHit(a.id, 'vehicle', v.getImpulse(), 0);
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

  function sendHit(victimId, weaponType, impulse, damage) {
    const msg = { type: 'hit', victimId, shooterId: playerId, weaponType, source: weaponType,
                  impulse, damage, durationMs: 3000 };
    send(msg);
    const v = (victimId === playerId) ? localAvatar : remoteAvatars.get(victimId);
    if (v) {
      v.applyHit(impulse, weaponType);
      if (victimId === playerId && localAvatar) {
        localAvatar.applyDamage(damage);
        window.MayhemEffects.updateHudHp(localAvatar.hp);
      }
    }
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

- [ ] **Step 3: Syntax check both files**

```bash
node -c brett/public/assets/mayhem/mayhem.js
```

Expected: `brett/public/assets/mayhem/mayhem.js OK`

- [ ] **Step 4: Run all tests to check nothing regressed**

```bash
cd brett && node --test test/
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): wire projectiles, weapons, effects, obstacles, game-mode into mayhem"
```

---

## Task 10: Manual Verification

- [ ] **Step 1: Build and run brett locally**

```bash
cd brett && node server.js
```

Open two browser tabs: `http://localhost:3000` (or whichever port server.js uses).

- [ ] **Step 2: Smoke test checklist**

In both tabs, click Mayhem to enable:

- [ ] Obstacles appear identically in both tabs
- [ ] Press 1–5 — HUD shows correct weapon name
- [ ] Left-click with weapon 1 (Handgun) — bullet travels, hits remote player, blood splat appears
- [ ] Left-click with weapon 2 (Rifle) — 3-burst projectiles visible
- [ ] Left-click with weapon 3 (Fireball) — slow glowing orb, fire FX on hit, burn damage ticks
- [ ] Left-click with weapon 4 (Keule) — melee swing hits at range 1.5m, strong knockback
- [ ] Left-click with weapon 5 (Katana) — fast slash, swoosh FX visible
- [ ] HP bar decreases when hit; floating bar above other player decreases
- [ ] At 0 HP in Warmup mode: respawn banner appears, R respawns at edge
- [ ] Switch to Deathmatch: auto-respawn after 3s
- [ ] Switch to LMS: eliminated player switches to spectator cam
- [ ] Ragdoll physics work (no silent crash from missing integrateRagdollRoot)
- [ ] Running animation is faster than before

- [ ] **Step 3: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix(brett): smoke test corrections"
```

---

## Task 11: Deploy

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/brett-projectiles
```

- [ ] **Step 2: Create PR and merge**

```bash
gh pr create --title "feat(brett): projectiles, 5 weapons, HP, FX, obstacles, 3 game modes" \
  --body "$(cat <<'EOF'
## Summary
- 5 weapons: handgun (35hp), rifle (3-burst 60hp), fireball (35hp+burn), club (55hp), katana (25hp)
- Victim-authoritative HP system with floating bars + HUD
- Blood splat decals, fire particle FX, katana swoosh
- Cover obstacles (pillars, walls, crates, barrels) seeded per room
- 3 game modes: Warmup (manual respawn R), Deathmatch (auto-respawn 3s), LMS (elimination + spectator)
- Fixed missing integrateRagdollRoot/Bone in physics.js (silent crash)
- Faster leg animation (10/14 vs hardcoded 8)

## Test plan
- [ ] `cd brett && node --test test/` — all pass
- [ ] Manual: two browser tabs, all 5 weapons fire, HP sync, all 3 modes, obstacles block projectiles
EOF
)"
```

- [ ] **Step 3: Merge and deploy**

```bash
gh pr merge --squash --auto
task feature:brett
```

---

## Asset Integration (post-merge, when assets are ready)

When high-quality assets arrive, place them in:
- `brett/public/assets/mayhem/sounds/` — all `.ogg` / `.mp3` files
- `brett/public/assets/mayhem/textures/` — all `.png` files  
- `brett/public/assets/mayhem/models/` — all `.glb` files

Then update `effects.js` to load via `THREE.TextureLoader` / `THREE.AudioLoader` / `THREE.GLTFLoader` where fallback geometry/canvas currently exists. Each asset slot already has a named constant to swap.
