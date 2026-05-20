---
title: Brett Combat Mode — Fireball Burn DoT + Katana Sweep Arc Implementation Plan
domains: []
status: active
pr_number: null
ticket_id: T000080
---

# Brett Combat Mode — Fireball Burn DoT + Katana Sweep Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two unimplemented weapon mechanics in brett's combat mode: fireball applies burn damage-over-time after the initial hit, and katana melee checks that the target is within the sweep arc (not just the range radius).

**Architecture:** Both gaps live in `brett/public/assets/combat/controller.mjs`. Pure helper functions (`startBurnTimer`, `sweepArcContains`) are added to `damage.mjs` so they are testable in Node.js without any THREE.js dependency. `controller.mjs` imports them and wires them into the existing `fire()` and `meleeSweep()` functions.

**Tech Stack:** Vanilla JS ES modules, Node.js `node:test` runner for unit tests, THREE.js only in controller (not in helpers).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `brett/public/assets/combat/damage.mjs` | Add `BURN_TICK_MS`, `startBurnTimer`, `sweepArcContains` |
| Modify | `brett/public/assets/combat/controller.mjs` | Wire burn after fireball hit; pass camera + arcDeg to meleeSweep |
| Modify | `brett/test/damage.test.mjs` | Tests for both new pure functions |

---

### Task 1: Add `sweepArcContains` to damage.mjs + test

**Files:**
- Modify: `brett/public/assets/combat/damage.mjs`
- Modify: `brett/test/damage.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `brett/test/damage.test.mjs`:

```js
import { sweepArcContains } from '../public/assets/combat/damage.mjs';

test('sweepArcContains — target directly ahead is in arc', () => {
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: 0, targetZ: -1,   // directly in front (Z negative = forward in Three.js)
    facingX: 0, facingZ: -1,
    arcDeg: 90,
  });
  assert.equal(result, true);
});

test('sweepArcContains — target at 91° is outside 90° arc', () => {
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: -1, targetZ: 0,   // 90° to the left
    facingX: 0, facingZ: -1,
    arcDeg: 89,                // arc barely too narrow
  });
  assert.equal(result, false);
});

test('sweepArcContains — target exactly at half-arc boundary is inside', () => {
  const halfRad = (45 * Math.PI) / 180;
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: Math.sin(halfRad), targetZ: -Math.cos(halfRad),
    facingX: 0, facingZ: -1,
    arcDeg: 90,
  });
  assert.equal(result, true);
});

test('sweepArcContains — target directly behind is outside arc', () => {
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: 0, targetZ: 1,    // behind
    facingX: 0, facingZ: -1,
    arcDeg: 90,
  });
  assert.equal(result, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd brett && node --test test/damage.test.mjs 2>&1 | grep -E 'FAIL|SyntaxError|sweepArcContains'
```

Expected: `SyntaxError` or `TypeError: sweepArcContains is not a function` — the export doesn't exist yet.

- [ ] **Step 3: Add `sweepArcContains` to damage.mjs**

Append to `brett/public/assets/combat/damage.mjs` (after the existing exports):

```js
/**
 * Returns true if target is within the arcDeg cone centred on the facing direction.
 * All inputs are XZ-plane scalars (Y/height is irrelevant for melee arc checks).
 *
 * @param {{ selfX, selfZ, targetX, targetZ, facingX, facingZ, arcDeg }} opts
 */
export function sweepArcContains({ selfX, selfZ, targetX, targetZ, facingX, facingZ, arcDeg }) {
  const dx = targetX - selfX;
  const dz = targetZ - selfZ;
  const d = Math.hypot(dx, dz);
  if (d === 0) return false;
  const dot = (dx / d) * facingX + (dz / d) * facingZ;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  return angleDeg <= arcDeg / 2;
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
cd brett && node --test test/damage.test.mjs 2>&1 | grep -E 'pass|fail|sweepArc'
```

Expected: 4 new tests PASS, all previous tests still PASS.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-brett-combat-weapons
git add brett/public/assets/combat/damage.mjs brett/test/damage.test.mjs
git commit -m "feat(brett-combat): add sweepArcContains pure helper + tests"
```

---

### Task 2: Add `startBurnTimer` to damage.mjs + test

**Files:**
- Modify: `brett/public/assets/combat/damage.mjs`
- Modify: `brett/test/damage.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `brett/test/damage.test.mjs`:

```js
import { startBurnTimer, BURN_TICK_MS } from '../public/assets/combat/damage.mjs';

test('startBurnTimer fires expected number of ticks', async () => {
  const ticks = [];
  const durMs = BURN_TICK_MS * 3;
  const id = startBurnTimer(durMs, (i) => ticks.push(i));
  await new Promise(res => setTimeout(res, durMs + BURN_TICK_MS)); // wait one extra tick for safety
  assert.equal(ticks.length, 3);
});

test('startBurnTimer tick index starts at 1', async () => {
  const ticks = [];
  const id = startBurnTimer(BURN_TICK_MS * 2, (i) => ticks.push(i));
  await new Promise(res => setTimeout(res, BURN_TICK_MS * 2 + BURN_TICK_MS));
  assert.equal(ticks[0], 1);
  assert.equal(ticks[1], 2);
});

test('startBurnTimer returns cancelable id', async () => {
  const ticks = [];
  const id = startBurnTimer(BURN_TICK_MS * 5, (i) => ticks.push(i));
  clearInterval(id);
  await new Promise(res => setTimeout(res, BURN_TICK_MS * 3));
  assert.equal(ticks.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd brett && node --test test/damage.test.mjs 2>&1 | grep -E 'FAIL|startBurnTimer|BURN_TICK_MS'
```

Expected: `TypeError: startBurnTimer is not a function` — not yet exported.

- [ ] **Step 3: Add `BURN_TICK_MS` and `startBurnTimer` to damage.mjs**

Append to `brett/public/assets/combat/damage.mjs`:

```js
/** Interval between burn damage ticks (ms). */
export const BURN_TICK_MS = 500;

/**
 * Starts a burn DoT timer. Calls onTick(tickIndex) every BURN_TICK_MS for durMs ms.
 * Returns the interval ID — caller can clearInterval() to cancel early.
 *
 * @param {number} durMs   Total burn duration in milliseconds.
 * @param {(i: number) => void} onTick  Called with 1-based tick index each interval.
 * @returns {ReturnType<typeof setInterval>}
 */
export function startBurnTimer(durMs, onTick) {
  const totalTicks = Math.floor(durMs / BURN_TICK_MS);
  let fired = 0;
  const id = setInterval(() => {
    fired++;
    onTick(fired);
    if (fired >= totalTicks) clearInterval(id);
  }, BURN_TICK_MS);
  return id;
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
cd brett && node --test test/damage.test.mjs 2>&1 | grep -E 'pass|fail|startBurn|BURN_TICK'
```

Expected: 3 new timer tests PASS (takes ~1.5s each for timer tests). All previous tests still PASS.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-brett-combat-weapons
git add brett/public/assets/combat/damage.mjs brett/test/damage.test.mjs
git commit -m "feat(brett-combat): add startBurnTimer pure helper + tests"
```

---

### Task 3: Wire fireball burn DoT into controller.mjs

**Files:**
- Modify: `brett/public/assets/combat/controller.mjs`

- [ ] **Step 1: Update the import at the top of controller.mjs**

Current first line:
```js
import { WEAPONS, STARTER_LOADOUT } from './weapons.mjs';
import { validateDamageEvent, applyDamage } from './damage.mjs';
```

Replace with:
```js
import { WEAPONS, STARTER_LOADOUT } from './weapons.mjs';
import { validateDamageEvent, applyDamage, startBurnTimer, BURN_TICK_MS } from './damage.mjs';
```

- [ ] **Step 2: Add burn DoT to the ranged fire path**

Find this block in `fire()` (lines ~78–93):

```js
  if (w.type === 'ranged') {
    state.ammo[weaponKey]--;
    Hud.setAmmo(hudRoot, state.ammo[weaponKey], w.mag);
    const selfPos = state.self.mesh?.position ?? new THREE.Vector3();
    Fx.spawnMuzzleFlash(scene, selfPos, new THREE.Vector3(0,0,-1));
    const hit = raycastPlayers(camera, players, state.self);
    if (hit) {
      const ev = {
        type: 'damage_event', shooter_id: state.self.id, victim_id: hit.player.id,
        weapon: weaponKey, damage: w.dmg,
        position: [hit.point.x, hit.point.y, hit.point.z],
      };
      ws.send(ev);
      applyDamage(hit.player, w.dmg);
      Fx.spawnBloodDecal(scene, hit.point, hit.normal ?? new THREE.Vector3(0,1,0));
    }
  }
```

Replace with:

```js
  if (w.type === 'ranged') {
    state.ammo[weaponKey]--;
    Hud.setAmmo(hudRoot, state.ammo[weaponKey], w.mag);
    const selfPos = state.self.mesh?.position ?? new THREE.Vector3();
    Fx.spawnMuzzleFlash(scene, selfPos, new THREE.Vector3(0,0,-1));
    const hit = raycastPlayers(camera, players, state.self);
    if (hit) {
      const ev = {
        type: 'damage_event', shooter_id: state.self.id, victim_id: hit.player.id,
        weapon: weaponKey, damage: w.dmg,
        position: [hit.point.x, hit.point.y, hit.point.z],
      };
      ws.send(ev);
      applyDamage(hit.player, w.dmg);
      Fx.spawnBloodDecal(scene, hit.point, hit.normal ?? new THREE.Vector3(0,1,0));

      if (w.burn) {
        const burnDmg = Math.ceil(w.burn.dps * BURN_TICK_MS / 1000);
        const burnPos = [hit.point.x, hit.point.y, hit.point.z];
        startBurnTimer(w.burn.durMs, () => {
          if ((hit.player.hp ?? 0) <= 0) return;
          ws.send({
            type: 'damage_event', shooter_id: state.self.id, victim_id: hit.player.id,
            weapon: weaponKey, damage: burnDmg, position: burnPos,
          });
          applyDamage(hit.player, burnDmg);
        });
      }
    }
  }
```

- [ ] **Step 3: Verify the file parses (no syntax error)**

```bash
cd brett && node -e "import('./public/assets/combat/controller.mjs')" 2>&1
```

Expected: No output (import resolves but nothing prints — no DOM, so startCombat is never called).

> Note: If the import itself throws a DOM error (e.g. `document is not defined`), that is expected — the module is browser-only. A SyntaxError would not be expected. If you see SyntaxError, fix it before continuing.

- [ ] **Step 4: Verify in-browser manually (visual smoke test)**

In a dev session with the brett server running (`cd brett && node server.js`), open two browser tabs to `http://localhost:3000`. Pick a loadout with fireball. Hit the second tab's player with the fireball — you should see the target's HP drop by the initial hit (70 dmg) and then continue dropping in 3-second burn ticks (6 ticks × 3 dmg = 18 additional damage).

> Skip this step if no browser is available in this environment; the unit tests validate the pure helpers and the controller change has no logic outside the hook.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-brett-combat-weapons
git add brett/public/assets/combat/controller.mjs
git commit -m "feat(brett-combat): apply fireball burn DoT after initial hit"
```

---

### Task 4: Wire katana sweep arc into controller.mjs meleeSweep()

**Files:**
- Modify: `brett/public/assets/combat/controller.mjs`

- [ ] **Step 1: Update the import to include sweepArcContains**

The import line from Task 3 should now read:

```js
import { validateDamageEvent, applyDamage, startBurnTimer, BURN_TICK_MS, sweepArcContains } from './damage.mjs';
```

- [ ] **Step 2: Update `meleeSweep()` to accept camera and arcDeg**

Current function (lines ~133–140):

```js
function meleeSweep(self, players, range) {
  const sx = self.x ?? self.mesh?.position?.x ?? 0;
  const sz = self.z ?? self.mesh?.position?.z ?? 0;
  return players.filter(p =>
    p.id !== self.id && (p.hp ?? 100) > 0 &&
    Math.hypot((p.x ?? p.mesh?.position?.x ?? 0) - sx, (p.z ?? p.mesh?.position?.z ?? 0) - sz) <= range
  );
}
```

Replace with:

```js
function meleeSweep(self, players, range, camera, arcDeg) {
  const sx = self.x ?? self.mesh?.position?.x ?? 0;
  const sz = self.z ?? self.mesh?.position?.z ?? 0;

  let facingX = 0, facingZ = -1;
  if (camera && arcDeg != null) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    facingX = dir.x;
    facingZ = dir.z;
  }

  return players.filter(p => {
    if (p.id === self.id || (p.hp ?? 100) <= 0) return false;
    const tx = p.x ?? p.mesh?.position?.x ?? 0;
    const tz = p.z ?? p.mesh?.position?.z ?? 0;
    if (Math.hypot(tx - sx, tz - sz) > range) return false;
    if (arcDeg != null) {
      return sweepArcContains({ selfX: sx, selfZ: sz, targetX: tx, targetZ: tz, facingX, facingZ, arcDeg });
    }
    return true;
  });
}
```

- [ ] **Step 3: Update the `meleeSweep` call in `fire()`**

Find in `fire()`:

```js
    const targets = meleeSweep(state.self, players, w.range);
```

Replace with:

```js
    const targets = meleeSweep(state.self, players, w.range, camera, w.sweepArcDeg);
```

- [ ] **Step 4: Verify the file parses (no syntax error)**

```bash
cd brett && node -e "import('./public/assets/combat/controller.mjs')" 2>&1
```

Expected: No SyntaxError. (DOM errors like `document is not defined` are fine — browser-only module.)

- [ ] **Step 5: Run full brett unit test suite**

```bash
cd brett && npm ci --silent && node --test test/ws-reconnect.test.mjs test/physics.test.js test/damage.test.mjs test/pickups.test.mjs test/mode-state.test.mjs test/server-admin.test.js test/server-mayhem.test.js 2>&1 | tail -20
```

Expected: All tests pass. The new `sweepArcContains` and `startBurnTimer` tests should show in the pass count.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-brett-combat-weapons
git add brett/public/assets/combat/controller.mjs
git commit -m "feat(brett-combat): gate katana melee on sweepArcDeg cone"
```

---

### Task 5: CI checks + PR

**Files:** none new — validation only.

- [ ] **Step 1: Run full offline test suite**

```bash
cd /tmp/wt-brett-combat-weapons && task test:all 2>&1 | tail -20
```

Expected: All offline tests pass.

- [ ] **Step 2: Arena protocol drift guard**

```bash
diff arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
```

Expected: No output (files still byte-identical — this PR doesn't touch them).

- [ ] **Step 3: Systembrett template validation**

```bash
bash scripts/tests/systembrett-template.test.sh 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 4: Create PR**

```bash
cd /tmp/wt-brett-combat-weapons
git push -u origin feature/brett-combat-weapons-complete
gh pr create \
  --title "feat(brett-combat): fireball burn DoT + katana sweep arc" \
  --body "$(cat <<'EOF'
## Summary
- **Fireball burn DoT:** after the initial hit, `startBurnTimer` fires 6 ticks over 3 s (≈3 dmg each via `dps × BURN_TICK_MS`); each tick sends a `damage_event` and applies local damage — relayed to victim by server.
- **Katana sweep arc:** `meleeSweep()` now takes `camera` and `arcDeg`; uses `sweepArcContains` (pure XZ dot-product check) to reject targets outside the 90° forward cone. Club is unaffected (no `sweepArcDeg` → falls through to radial-only check).
- Both helpers extracted to `damage.mjs` as pure functions; 7 new unit tests cover boundary cases.

## Test plan
- [ ] `node --test brett/test/damage.test.mjs` — 7 new tests pass
- [ ] `task test:all` — offline suite green
- [ ] `bash scripts/tests/systembrett-template.test.sh` — pass
- [ ] Manual: fireball hit → victim HP drops 70 then bleeds 6× more ticks
- [ ] Manual: katana swings forward → hits enemy directly ahead, misses enemy directly behind

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

- [ ] **Step 6: Deploy brett**

```bash
task feature:brett
```

Expected: Brett image rebuilds, deploys to both mentolder and korczewski clusters.
