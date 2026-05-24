---
title: Mayhem Duel-Mode mit 4 Helden — Implementation Plan
domains: []
status: active
pr_number: null
ticket_id: T000249
grilling_ticket: T000248
---

# Mayhem Duel-Mode mit 4 Helden — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitert den Mayhem-Mode um 1v1-Duel mit 4 Helden (Patrick/Tina/Martina/Oskar), Hero-Select-Warmup, Crosshair-System, hand-crafted Arena, Spectators und rule-based PvAI.

**Architecture:** Vertikale Scheiben — Patrick + Kernsysteme (Scheibe 1) sind nach Task 13 vollständig spielbar. Tina, Martina, Oskar und PvAI werden in Scheiben 2–5 nachgezogen. Alle neuen Systeme sind Erweiterungen bestehender Dateien oder eigenständige neue Module; kein bestehender Code wird grundlegend umstrukturiert.

**Tech Stack:** Vanilla JS (ES2020), Three.js (window global), Node.js WebSocket (`ws`), `node --test` (built-in test runner), Geist/Newsreader/Geist-Mono fonts via Google Fonts.

**Worktree:** `/tmp/wt-mayhem-duel-heroes` (branch `feature/mayhem-duel-heroes`)
**Spec:** `docs/superpowers/specs/2026-05-24-mayhem-duel-heroes-design.md`
**Test runner:** `cd brett && MOCK_DB=true node --test test/*.test.js test/*.test.mjs`

---

## File Map

| Datei | Status | Verantwortung |
|---|---|---|
| `brett/public/assets/mayhem/heroes.js` | **NEU** | HEROES-Daten, `assignHero()`, `MinionManager` |
| `brett/public/assets/mayhem/hero-select.js` | **NEU** | `buildHeroSelectModal()` DOM-Baukasten |
| `brett/public/assets/mayhem/game-mode.js` | Modify | DUEL-Mode, `phase`, `duelState`, dual-export |
| `brett/public/assets/mayhem/mayhem.js` | Modify | Crosshair, Duel-Lifecycle, Spectator-Cam, `MODES_CYCLE` |
| `brett/public/assets/mayhem/obstacles.js` | Modify | `buildDuelArena()` |
| `brett/public/assets/mayhem/weapons.js` | Modify | 10 neue Ability-Weapon-Defs |
| `brett/public/assets/mayhem/projectiles.js` | Modify | `mkChainMesh()`, Frostnova-AoE-Handler |
| `brett/public/assets/mayhem/player-avatar.js` | Modify | `heroId`, `speedMultiplier`, `shielded`, `resetHero()`, `setTorsoColor()` |
| `brett/public/assets/mayhem/effects.js` | Modify | Frostnova-Burst-Animation, Kettenblitz-Arc |
| `brett/public/assets/mayhem/audio.js` | Modify | 8 neue SFX_MAP-Einträge |
| `brett/public/assets/mayhem/ai-bot.js` | Modify | Hero-spezifische KI-Profile |
| `brett/public/assets/mayhem/physics.js` | Modify | `aabbRay()` für Sichtlinie |
| `brett/server.js` | Modify | `'duel'` Whitelist, `duelRooms`, neue Relay-Types |
| `brett/test/physics.test.js` | Modify | Tests für `aabbRay()` |
| `brett/test/server-mayhem.test.js` | Modify | Tests für Duel-Relay + duelRooms |
| `brett/test/game-mode.test.js` | **NEU** | Tests für DUEL-Mode-State-Machine |

---

## ═══════════════ FOUNDATION ═══════════════

---

### Task 1: `physics.js` — `aabbRay()` (Sichtlinie)

**Files:**
- Modify: `brett/public/assets/mayhem/physics.js`
- Modify: `brett/test/physics.test.js`

Die neue Funktion `aabbRay(from, to, obstacles)` prüft mit der Slab-Method ob ein Strahl von `from` nach `to` ein AABB-Hindernis schneidet. Wird von der PvAI und von Frostnova-AoE gebraucht.

- [ ] **Schritt 1: Failing-Tests schreiben**

Am Ende von `brett/test/physics.test.js` anfügen:

```js
const { aabbRay } = require('../public/assets/mayhem/physics.js');

test('aabbRay: clear line of sight returns false (no hit)', () => {
  const from = { x: -5, y: 0.9, z: 0 };
  const to   = { x:  5, y: 0.9, z: 0 };
  const obstacles = [
    { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: 3, maxZ: 5 }   // z-offset — not in path
  ];
  assert.strictEqual(aabbRay(from, to, obstacles), false);
});

test('aabbRay: wall in path returns true (hit)', () => {
  const from = { x: -5, y: 0.9, z: 0 };
  const to   = { x:  5, y: 0.9, z: 0 };
  const obstacles = [
    { minX: -0.5, maxX: 0.5, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }  // center wall
  ];
  assert.strictEqual(aabbRay(from, to, obstacles), true);
});

test('aabbRay: empty obstacle list returns false', () => {
  assert.strictEqual(aabbRay({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, []), false);
});

test('aabbRay: from and to same point returns false', () => {
  const obstacles = [{ minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }];
  assert.strictEqual(aabbRay({ x: 0, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, obstacles), false);
});
```

- [ ] **Schritt 2: Tests laufen lassen (erwartetes Ergebnis: FAIL)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/physics.test.js 2>&1 | tail -10
```

Erwartet: `TypeError: aabbRay is not a function` oder ähnliches.

- [ ] **Schritt 3: `aabbRay` implementieren**

In `brett/public/assets/mayhem/physics.js`, direkt vor der `const api = { ... }` Zeile einfügen:

```js
// Slab-method ray-AABB test. Returns true if segment [from→to] is blocked by
// any box in obstacles. Used for AI line-of-sight and AoE range checks.
// obstacles: Array of { minX, maxX, minY, maxY, minZ, maxZ }
function aabbRay(from, to, obstacles) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lenSq = dx*dx + dy*dy + dz*dz;
  if (lenSq === 0) return false;

  for (const b of obstacles) {
    // Per-axis slab intersect
    let tmin = 0, tmax = 1;
    for (const [o, d, bmin, bmax] of [
      [from.x, dx, b.minX, b.maxX],
      [from.y, dy, b.minY, b.maxY],
      [from.z, dz, b.minZ, b.maxZ],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < bmin || o > bmax) { tmin = 1; break; }
      } else {
        const t1 = (bmin - o) / d, t2 = (bmax - o) / d;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    if (tmin <= tmax) return true;
  }
  return false;
}
```

Die `api`-Zeile erweitern:
```js
const api = { capsuleCapsule, aabbCapsule, integrateRagdollRoot, integrateRagdollBone, aabbRay };
```

- [ ] **Schritt 4: Tests laufen lassen (erwartetes Ergebnis: PASS)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/physics.test.js 2>&1 | tail -10
```

Erwartet: alle Tests grün, keine Failures.

- [ ] **Schritt 5: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/physics.js brett/test/physics.test.js
git commit -m "feat(mayhem): add aabbRay slab-method line-of-sight check to physics"
```

---

### Task 2: `game-mode.js` — DUEL-Mode + Phase-State-Machine

**Files:**
- Modify: `brett/public/assets/mayhem/game-mode.js`
- Create: `brett/test/game-mode.test.js`

`MODES` bekommt `DUEL: 'duel'`. `GameModeManager` bekommt Duel-Phase (`'hero-select'` | `'fighting'`), `duelState`, `handleDuelDeath()`, und einen `onDuelEnd`-Callback. Außerdem: CommonJS dual-export für Tests.

- [ ] **Schritt 1: Failing-Test-Datei anlegen**

Neue Datei `brett/test/game-mode.test.js`:

```js
'use strict';
const test   = require('node:test');
const assert = require('node:assert');
const { GameModeManager, MODES } = require('../public/assets/mayhem/game-mode.js');

test('MODES includes DUEL', () => {
  assert.strictEqual(MODES.DUEL, 'duel');
});

test('setMode duel sets phase hero-select', () => {
  const gmm = new GameModeManager({});
  gmm.setMode('duel');
  assert.strictEqual(gmm.mode, 'duel');
  assert.strictEqual(gmm.phase, 'hero-select');
});

test('startDuelFighting transitions phase to fighting', () => {
  const gmm = new GameModeManager({});
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  assert.strictEqual(gmm.phase, 'fighting');
  assert.strictEqual(gmm.duelState.playerA, 'p1');
  assert.strictEqual(gmm.duelState.playerB, 'p2');
});

test('handleDuelDeath increments winner wins', () => {
  const results = [];
  const gmm = new GameModeManager({ onDuelEnd: r => results.push(r) });
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  const r1 = gmm.handleDuelDeath('p1'); // p2 wins round
  assert.strictEqual(r1.roundWinner, 'p2');
  assert.strictEqual(r1.matchOver, false);
  assert.strictEqual(gmm.duelState.winsB, 1);
});

test('handleDuelDeath triggers onDuelEnd after 2 wins (best-of-3)', () => {
  const results = [];
  const gmm = new GameModeManager({ onDuelEnd: r => results.push(r) });
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  gmm.handleDuelDeath('p1'); // p2 wins round 1
  gmm.startDuelFighting('p1', 'p2'); // round 2
  gmm.handleDuelDeath('p1'); // p2 wins round 2 → match over
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].matchWinner, 'p2');
});

test('setMode resets duelState', () => {
  const gmm = new GameModeManager({});
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  gmm.handleDuelDeath('p1');
  gmm.setMode('warmup');
  gmm.setMode('duel');
  assert.strictEqual(gmm.duelState.winsA, 0);
  assert.strictEqual(gmm.duelState.winsB, 0);
});
```

- [ ] **Schritt 2: Tests laufen lassen (erwartetes Ergebnis: FAIL)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/game-mode.test.js 2>&1 | tail -10
```

Erwartet: `Cannot find module` oder `MODES.DUEL is undefined`.

- [ ] **Schritt 3: `game-mode.js` erweitern**

**3a.** `MODES`-Objekt erweitern (Zeile 9 in game-mode.js):
```js
const MODES = Object.freeze({ WARMUP: 'warmup', DEATHMATCH: 'deathmatch', LMS: 'lms', COOP: 'coop', DUEL: 'duel' });
```

**3b.** Im `GameModeManager`-Konstruktor nach `this._spectating = false;` anfügen:
```js
    // Duel state
    this.phase     = 'hero-select';
    this.duelState = { winsA: 0, winsB: 0, bestOf: 3, playerA: null, playerB: null };
    this._onDuelEnd = (options && options.onDuelEnd) || (() => {});
```

**3c.** `setMode()` — nach `this._onModeChange(mode);` anfügen:
```js
    if (mode === MODES.DUEL) {
      this.phase = 'hero-select';
      this.duelState = { winsA: 0, winsB: 0, bestOf: 3, playerA: null, playerB: null };
    }
```

**3d.** Neue Methoden vor der schließenden `}` der Klasse einfügen:
```js
  // Call after both players have selected their hero.
  startDuelFighting(playerA, playerB) {
    this.duelState.playerA = playerA;
    this.duelState.playerB = playerB;
    this.phase = 'fighting';
  }

  // Call when a player dies during duel phase. Returns { roundWinner, matchOver, matchWinner }.
  handleDuelDeath(deadPlayerId) {
    const ds = this.duelState;
    const isA = deadPlayerId === ds.playerA;
    const roundWinner = isA ? ds.playerB : ds.playerA;
    if (isA) ds.winsB++; else ds.winsA++;
    const winsNeeded = Math.ceil(ds.bestOf / 2);
    const matchOver  = ds.winsA >= winsNeeded || ds.winsB >= winsNeeded;
    const matchWinner = matchOver ? (ds.winsA >= winsNeeded ? ds.playerA : ds.playerB) : null;
    if (matchOver) {
      this._onDuelEnd({ matchWinner, winsA: ds.winsA, winsB: ds.winsB });
    }
    return { roundWinner, matchOver, matchWinner };
  }
```

**3e.** Am Ende der Datei, nach dem `window.MayhemGameMode`-Block, CommonJS dual-export anfügen:
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameModeManager, MODES, WAVE_DEFS };
}
```

**3f.** `GameModeManager`-Konstruktor: `options`-Parameter ergänzen (aktuell ohne Parameter). Die Konstruktor-Signatur anpassen:
```js
  constructor({ onRespawn, onModeChange, onLmsEnd, onDuelEnd } = {}) {
```
Und `this._onLmsEnd = onLmsEnd || (() => {});` bereits da. Ergänzen:
```js
    this._onDuelEnd = onDuelEnd || (() => {});
```

- [ ] **Schritt 4: Tests laufen lassen (erwartetes Ergebnis: PASS)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/game-mode.test.js 2>&1 | tail -15
```

Erwartet: alle 6 Tests grün.

- [ ] **Schritt 5: Alle Tests laufen lassen (kein Rückschritt)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/*.test.js test/*.test.mjs 2>&1 | tail -10
```

Erwartet: keine neuen Failures.

- [ ] **Schritt 6: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/game-mode.js brett/test/game-mode.test.js
git commit -m "feat(mayhem): add DUEL mode, phase state machine, handleDuelDeath to GameModeManager"
```

---

### Task 3: `server.js` — Duel-Relay + `duelRooms`

**Files:**
- Modify: `brett/server.js`
- Modify: `brett/test/server-mayhem.test.js`

Server: `'duel'` zur Whitelist, neue Relay-Types für Hero/Duel-Messages, `duelRooms`-Map analog zu `lmsAlive`.

- [ ] **Schritt 1: Failing-Tests anfügen**

Am Ende von `brett/test/server-mayhem.test.js` anfügen:

```js
const { duelRooms, handleDuelDeath: serverHandleDuelDeath, RELAY_TYPES: RT } = require('../server.js');

test('RELAY_TYPES includes duel message types', () => {
  const required = ['hero_select', 'duel_start', 'duel_round_end', 'duel_match_end',
                    'hero_stealth', 'hero_teleport', 'minion_spawn', 'minion_update', 'minion_die'];
  for (const t of required) {
    assert.ok(RT.includes(t), `RELAY_TYPES missing: ${t}`);
  }
});

test('mutation: game_mode_change to duel persists mode', () => {
  const room = 'test-duel-mode-1';
  applyMutation(room, { type: 'game_mode_change', mode: 'duel' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.gameMode, 'duel');
});

test('serverHandleDuelDeath: playerB wins when playerA dies', () => {
  const room = 'test-duel-death-1';
  duelRooms.set(room, { playerA: 'alice', playerB: 'bob', winsA: 0, winsB: 0, bestOf: 3 });
  const result = serverHandleDuelDeath(room, 'alice');
  assert.strictEqual(result.roundWinner, 'bob');
  assert.strictEqual(result.matchOver, false);
  assert.strictEqual(duelRooms.get(room).winsB, 1);
});

test('serverHandleDuelDeath: match ends after 2 wins', () => {
  const room = 'test-duel-death-2';
  duelRooms.set(room, { playerA: 'alice', playerB: 'bob', winsA: 1, winsB: 0, bestOf: 3 });
  const result = serverHandleDuelDeath(room, 'bob');
  assert.strictEqual(result.matchOver, true);
  assert.strictEqual(result.matchWinner, 'alice');
});
```

- [ ] **Schritt 2: Tests laufen lassen (erwartetes Ergebnis: FAIL)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/server-mayhem.test.js 2>&1 | tail -10
```

- [ ] **Schritt 3: `server.js` erweitern**

**3a.** `RELAY_TYPES`-Array (Zeile ~346) erweitern. Nach dem letzten bestehenden Eintrag:
```js
const RELAY_TYPES = [
  // … bestehende Typen bleiben …
  'hero_select', 'duel_start', 'duel_round_end', 'duel_match_end',
  'hero_stealth', 'hero_teleport',
  'minion_spawn', 'minion_update', 'minion_die',
];
```

**3b.** `TRANSIENT_TYPES`-Set (Zeile ~358) erweitern:
```js
const TRANSIENT_TYPES = new Set([
  // … bestehende …
  'hero_select', 'duel_start', 'hero_stealth', 'hero_teleport', 'minion_update',
]);
```

**3c.** Nach der `lmsAlive`-Deklaration (Zeile ~364) einfügen:
```js
const duelRooms = new Map(); // room → { playerA, playerB, winsA, winsB, bestOf }

function handleDuelDeath(room, deadPlayerId) {
  const ds = duelRooms.get(room);
  if (!ds) return { roundWinner: null, matchOver: false, matchWinner: null };
  const isA = deadPlayerId === ds.playerA;
  const roundWinner = isA ? ds.playerB : ds.playerA;
  if (isA) ds.winsB++; else ds.winsA++;
  const winsNeeded = Math.ceil(ds.bestOf / 2);
  const matchOver  = ds.winsA >= winsNeeded || ds.winsB >= winsNeeded;
  const matchWinner = matchOver ? (ds.winsA >= winsNeeded ? ds.playerA : ds.playerB) : null;
  if (matchOver) duelRooms.delete(room);
  return { roundWinner, matchOver, matchWinner };
}
```

**3d.** `admin_mode_set`-Handler (Zeile ~718) — Whitelist erweitern:
```js
if (!['warmup','deathmatch','lms','coop','duel'].includes(msg.mode)) return;
```

**3e.** `player_death`-Handler (nach dem `handleLmsDeath`-Block, Zeile ~684): Duel-Branch einfügen:
```js
          if (state.gameMode === 'duel') {
            const dr = handleDuelDeath(room, msg.playerId);
            if (dr.roundWinner) {
              // Host-Client resolved round; server just relays duel_round_end already.
              // Store duelRooms update done in handleDuelDeath above.
            }
          }
```

**3f.** `duel_start`-Handler — wenn `duel_start` empfangen wird, `duelRooms` initialisieren:
Im Bereich wo RELAY_TYPES-Nachrichten weitergeleitet werden (nach Zeile ~666), vor dem `if (RELAY_TYPES.includes(msg.type))` Block, einfügen:
```js
        if (msg.type === 'duel_start' && msg.playerA && msg.playerB) {
          duelRooms.set(room, {
            playerA: msg.playerA, playerB: msg.playerB,
            winsA: 0, winsB: 0, bestOf: 3,
          });
        }
```

**3g.** `module.exports` (Zeile ~834) erweitern:
```js
  duelRooms, handleDuelDeath,
```

- [ ] **Schritt 4: Tests laufen lassen (PASS)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/server-mayhem.test.js test/game-mode.test.js test/physics.test.js 2>&1 | tail -15
```

Erwartet: alle Tests grün.

- [ ] **Schritt 5: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/server.js brett/test/server-mayhem.test.js
git commit -m "feat(mayhem): add duel relay types, duelRooms, handleDuelDeath to server"
```

---

## ═══════════════ SCHEIBE 1 — Patrick + Kernsysteme ═══════════════

---

### Task 4: `heroes.js` — Neues Modul anlegen

**Files:**
- Create: `brett/public/assets/mayhem/heroes.js`

- [ ] **Schritt 1: Datei anlegen**

Neue Datei `brett/public/assets/mayhem/heroes.js`:

```js
'use strict';
// Hero registry — pure data. Rendering, weapon assignment, and special abilities
// are wired in mayhem.js. MinionManager lives here (no Three.js dep for core logic).

const HEROES = {
  patrick: {
    id: 'patrick', name: 'Patrick',
    description: 'Softwareentwickler · Katana · Pistole · Rifle',
    color: 0x6f8db8,
    figure: { face: 'present', hair: 'hair-short', clothing: null, hairTint: null },
    abilities: ['katana', 'handgun', 'rifle'],
    passive: null,
    unlocked: true,
  },
  tina: {
    id: 'tina', name: 'Tina',
    description: 'Hexe · Frostnova · Feuerball · Kettenblitz',
    color: 0xa83a30,
    figure: { face: 'curious', hair: 'hair-long', clothing: 'robe',
              hairTint: 'hue-rotate(320deg) saturate(180%)' },
    abilities: ['frostnova', 'fireball', 'chainlightning'],
    passive: null,
    unlocked: false,   // unlocked in Scheibe 2
  },
  martina: {
    id: 'martina', name: 'Martina',
    description: 'Teamleiterin · Minion · Shield · Raserei',
    color: 0xb8c0a8,
    figure: { face: 'resolved', hair: 'hair-long', clothing: 'coat',
              hairTint: 'sepia(60%) hue-rotate(30deg)' },
    abilities: ['summon_minion', 'shield_minion', 'frenzy_minion'],
    passive: { maxMinions: 2 },
    unlocked: false,   // unlocked in Scheibe 3
  },
  oskar: {
    id: 'oskar', name: 'Oskar',
    description: 'Mechaniker · Motorrad · Auto · Reparatur',
    color: 0xc8a96e,
    figure: { face: 'observing', hair: 'hair-short', clothing: 'vest',
              hairTint: 'sepia(40%) hue-rotate(30deg)' },
    abilities: ['vehicle_switch', 'vehicle_repair', 'motorcycle_sprint'],
    passive: { startsInVehicle: 'motorcycle' },
    unlocked: false,   // unlocked in Scheibe 4
  },
};

const HERO_ORDER = ['patrick', 'tina', 'martina', 'oskar'];

// Assigns a hero to an avatar. Called from mayhem.js after hero_select.
// avatar must expose: heroId, heroColor, weaponSystem, setTorsoColor(), resetHero()
function assignHero(avatar, heroId, WeaponSystem, onFire) {
  const h = HEROES[heroId];
  if (!h) return;
  avatar.heroId    = heroId;
  avatar.heroColor = h.color;
  avatar.weaponSystem = new WeaponSystem(h.abilities, onFire);
  avatar.setTorsoColor(h.color);
  avatar.resetHero();
}

// ── MinionManager ────────────────────────────────────────────────────────────
// Manages Martina's minions. Three.js mesh creation is injected via factory fn.
class MinionManager {
  constructor({ maxMinions = 2, minionMeshFactory, onHit, onSync } = {}) {
    this._max     = maxMinions;
    this._minions = new Map(); // id → { pos, target, hp, shielded, frenzied, mesh, ... }
    this._mkMesh  = minionMeshFactory || (() => null);
    this._onHit   = onHit  || (() => {});
    this._onSync  = onSync || (() => {});
    this._seq     = 0;
  }

  get count() { return this._minions.size; }

  spawn(ownerPos, enemyRef) {
    if (this._minions.size >= this._max) return null;
    const id  = `minion-${++this._seq}`;
    const pos = { x: ownerPos.x + (Math.random() - 0.5), y: 0, z: ownerPos.z + (Math.random() - 0.5) };
    const mesh = this._mkMesh(pos);
    this._minions.set(id, { id, pos, target: enemyRef, hp: 60, shielded: false, frenzied: false,
                            lastAttack: 0, mesh, speedMult: 1 });
    this._onSync({ type: 'minion_spawn', minionId: id, x: pos.x, z: pos.z });
    return id;
  }

  shieldOldest() {
    const oldest = this._minions.values().next().value;
    if (oldest) oldest.shielded = true;
  }

  frenzyOldest() {
    const oldest = this._minions.values().next().value;
    if (!oldest) return;
    oldest.frenzied   = true;
    oldest.speedMult  = 2;
    oldest._frenzyEnd = Date.now() + 3000;
  }

  tick(dt, nowMs) {
    for (const [id, m] of this._minions) {
      // Frenzy expiry
      if (m.frenzied && nowMs > m._frenzyEnd) { m.frenzied = false; m.speedMult = 1; }

      // Move toward target
      const enemy = m.target;
      if (!enemy || !enemy.pos) continue;
      const dx = enemy.pos.x - m.pos.x, dz = enemy.pos.z - m.pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = 3.5 * m.speedMult * dt;
      if (dist > 1.5) {
        m.pos.x += (dx / dist) * speed;
        m.pos.z += (dz / dist) * speed;
        if (m.mesh) { m.mesh.position.x = m.pos.x; m.mesh.position.z = m.pos.z; }
        this._onSync({ type: 'minion_update', minionId: id, x: m.pos.x, z: m.pos.z });
      } else {
        // Melee attack
        if (nowMs - m.lastAttack > 800) {
          m.lastAttack = nowMs;
          const dmg = m.frenzied ? 30 : 15;
          this._onHit({ minionId: id, targetId: enemy.id, damage: dmg });
        }
      }
    }
  }

  takeDamage(minionId, dmg) {
    const m = this._minions.get(minionId);
    if (!m) return;
    if (m.shielded) { m.shielded = false; return; }  // absorb
    m.hp -= dmg;
    if (m.hp <= 0) this._killMinion(minionId);
  }

  _killMinion(id) {
    const m = this._minions.get(id);
    if (!m) return;
    if (m.mesh && m.mesh.parent) m.mesh.parent.remove(m.mesh);
    this._minions.delete(id);
    this._onSync({ type: 'minion_die', minionId: id });
  }

  clear() {
    for (const id of this._minions.keys()) this._killMinion(id);
  }
}

if (typeof window !== 'undefined') {
  window.MayhemHeroes = { HEROES, HERO_ORDER, assignHero, MinionManager };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HEROES, HERO_ORDER, assignHero, MinionManager };
}
```

- [ ] **Schritt 2: Datei in `brett/public/index.html` einbinden**

In `brett/public/index.html` die `<script>`-Tags für Mayhem-Module finden (nach `weapons.js`) und `heroes.js` davor einfügen:

```html
<script src="assets/mayhem/heroes.js"></script>
```

- [ ] **Schritt 3: Smoke-Test**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
node -e "const { HEROES, MinionManager } = require('./public/assets/mayhem/heroes.js'); console.log(Object.keys(HEROES)); const mm = new MinionManager({}); console.log('MinionManager OK, count:', mm.count);"
```

Erwartet: `[ 'patrick', 'tina', 'martina', 'oskar' ]` und `MinionManager OK, count: 0`.

- [ ] **Schritt 4: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/heroes.js brett/public/index.html
git commit -m "feat(mayhem): add heroes.js with HEROES registry, assignHero(), MinionManager"
```

---

### Task 5: `player-avatar.js` — Hero-Felder

**Files:**
- Modify: `brett/public/assets/mayhem/player-avatar.js`

- [ ] **Schritt 1: Neue Felder im Konstruktor**

In `player-avatar.js`, im Konstruktor nach `this.state = STATE.ALIVE;` einfügen:
```js
    this.heroId          = null;    // string | null
    this.heroColor       = null;    // number (Three.js hex)
    this.speedMultiplier = 1.0;     // slow debuff (Frostnova) or speed boost
    this.shielded        = false;   // Martina shield minion absorbs next hit
    this._slowTimer      = null;
```

- [ ] **Schritt 2: `resetHero()` hinzufügen**

Nach `resetHp()` (Zeile ~59) einfügen:
```js
  resetHero() {
    this.speedMultiplier = 1.0;
    this.shielded        = false;
    if (this._slowTimer) { clearTimeout(this._slowTimer); this._slowTimer = null; }
    if (this.weaponSystem && typeof this.weaponSystem.resetCooldowns === 'function') {
      this.weaponSystem.resetCooldowns();
    }
  }
```

- [ ] **Schritt 3: `setTorsoColor()` hinzufügen**

```js
  setTorsoColor(hexColor) {
    // Mannequin body parts use MeshLambertMaterial.
    // Walk the mesh hierarchy and tint non-joint materials.
    if (!this.mannequin || !this.mannequin.root) return;
    this.mannequin.root.traverse(obj => {
      if (obj.isMesh && obj.material && !obj.userData.isJoint) {
        obj.material = obj.material.clone();
        obj.material.color.setHex(hexColor);
      }
    });
  }
```

- [ ] **Schritt 4: `applySlowDebuff()` hinzufügen**

```js
  applySlowDebuff(factor, durationMs) {
    this.speedMultiplier = factor;
    if (this._slowTimer) clearTimeout(this._slowTimer);
    this._slowTimer = setTimeout(() => {
      this.speedMultiplier = 1.0;
      this._slowTimer = null;
    }, durationMs);
  }
```

- [ ] **Schritt 5: `getStatePayload()` — `heroId` ergänzen**

In `getStatePayload()` (Zeile ~42) das Return-Objekt um `heroId` erweitern:
```js
    return { x, y, z, yaw: this.facingY, anim: this.state, flailing: this._flailing,
             heroId: this.heroId };
```

- [ ] **Schritt 6: Bewegungs-Update — `speedMultiplier` anwenden**

Die Stelle im Bewegungs-Code finden wo velocity / moveSpeed berechnet wird (suche nach `moveSpeed` oder `velocity`). Dort `* this.speedMultiplier` ergänzen, z.B.:
```js
    const effectiveSpeed = moveSpeed * this.speedMultiplier;
```

- [ ] **Schritt 7: Smoke-Test**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
node -e "
const pa = { heroId: null, speedMultiplier: 1.0, shielded: false, _slowTimer: null };
// Simuliere applySlowDebuff
pa.speedMultiplier = 0.4;
console.log('slowMult:', pa.speedMultiplier);  // 0.4
"
```

- [ ] **Schritt 8: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/player-avatar.js
git commit -m "feat(mayhem): add heroId, speedMultiplier, shielded, resetHero(), setTorsoColor() to PlayerAvatar"
```

---

### Task 6: `weapons.js` — Ability-Weapon-Defs + WeaponSystem.resetCooldowns()

**Files:**
- Modify: `brett/public/assets/mayhem/weapons.js`

- [ ] **Schritt 1: 10 neue Weapon-Defs einfügen**

In `weapons.js`, nach dem letzten bestehenden Eintrag in `WEAPONS` (vor der schließenden `}`), einfügen:

```js
  // ── Tina (Hexe) ──────────────────────────────────────────────────────────
  frostnova: {
    key: 'frostnova', label: 'Frostnova', icon: 'icon-frostnova',
    damage: 40, cooldownMs: 5000,
    projectileType: 'frostnova',    // handled as AoE burst, not projectile
    aoeRadius: 2.5, slowFactor: 0.4, slowDurationMs: 2000,
    melee: false,
  },
  chainlightning: {
    key: 'chainlightning', label: 'Kettenblitz', icon: 'icon-chainlightning',
    damage: 55, cooldownMs: 4000,
    projectileType: 'chain',
    projectileSpeed: 22,
    melee: false,
  },
  // ── Martina (Teamleiterin) ────────────────────────────────────────────────
  summon_minion: {
    key: 'summon_minion', label: 'Minion rufen', icon: 'icon-summon-minion',
    damage: 0, cooldownMs: 4000,
    projectileType: 'summon',
    melee: false,
  },
  shield_minion: {
    key: 'shield_minion', label: 'Minion schützen', icon: 'icon-shield-minion',
    damage: 0, cooldownMs: 6000,
    projectileType: 'buff',
    melee: false,
  },
  frenzy_minion: {
    key: 'frenzy_minion', label: 'Minion Raserei', icon: 'icon-frenzy-minion',
    damage: 0, cooldownMs: 8000,
    projectileType: 'buff',
    melee: false,
  },
  // ── Oskar (Mechaniker) ────────────────────────────────────────────────────
  vehicle_switch: {
    key: 'vehicle_switch', label: 'Fahrzeug wechseln', icon: 'icon-vehicle-switch',
    damage: 0, cooldownMs: 3000,
    projectileType: 'vehicle_switch',
    melee: false,
  },
  vehicle_repair: {
    key: 'vehicle_repair', label: 'Reparieren', icon: 'icon-repair',
    damage: -40, cooldownMs: 8000,   // negative damage = heal
    projectileType: 'repair',
    target: 'self',
    melee: false,
  },
  motorcycle_sprint: {
    key: 'motorcycle_sprint', label: 'Motorrad-Sprint', icon: 'icon-sprint',
    damage: 20, cooldownMs: 2000,
    projectileType: 'sprint',
    durationMs: 1500, speedBoost: 2.5,
    melee: false,
  },
  // ── Patrick (Softwareentwickler) — Specials ───────────────────────────────
  // Note: stealth and teleport are triggered via dedicated keybinds (keys 4/5),
  // not via the weapon slot system. They are defined here only for cooldown tracking.
  stealth: {
    key: 'stealth', label: 'Unsichtbarkeit', icon: 'icon-stealth',
    damage: 0, cooldownMs: 8000, durationMs: 2000,
    projectileType: 'stealth',
    melee: false,
  },
  teleport: {
    key: 'teleport', label: 'Teleportation', icon: 'icon-teleport',
    damage: 0, cooldownMs: 6000, rangeTiles: 5,
    projectileType: 'teleport',
    melee: false,
  },
```

- [ ] **Schritt 2: `WeaponSystem.resetCooldowns()` hinzufügen**

In der `WeaponSystem`-Klasse, nach `getWeaponDef()`:
```js
  resetCooldowns() {
    this._cooldowns.clear();
  }
```

- [ ] **Schritt 3: Smoke-Test**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
node -e "
// weapons.js hat kein CommonJS export — test via window-shim
global.window = {};
require('./public/assets/mayhem/weapons.js');
const W = global.window.MayhemWeapons.WEAPONS;
console.log('frostnova:', W.frostnova.aoeRadius);  // 2.5
console.log('chainlightning:', W.chainlightning.damage);  // 55
console.log('vehicle_repair:', W.vehicle_repair.damage);  // -40
"
```

- [ ] **Schritt 4: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/weapons.js
git commit -m "feat(mayhem): add 10 hero ability weapon defs + WeaponSystem.resetCooldowns()"
```

---

### Task 7: `mayhem.js` — Crosshair-System

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Schritt 1: `MODES_CYCLE` erweitern (Zeile 6)**

```js
const MODES_CYCLE = ['warmup', 'deathmatch', 'lms', 'coop', 'duel'];
```

- [ ] **Schritt 2: Crosshair-Variablen deklarieren**

Nach der Deklaration von `let isHost = false;` (Zeile ~42) einfügen:
```js
let _crosshairMesh = null;   // THREE.Mesh — ring on ground
let _aimPlane      = null;   // THREE.Plane — y=0 intersect target
let _aimDir        = null;   // THREE.Vector3 — current aim direction
let _aimPoint      = null;   // THREE.Vector3 — crosshair world position
let _mouseNDC      = null;   // THREE.Vector2 — normalized device coords
let _raycaster     = null;   // THREE.Raycaster
```

- [ ] **Schritt 3: Crosshair initialisieren**

In der `Mayhem.start()`-Methode (nach dem Spielfeld-Aufbau) einfügen:
```js
    // Crosshair setup
    _aimPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    _aimDir    = new THREE.Vector3(0, 0, -1);
    _aimPoint  = new THREE.Vector3();
    _mouseNDC  = new THREE.Vector2();
    _raycaster = new THREE.Raycaster();

    const crosshairGeo = new THREE.RingGeometry(0.18, 0.25, 32);
    const crosshairMat = new THREE.MeshBasicMaterial({
      color: 0xd7b06a,   // --brass-game
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    _crosshairMesh = new THREE.Mesh(crosshairGeo, crosshairMat);
    _crosshairMesh.rotation.x = -Math.PI / 2;
    _crosshairMesh.position.y = 0.06;
    scene.add(_crosshairMesh);
```

- [ ] **Schritt 4: Maus-Event-Listener registrieren**

In der Event-Listener-Sektion von `mayhem.js`:
```js
    document.addEventListener('mousemove', _onMouseMove);

    function _onMouseMove(e) {
      if (!_mouseNDC) return;
      _mouseNDC.x = (e.clientX / window.innerWidth)  * 2 - 1;
      _mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    // Touch support (mobile)
    document.addEventListener('touchmove', e => {
      if (!_mouseNDC || !e.touches[0]) return;
      _mouseNDC.x = (e.touches[0].clientX / window.innerWidth)  * 2 - 1;
      _mouseNDC.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });
```

- [ ] **Schritt 5: Crosshair-Update in `Mayhem.tick()`**

Am Anfang von `Mayhem.tick(dt)` (vor dem Waffen-Fire-Block) einfügen:
```js
    // Update aim direction from mouse position
    if (_raycaster && _mouseNDC && localAvatar && !_isSpectator) {
      _raycaster.setFromCamera(_mouseNDC, camera);
      if (_raycaster.ray.intersectPlane(_aimPlane, _aimPoint)) {
        const lp = localAvatar.mannequin.root.position;
        _aimDir.set(_aimPoint.x - lp.x, 0, _aimPoint.z - lp.z).normalize();
        _crosshairMesh.position.set(_aimPoint.x, 0.06, _aimPoint.z);
      }
    }
```

- [ ] **Schritt 6: `onFire`-Aufrufe auf `_aimDir` umstellen**

Im bestehenden Waffen-Fire-Block: alle Stellen wo ein Richtungsvektor aus `facingY` berechnet wird, durch `_aimDir` ersetzen. Typisch:
```js
// ALT:
const dir = { x: Math.sin(localAvatar.facingY), y: 0, z: Math.cos(localAvatar.facingY) };
// NEU:
const dir = { x: _aimDir.x, y: _aimDir.y, z: _aimDir.z };
```

- [ ] **Schritt 7: Crosshair bei `stop()` aufräumen**

In `Mayhem.stop()`:
```js
    if (_crosshairMesh) { scene.remove(_crosshairMesh); _crosshairMesh = null; }
    document.removeEventListener('mousemove', _onMouseMove);
```

- [ ] **Schritt 8: Manueller Smoke-Test**

Brett lokal starten: `cd brett && node server.js`. Im Browser `http://localhost:3000` öffnen, Mayhem starten. Maus bewegen → Crosshair-Ring sollte sich auf dem Boden bewegen. Schuss abfeuern → Projektil sollte in Mausrichtung fliegen, auch beim Rückwärtslaufen.

- [ ] **Schritt 9: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): add crosshair system — horizontal raycast aim decoupled from movement"
```

---

### Task 8: `obstacles.js` — `buildDuelArena()`

**Files:**
- Modify: `brett/public/assets/mayhem/obstacles.js`

- [ ] **Schritt 1: `buildDuelArena()` am Ende der Datei einfügen**

Direkt vor dem `window.MayhemObstacles`-Export-Block:

```js
// Hand-crafted symmetric 1v1 duel arena. Returns same interface as buildObstacles().
// Call instead of buildObstacles() when game mode is 'duel'.
function buildDuelArena(THREE, scene) {
  const obstacles = [];
  const meshes    = [];
  const INK800    = 0x17202e;
  const SLATE3    = 0x2a3040;
  const BRASS     = 0xd7b06a;
  const HALF      = 9;

  function addBox(x, y, z, w, h, d, color) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mat  = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    scene.add(mesh);
    meshes.push(mesh);
    // Add EdgesGeometry outline in brass
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0.4 });
    const lines = new THREE.LineSegments(edges, lineMat);
    mesh.add(lines);
    // AABB for collision
    obstacles.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: 0,         maxY: h,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
    return mesh;
  }

  // ── Outer walls (invisible AABB only — stop movement + projectiles) ──────
  // North / South
  [HALF, -HALF].forEach(z => {
    const g = new THREE.BoxGeometry(HALF * 2, 3, 0.4);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(0, 1.5, z);
    scene.add(m);
    meshes.push(m);
    obstacles.push({ minX: -HALF, maxX: HALF, minY: 0, maxY: 3,
                     minZ: z - 0.2, maxZ: z + 0.2 });
  });
  // East / West
  [-HALF, HALF].forEach(x => {
    const g = new THREE.BoxGeometry(0.4, 3, HALF * 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, 1.5, 0);
    scene.add(m);
    meshes.push(m);
    obstacles.push({ minX: x - 0.2, maxX: x + 0.2, minY: 0, maxY: 3,
                     minZ: -HALF, maxZ: HALF });
  });

  // ── Corner pillars ──────────────────────────────────────────────────────
  [[-7, -7], [7, -7], [-7, 7], [7, 7]].forEach(([x, z]) => {
    const geo  = new THREE.CylinderGeometry(0.4, 0.4, 3, 16);
    const mat  = new THREE.MeshLambertMaterial({ color: SLATE3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.5, z);
    scene.add(mesh);
    meshes.push(mesh);
    const edges = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: BRASS, opacity: 0.5, transparent: true })));
    obstacles.push({ minX: x - 0.45, maxX: x + 0.45, minY: 0, maxY: 3, minZ: z - 0.45, maxZ: z + 0.45 });
  });

  // ── Symmetric cover boxes (4) ────────────────────────────────────────────
  [[-4, -4], [4, -4], [-4, 4], [4, 4]].forEach(([x, z]) => {
    addBox(x, 0, z, 2, 1.5, 1, INK800);
  });

  // ── Centre L-covers (2, mirrored) ───────────────────────────────────────
  // Left L: two boxes forming an L shape
  addBox(-1.5, 0,  0,   1, 2, 2.5, INK800);
  addBox(-2.5, 0,  0.75, 1, 2, 1,  INK800);
  // Right L (mirrored)
  addBox( 1.5, 0,  0,   1, 2, 2.5, INK800);
  addBox( 2.5, 0, -0.75, 1, 2, 1,  INK800);

  // ── Centre floor ring (decorative) ───────────────────────────────────────
  const ringGeo = new THREE.RingGeometry(0.8, 1.0, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);
  meshes.push(ring);

  // ── Corner accent lights ──────────────────────────────────────────────────
  [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([x, z]) => {
    const light = new THREE.PointLight(BRASS, 0.4, 8);
    light.position.set(x, 2.5, z);
    scene.add(light);
  });

  return { obstacles, meshes };
}
```

- [ ] **Schritt 2: Export erweitern**

Im `window.MayhemObstacles`-Block:
```js
window.MayhemObstacles = { buildObstacles, buildDuelArena };
```

- [ ] **Schritt 3: In `mayhem.js` — `buildDuelArena` beim Duel-Start aufrufen**

In der `Mayhem.start()`-Methode, wo aktuell `buildObstacles(THREE, room)` aufgerufen wird:
```js
    const arenaResult = (gameMode && gameMode.mode === 'duel')
      ? MayhemObstacles.buildDuelArena(THREE, scene)
      : MayhemObstacles.buildObstacles(THREE, room);
    obstacles = arenaResult.obstacles;
```

- [ ] **Schritt 4: Manueller Smoke-Test**

Duel-Mode via Admin-Panel aktivieren → die neue Arena mit Außenwänden, Säulen und Deckungsboxen erscheint. Bewegung gegen die Wand → Spieler bleibt stehen. Projektil auf Wand → trifft AABB.

- [ ] **Schritt 5: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/obstacles.js brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): add buildDuelArena() — hand-crafted symmetric 1v1 arena"
```

---

### Task 9: `hero-select.js` — Modal DOM-Baukasten

**Files:**
- Create: `brett/public/assets/mayhem/hero-select.js`

- [ ] **Schritt 1: Datei anlegen**

```js
'use strict';
// buildHeroSelectModal — fullscreen hero picker for Duel mode.
// Follows Brett Design System: ink-800 substrate, brass-game highlights, Geist Mono labels.
// Returns { el, destroy } where el is the overlay DOM element.

const FIGURE_PACK_ROOT = 'assets/figure-pack/';

function buildHeroSelectModal({ heroes, heroOrder, isSpectator = false, pvAiAvailable = false, onSelect, onPvAiToggle }) {
  const el = document.createElement('div');
  el.id = 'hero-select-overlay';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 900;
    background: rgba(11,17,28,0.92);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: 'Geist Mono', monospace;
    backdrop-filter: blur(4px);
  `;

  // ── Heading ──────────────────────────────────────────────────────────────
  const heading = document.createElement('div');
  heading.textContent = 'WÄHLE DEINEN HELDEN';
  heading.style.cssText = `
    font-size: 13px; letter-spacing: 0.18em;
    color: #d7b06a; margin-bottom: 32px; text-transform: uppercase;
  `;
  el.appendChild(heading);

  // ── Status line ──────────────────────────────────────────────────────────
  const status = document.createElement('div');
  status.id = 'hero-select-status';
  status.style.cssText = `font-size: 11px; color: #b9bda3; margin-bottom: 24px;`;
  status.textContent = isSpectator ? 'ZUSCHAUER' : 'Warte auf Gegner …';
  el.appendChild(status);

  // ── Card grid ────────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText = `display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;`;
  el.appendChild(grid);

  const cardEls = {};

  for (const heroId of heroOrder) {
    const h = heroes[heroId];
    const card = document.createElement('div');
    card.dataset.heroId = heroId;
    card.style.cssText = `
      background: #17202e; border: 1px solid rgba(215,176,106,0.18);
      border-radius: 14px; padding: 20px 16px; width: 160px;
      cursor: ${isSpectator || !h.unlocked ? 'not-allowed' : 'pointer'};
      opacity: ${h.unlocked ? '1' : '0.4'};
      transition: border-color 120ms, box-shadow 120ms;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    `;

    // Figure preview (stacked PNGs)
    const figWrap = document.createElement('div');
    figWrap.style.cssText = 'position: relative; width: 64px; height: 96px;';

    function addLayer(src, filter) {
      const img = document.createElement('img');
      img.src = FIGURE_PACK_ROOT + src;
      img.style.cssText = `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;`;
      if (filter) img.style.filter = filter;
      figWrap.appendChild(img);
    }

    addLayer('faces/' + h.figure.face + '.png', null);
    if (h.figure.hair) addLayer('accessories/' + h.figure.hair + '.png', h.figure.hairTint);
    if (h.figure.clothing) addLayer('accessories/' + h.figure.clothing + '.png', null);
    card.appendChild(figWrap);

    // Name
    const name = document.createElement('div');
    name.textContent = h.name;
    name.style.cssText = `font-size: 13px; color: #f0d28c; letter-spacing: 0.1em;`;
    card.appendChild(name);

    // Unlocked status
    if (!h.unlocked) {
      const locked = document.createElement('div');
      locked.textContent = 'Bald verfügbar';
      locked.style.cssText = `font-size: 10px; color: #6f8db8; letter-spacing: 0.06em;`;
      card.appendChild(locked);
    } else {
      // Ability list
      const abilityList = document.createElement('div');
      abilityList.style.cssText = `font-size: 10px; color: #b9bda3; line-height: 1.6; text-align: center;`;
      abilityList.textContent = h.description.split(' · ').slice(1).join(' · ');
      card.appendChild(abilityList);
    }

    // Click handler
    if (!isSpectator && h.unlocked) {
      card.addEventListener('click', () => {
        if (card.dataset.locked === 'true') return;
        onSelect(heroId);
        _markSelected(card);
      });
      card.addEventListener('mouseenter', () => {
        if (card.dataset.locked !== 'true' && !card.dataset.selected) {
          card.style.borderColor = 'rgba(215,176,106,0.5)';
        }
      });
      card.addEventListener('mouseleave', () => {
        if (!card.dataset.selected) card.style.borderColor = 'rgba(215,176,106,0.18)';
      });
    }

    grid.appendChild(card);
    cardEls[heroId] = card;
  }

  function _markSelected(selectedCard) {
    for (const c of Object.values(cardEls)) {
      c.dataset.selected = '';
      c.style.borderColor = 'rgba(215,176,106,0.18)';
      c.style.boxShadow   = '';
    }
    selectedCard.dataset.selected = 'true';
    selectedCard.style.borderColor = '#d7b06a';
    selectedCard.style.boxShadow   = '0 0 0 1px #d7b06a, 0 0 24px rgba(200,169,110,0.25)';
  }

  // ── PvAI toggle (only when 1 player in room) ─────────────────────────────
  if (!isSpectator && pvAiAvailable) {
    const pvAiRow = document.createElement('div');
    pvAiRow.style.cssText = `margin-top: 20px; display: flex; align-items: center; gap: 10px;`;
    const pvAiBtn = document.createElement('button');
    pvAiBtn.textContent = 'Gegen KI spielen';
    pvAiBtn.style.cssText = `
      background: transparent; border: 1px solid rgba(215,176,106,0.35);
      border-radius: 8px; padding: 6px 16px; color: #b9bda3;
      font-family: 'Geist Mono', monospace; font-size: 11px; cursor: pointer;
    `;
    pvAiBtn.addEventListener('click', () => {
      const active = pvAiBtn.dataset.active === 'true';
      pvAiBtn.dataset.active = active ? '' : 'true';
      pvAiBtn.style.color = active ? '#b9bda3' : '#d7b06a';
      pvAiBtn.style.borderColor = active ? 'rgba(215,176,106,0.35)' : '#d7b06a';
      if (onPvAiToggle) onPvAiToggle(!active);
    });
    pvAiRow.appendChild(pvAiBtn);
    el.appendChild(pvAiRow);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  // Lock a card (opponent chose this hero)
  function lockCard(heroId) {
    const c = cardEls[heroId];
    if (!c) return;
    c.dataset.locked  = 'true';
    c.style.opacity   = '0.35';
    c.style.cursor    = 'not-allowed';
  }

  // Show waiting / ready status
  function setStatus(text) {
    status.textContent = text;
  }

  // Show "Spielen ›" button
  function showPlayButton(onClick) {
    const btn = document.createElement('button');
    btn.textContent = 'Spielen ›';
    btn.style.cssText = `
      margin-top: 24px; background: transparent;
      border: 1px solid #d7b06a; border-radius: 8px;
      padding: 10px 32px; color: #d7b06a;
      font-family: 'Geist Mono', monospace; font-size: 13px;
      letter-spacing: 0.1em; cursor: pointer;
    `;
    btn.addEventListener('click', onClick);
    el.appendChild(btn);
    return btn;
  }

  function destroy() { el.remove(); }

  return { el, lockCard, setStatus, showPlayButton, destroy };
}

if (typeof window !== 'undefined') {
  window.MayhemHeroSelect = { buildHeroSelectModal };
}
```

- [ ] **Schritt 2: In `index.html` einbinden**

Nach `heroes.js`:
```html
<script src="assets/mayhem/hero-select.js"></script>
```

- [ ] **Schritt 3: Smoke-Test im Browser**

In der Browser-Console ausführen:
```js
const modal = MayhemHeroSelect.buildHeroSelectModal({
  heroes: MayhemHeroes.HEROES,
  heroOrder: MayhemHeroes.HERO_ORDER,
  isSpectator: false,
  pvAiAvailable: true,
  onSelect: id => console.log('selected:', id),
});
document.body.appendChild(modal.el);
```

Erwartet: Modal erscheint. Patrick anklickbar (brass-border bei Hover, Selektion). Tina/Martina/Oskar ausgegraut.

- [ ] **Schritt 4: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/hero-select.js brett/public/index.html
git commit -m "feat(mayhem): add hero-select.js modal with figure-pack previews and PvAI toggle"
```

---

### Task 10: `mayhem.js` — Duel-Lifecycle-Wiring

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Schritt 1: Duel-Variablen deklarieren**

Nach den Crosshair-Variablen einfügen:
```js
let _isSpectator  = false;
let _pvAiMode     = false;
let _heroSelectUi = null;   // { el, lockCard, setStatus, showPlayButton, destroy }
let _myHeroId     = null;
let _opponentHeroId = null;
let _duelRoundPause = false;
```

- [ ] **Schritt 2: Duel-Mode in `GameModeManager`-Callbacks einbinden**

Beim Initialisieren von `gameMode` (wo `new GameModeManager({...})` aufgerufen wird), `onDuelEnd` ergänzen:
```js
  gameMode = new MayhemGameMode.GameModeManager({
    onRespawn:    _onRespawn,
    onModeChange: _onModeChange,
    onLmsEnd:     _onLmsEnd,
    onDuelEnd:    _onDuelEnd,
  });
```

- [ ] **Schritt 3: `_onModeChange` erweitern**

Im bestehenden `_onModeChange(mode)`-Handler, branch für `duel` einfügen:
```js
  function _onModeChange(mode) {
    // … bestehender Code …
    if (mode === 'duel') {
      _showHeroSelectModal();
    }
  }
```

- [ ] **Schritt 4: `_showHeroSelectModal()` implementieren**

```js
  function _showHeroSelectModal() {
    if (_heroSelectUi) _heroSelectUi.destroy();
    const pvAiAvailable = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-')).length === 0;
    _heroSelectUi = MayhemHeroSelect.buildHeroSelectModal({
      heroes:     MayhemHeroes.HEROES,
      heroOrder:  MayhemHeroes.HERO_ORDER,
      isSpectator: _isSpectator,
      pvAiAvailable,
      onSelect(heroId) {
        _myHeroId = heroId;
        MayhemHeroes.assignHero(localAvatar, heroId,
          MayhemWeapons.WeaponSystem, (w, origin, dir, id) => projectileManager.spawn(w, origin, dir, id));
        ws.send(JSON.stringify({ type: 'hero_select', heroId }));
        _heroSelectUi.setStatus('Warte auf Gegner …');
        _checkBothHeroesSelected();
      },
      onPvAiToggle(active) { _pvAiMode = active; },
    });
    document.body.appendChild(_heroSelectUi.el);
  }
```

- [ ] **Schritt 5: Incoming-WS-Handler für Duel-Messages**

Im WS-`onmessage`-Handler, nach den bestehenden `if (msg.type === '...')` Branches:
```js
        if (msg.type === 'hero_select') {
          _opponentHeroId = msg.heroId;
          if (_heroSelectUi) {
            _heroSelectUi.lockCard(msg.heroId);
            _heroSelectUi.setStatus('Gegner hat gewählt ✓');
          }
          _checkBothHeroesSelected();
        }

        if (msg.type === 'duel_start') {
          _startDuelRound(msg.playerA, msg.playerB);
        }

        if (msg.type === 'duel_round_end') {
          _onDuelRoundEnd(msg);
        }

        if (msg.type === 'duel_match_end') {
          _onDuelEnd({ matchWinner: msg.winner, reason: msg.reason });
        }

        if (msg.type === 'hero_stealth') {
          const av = remoteAvatars.get(msg.playerId);
          if (av) av.mannequin.root.visible = !msg.active;
        }

        if (msg.type === 'hero_teleport') {
          const av = remoteAvatars.get(msg.playerId);
          if (av) { av.mannequin.root.position.x = msg.x; av.mannequin.root.position.z = msg.z; }
        }
```

- [ ] **Schritt 6: `_checkBothHeroesSelected()` + `_startDuelRound()`**

```js
  function _checkBothHeroesSelected() {
    if (!_myHeroId || !_opponentHeroId) return;
    if (!isHost) return;  // only host drives start
    // Host picks first if PvAI
    if (_pvAiMode && !_opponentHeroId) return;
    if (_heroSelectUi) {
      _heroSelectUi.showPlayButton(() => {
        const pA = localPlayerId;
        const pB = _pvAiMode ? 'bot-pvai' : [...remoteAvatars.keys()][0];
        gameMode.startDuelFighting(pA, pB);
        ws.send(JSON.stringify({ type: 'duel_start', playerA: pA, playerB: pB }));
        _startDuelRound(pA, pB);
      });
    }
  }

  function _startDuelRound(playerA, playerB) {
    if (_heroSelectUi) { _heroSelectUi.destroy(); _heroSelectUi = null; }
    _duelRoundPause = false;
    if (_pvAiMode) _spawnPvAiBot(_opponentHeroId || 'patrick');
    _buildDuelHud();
  }
```

- [ ] **Schritt 7: `_onDuelRoundEnd()` + `_onDuelEnd()`**

```js
  function _onDuelRoundEnd({ winner, winsA, winsB }) {
    _duelRoundPause = true;
    _showDuelRoundResult(winner, winsA, winsB);
    setTimeout(() => {
      if (winsA < 2 && winsB < 2) {
        // New round, same heroes — reset positions, resetHero()
        localAvatar.resetHero();
        localAvatar.resetHp();
        _respawnLocalAvatar();
        _duelRoundPause = false;
      }
    }, 3000);
  }

  function _onDuelEnd({ matchWinner, reason }) {
    _showDuelMatchResult(matchWinner, reason);
    // After 5s return to warmup
    setTimeout(() => gameMode.setMode('warmup'), 5000);
  }
```

- [ ] **Schritt 8: `player_death` im Duel-Mode verarbeiten**

Im `player_death`-Handler, branch einfügen:
```js
        if (msg.type === 'player_death' && gameMode && gameMode.mode === 'duel' && isHost && !_duelRoundPause) {
          const result = gameMode.handleDuelDeath(msg.playerId);
          ws.send(JSON.stringify({
            type: result.matchOver ? 'duel_match_end' : 'duel_round_end',
            winner: result.matchOver ? result.matchWinner : result.roundWinner,
            winsA: gameMode.duelState.winsA,
            winsB: gameMode.duelState.winsB,
          }));
        }
```

- [ ] **Schritt 9: Manueller Smoke-Test**

Zwei Browser-Tabs öffnen, beide Mayhem-Duel starten → Hero-Select erscheint → Patrick wählen in Tab 1 → Tab 2 sieht `lock` → Tab 2 wählt Patrick → Host sieht "Spielen"-Button → Klick → Runde startet.

- [ ] **Schritt 10: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): wire duel lifecycle — hero-select modal, duel_start, round/match end"
```

---

### Task 11: `mayhem.js` — Spectator-System

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Schritt 1: Spectator-Erkennung bei `player_join`**

Im `player_join`-Handler: wenn Duel-Mode aktiv und bereits 2 Kämpfer vorhanden:
```js
        if (msg.type === 'player_join') {
          // … bestehender Code …
          if (gameMode && gameMode.mode === 'duel') {
            const fighters = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'));
            if (fighters.length >= 2 && msg.playerId === localPlayerId) {
              _isSpectator = true;
              _enterSpectatorMode();
            }
          }
        }
```

- [ ] **Schritt 2: `_enterSpectatorMode()`**

```js
  function _enterSpectatorMode() {
    _isSpectator = true;
    if (localAvatar) { localAvatar.mannequin.root.visible = false; }
    _showSpectatorHud();
    // Default: follow first fighter
    _specTarget = [...remoteAvatars.keys()].find(id => !id.startsWith('bot-')) || null;
    _specMode   = 'follow';  // 'follow' | 'fly'
  }
```

- [ ] **Schritt 3: Follow-Cam und Fly-Cam in `tick()`**

Neue Variablen:
```js
let _specTarget = null;
let _specMode   = 'follow';
let _specFlyVel = { x: 0, y: 0, z: 0 };
```

In `Mayhem.tick(dt)` für Spectators:
```js
    if (_isSpectator) {
      if (_specMode === 'follow' && _specTarget) {
        const av = remoteAvatars.get(_specTarget);
        if (av) MayhemChaseCamera.update(camera, av.mannequin.root.position, dt);
      } else if (_specMode === 'fly') {
        // WASD = fly, handled via existing key state
        const FLYSPEED = 8;
        if (keys['KeyW']) { _specFlyVel.z = -FLYSPEED * dt; }
        else if (keys['KeyS']) { _specFlyVel.z = FLYSPEED * dt; }
        else { _specFlyVel.z = 0; }
        if (keys['KeyA']) { _specFlyVel.x = -FLYSPEED * dt; }
        else if (keys['KeyD']) { _specFlyVel.x = FLYSPEED * dt; }
        else { _specFlyVel.x = 0; }
        if (keys['KeyQ']) _specFlyVel.y = -FLYSPEED * dt;
        else if (keys['KeyE']) _specFlyVel.y = FLYSPEED * dt;
        else _specFlyVel.y = 0;
        camera.position.x = Math.max(-13, Math.min(13, camera.position.x + _specFlyVel.x));
        camera.position.y = Math.max(1,   Math.min(8,  camera.position.y + _specFlyVel.y));
        camera.position.z = Math.max(-13, Math.min(13, camera.position.z + _specFlyVel.z));
        camera.lookAt(0, 0, 0);
      }
      return; // spectators skip all input processing below
    }
```

- [ ] **Schritt 4: Tab-Taste und F-Taste für Spectators**

Im `keydown`-Handler:
```js
        if (_isSpectator) {
          if (e.code === 'Tab') {
            e.preventDefault();
            _cycleSpecTarget();
          }
          if (e.code === 'KeyF') {
            _specMode = _specMode === 'fly' ? 'follow' : 'fly';
            if (_specMode === 'fly' && document.pointerLockElement === null) {
              document.documentElement.requestPointerLock().catch(() => {});
            } else if (_specMode === 'follow') {
              document.exitPointerLock();
            }
          }
        }

  function _cycleSpecTarget() {
    const fighters = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'));
    const idx = fighters.indexOf(_specTarget);
    _specTarget = fighters[(idx + 1) % fighters.length] || null;
  }
```

- [ ] **Schritt 5: Spectator-HUD**

```js
  function _showSpectatorHud() {
    const hud = document.createElement('div');
    hud.id = 'spectator-hud';
    hud.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(11,17,28,0.8); border: 1px solid rgba(215,176,106,0.18);
      border-radius: 999px; padding: 6px 18px;
      font-family: 'Geist Mono', monospace; font-size: 11px;
      color: #d7b06a; letter-spacing: 0.1em; pointer-events: none;
    `;
    hud.textContent = 'ZUSCHAUER · Tab = Spieler wechseln · F = Freie Kamera';
    document.body.appendChild(hud);
  }
```

- [ ] **Schritt 6: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): add spectator system — follow-cam (Tab) + free fly-cam (F key)"
```

---

### Task 12: `mayhem.js` — Patrick Stealth + Teleport

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Schritt 1: Stealth-Cooldown-Tracking**

Neue Variable:
```js
const _specialCooldowns = {};  // heroId+key → lastUsedMs
```

Hilfsfunktion:
```js
  function _canUseSpecial(key, cooldownMs) {
    const now  = Date.now();
    const last = _specialCooldowns[key] || 0;
    if (now - last < cooldownMs) return false;
    _specialCooldowns[key] = now;
    return true;
  }
```

- [ ] **Schritt 2: Taste 4 — Stealth**

Im `keydown`-Handler, nach vorhandenen Weapon-Slots:
```js
        if (e.code === 'Digit4' && _myHeroId === 'patrick') {
          if (_canUseSpecial('stealth', 8000)) {
            // Apply local visual
            localAvatar.mannequin.root.traverse(o => {
              if (o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = 0.15; }
            });
            ws.send(JSON.stringify({ type: 'hero_stealth', active: true }));
            setTimeout(() => {
              localAvatar.mannequin.root.traverse(o => {
                if (o.isMesh && o.material) { o.material.opacity = 1.0; }
              });
              ws.send(JSON.stringify({ type: 'hero_stealth', active: false }));
            }, 2000);
          }
        }
```

- [ ] **Schritt 3: Taste 5 — Teleportation**

```js
        if (e.code === 'Digit5' && _myHeroId === 'patrick') {
          if (_canUseSpecial('teleport', 6000) && _aimPoint) {
            const lp = localAvatar.mannequin.root.position;
            const dx = _aimPoint.x - lp.x, dz = _aimPoint.z - lp.z;
            const dist = Math.hypot(dx, dz);
            const maxRange = 5;
            const scale = dist > maxRange ? maxRange / dist : 1;
            const tx = lp.x + dx * scale;
            const tz = lp.z + dz * scale;
            // Spawn smoke-puff at origin
            MayhemEffects.spawnSmokePuff(scene, { x: lp.x, y: 0.5, z: lp.z });
            // Move
            localAvatar.mannequin.root.position.set(tx, lp.y, tz);
            // Spawn smoke-puff at destination
            MayhemEffects.spawnSmokePuff(scene, { x: tx, y: 0.5, z: tz });
            ws.send(JSON.stringify({ type: 'hero_teleport', x: tx, z: tz }));
          }
        }
```

- [ ] **Schritt 4: Manueller Smoke-Test**

Patrick wählen → Taste 4 → Figur wird transluzent für 2s → Cooldown-Ring im HUD läuft. Taste 5 + Crosshair weit weg → Figur springt sofort, Rauch-Effekte an alter und neuer Position.

- [ ] **Schritt 5: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): add Patrick stealth (key 4) and teleport (key 5) specials"
```

---

### Task 13: `audio.js` + Duel-HUD-Labels — Scheibe 1 abschließen

**Files:**
- Modify: `brett/public/assets/mayhem/audio.js`
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Schritt 1: SFX-Einträge in `audio.js`**

In `SFX_MAP` (nach bestehenden Einträgen) einfügen:
```js
  // Hero abilities — audio files to be delivered as separate chore
  'frostnova':          SFX_ROOT + 'frostnova.ogg',
  'chainlightning':     SFX_ROOT + 'chainlightning.ogg',
  'summon-minion':      SFX_ROOT + 'summon-minion.ogg',
  'shield-minion':      SFX_ROOT + 'shield-minion.ogg',
  'frenzy-minion':      SFX_ROOT + 'frenzy-minion.ogg',
  'motorcycle-engine':  SFX_ROOT + 'motorcycle-engine.ogg',
  'vehicle-switch':     SFX_ROOT + 'vehicle-switch.ogg',
  'vehicle-repair':     SFX_ROOT + 'vehicle-repair.ogg',
  'hero-stealth':       SFX_ROOT + 'hero-stealth.ogg',
  'hero-teleport':      SFX_ROOT + 'hero-teleport.ogg',
```

Audio fehlt noch → silent fail (bestehende `catch(() => {})` in MayhemAudio deckt das ab).

- [ ] **Schritt 2: `_buildDuelHud()` in `mayhem.js`**

```js
  function _buildDuelHud() {
    const existing = document.getElementById('duel-score-hud');
    if (existing) existing.remove();
    const hud = document.createElement('div');
    hud.id = 'duel-score-hud';
    hud.style.cssText = `
      position: fixed; top: 44px; left: 50%; transform: translateX(-50%);
      font-family: 'Geist Mono', monospace; font-size: 12px;
      color: #d7b06a; letter-spacing: 0.12em;
      pointer-events: none; text-align: center;
    `;
    hud.textContent = `RUNDE ${gameMode.duelState.winsA + gameMode.duelState.winsB + 1}`;
    document.body.appendChild(hud);
  }

  function _showDuelRoundResult(winnerId, winsA, winsB) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(11,17,28,0.7); z-index: 800;
      font-family: 'Geist Mono', monospace; pointer-events: none;
    `;
    overlay.innerHTML = `
      <div style="font-size: 22px; color: #f0d28c; letter-spacing: 0.18em; margin-bottom: 12px;">
        RUNDE GEWONNEN
      </div>
      <div style="font-size: 14px; color: #b9bda3;">
        ${winsA} : ${winsB}
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3000);
  }

  function _showDuelMatchResult(matchWinnerId, reason) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(11,17,28,0.88); z-index: 800;
      font-family: 'Geist Mono', monospace;
    `;
    const isWin  = matchWinnerId === localPlayerId;
    const label  = reason === 'disconnect' ? 'UNENTSCHIEDEN' : isWin ? 'SIEG' : 'NIEDERLAGE';
    const color  = reason === 'disconnect' ? '#b9bda3' : isWin ? '#d7b06a' : '#a83a30';
    overlay.innerHTML = `
      <div style="font-size: 32px; color: ${color}; letter-spacing: 0.2em;">${label}</div>
    `;
    document.body.appendChild(overlay);
  }
```

- [ ] **Schritt 3: Alle Tests laufen (kein Rückschritt)**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/*.test.js test/*.test.mjs 2>&1 | tail -15
```

- [ ] **Schritt 4: Scheibe 1 committen + pushen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/audio.js brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): scheibe 1 complete — Patrick duel playable with crosshair, arena, spectators [T000248]"
git push -u origin feature/mayhem-duel-heroes
```

---

## ═══════════════ SCHEIBE 2 — Tina (Hexe) ═══════════════

---

### Task 14: Tina — Frostnova AoE + Kettenblitz-Mesh

**Files:**
- Modify: `brett/public/assets/mayhem/effects.js`
- Modify: `brett/public/assets/mayhem/projectiles.js`
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Schritt 1: Frostnova-Burst in `effects.js`**

Am Ende von `effects.js`, vor dem `window.MayhemEffects`-Block:
```js
// Frostnova — torus ring that expands from r=0 → r=2.5 in 300ms, then fades.
function spawnFrostnovaEffect(scene, origin) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6fa8d8, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
  });
  let radius = 0.05;
  const updateGeo = () => new THREE.TorusGeometry(radius, 0.06, 8, 32);
  const mesh = new THREE.Mesh(updateGeo(), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(origin.x, 0.15, origin.z);
  scene.add(mesh);

  const start  = performance.now();
  const EXPAND = 300;    // ms to reach max radius
  const FADE   = 200;    // ms to fade after expanding

  function animate(now) {
    const elapsed = now - start;
    if (elapsed < EXPAND) {
      radius = 2.5 * (elapsed / EXPAND);
      mesh.geometry.dispose();
      mesh.geometry = updateGeo();
    } else if (elapsed < EXPAND + FADE) {
      mat.opacity = 0.8 * (1 - (elapsed - EXPAND) / FADE);
    } else {
      scene.remove(mesh);
      mesh.geometry.dispose();
      return;
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
```

`window.MayhemEffects`-Export erweitern:
```js
window.MayhemEffects = { ..., spawnFrostnovaEffect };
```

- [ ] **Schritt 2: Kettenblitz-Mesh-Factory in `projectiles.js`**

In `projectiles.js`, nach `mkFireballMesh()`:
```js
function mkChainMesh(THREE) {
  // Randomly jittered arc via CatmullRomCurve3
  const points = [];
  for (let i = 0; i <= 5; i++) {
    points.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      0.05 + Math.random() * 0.2,
      -i * 0.3,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo   = new THREE.TubeGeometry(curve, 20, 0.035, 4, false);
  const mat   = new THREE.MeshBasicMaterial({ color: 0x6fa8d8 });  // stille-blau
  return new THREE.Mesh(geo, mat);
}
```

Im `ProjectileManager.spawn()`-Branch wo `projectileType` ausgewertet wird, case für `'chain'` hinzufügen:
```js
      case 'chain':   mesh = mkChainMesh(THREE); break;
```

- [ ] **Schritt 3: Frostnova-AoE-Handler in `mayhem.js`**

Im Waffen-Fire-Handler, nach dem normalen `projectileManager.spawn(...)` call, branch für `projectileType === 'frostnova'`:

```js
        if (w.projectileType === 'frostnova') {
          // AoE burst — no flying projectile
          MayhemEffects.spawnFrostnovaEffect(scene, localAvatar.mannequin.root.position);
          MayhemAudio.onFire('frostnova');
          // Check all remote avatars in range
          for (const [remoteId, remoteAv] of remoteAvatars) {
            const rp = remoteAv.mannequin.root.position;
            const lp = localAvatar.mannequin.root.position;
            const dist = Math.hypot(rp.x - lp.x, rp.z - lp.z);
            if (dist <= w.aoeRadius) {
              ws.send(JSON.stringify({
                type: 'hit', targetId: remoteId,
                damage: w.damage, weaponKey: 'frostnova',
              }));
            }
          }
          // Apply slow debuff locally to anyone who receives the hit
          // (remote clients apply via their own processLocalHit + hero_slow message)
          ws.send(JSON.stringify({
            type: 'hero_slow', slowFactor: w.slowFactor, durationMs: w.slowDurationMs,
          }));
          return;  // no projectile spawned
        }
```

Auch im WS-Handler für `'hero_slow'`:
```js
        if (msg.type === 'hero_slow') {
          localAvatar.applySlowDebuff(msg.slowFactor, msg.slowDurationMs);
        }
```

`hero_slow` zu `RELAY_TYPES` in `server.js` und `TRANSIENT_TYPES` hinzufügen (in server.js ändern, dann Tests laufen).

- [ ] **Schritt 4: Server.js — `hero_slow` ergänzen**

```bash
# In server.js RELAY_TYPES array:
# 'hero_slow'  ← anfügen
# In TRANSIENT_TYPES set:
# 'hero_slow'  ← anfügen
```

- [ ] **Schritt 5: Tests laufen**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/server-mayhem.test.js 2>&1 | tail -10
```

- [ ] **Schritt 6: Tina in `heroes.js` freischalten**

In `heroes.js`, `tina.unlocked` auf `true` setzen:
```js
    unlocked: true,   // Scheibe 2 complete
```

- [ ] **Schritt 7: Manueller Smoke-Test**

Tina wählen → Frostnova (Taste 1): Ring-Expansion sichtbar, Gegner in 2.5m Radius bekommt Treffer + Slow. Kettenblitz (Taste 3): blauer Arc fliegt in Crosshair-Richtung.

- [ ] **Schritt 8: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/effects.js brett/public/assets/mayhem/projectiles.js \
        brett/public/assets/mayhem/mayhem.js brett/public/assets/mayhem/heroes.js brett/server.js
git commit -m "feat(mayhem): scheibe 2 complete — Tina with Frostnova AoE, chain lightning [T000248]"
git push origin feature/mayhem-duel-heroes
```

---

## ═══════════════ SCHEIBE 3 — Martina (Teamleiterin) ═══════════════

---

### Task 15: Martina — Minion-Integration in `mayhem.js`

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`
- Modify: `brett/public/assets/mayhem/heroes.js`

- [ ] **Schritt 1: MinionManager instanzieren bei Martina-Wahl**

In `assignHero()` Aufruf (Task 4 Schritt 4) — wenn `heroId === 'martina'`, `MinionManager` instanzieren:
```js
        if (heroId === 'martina') {
          window._minionManager = new MayhemHeroes.MinionManager({
            maxMinions: 2,
            minionMeshFactory: pos => {
              // Skalierter Mannequin (scale 0.6), sage-Farbe
              const m = new MayhemMannequin.Mannequin();
              m.root.scale.setScalar(0.6);
              m.root.position.set(pos.x, 0, pos.z);
              m.body.material = m.body.material.clone();
              m.body.material.color.setHex(0xb8c0a8);  // sage
              scene.add(m.root);
              return m.root;
            },
            onHit: ({ targetId, damage }) => {
              ws.send(JSON.stringify({ type: 'hit', targetId, damage, weaponKey: 'minion-melee' }));
            },
            onSync: msg => ws.send(JSON.stringify(msg)),
          });
        }
```

- [ ] **Schritt 2: Waffen-Fire-Handler für Martina-Abilities**

Im Waffen-Fire-Handler, branches für `summon`, `buff`:
```js
        if (w.projectileType === 'summon') {
          const mm = window._minionManager;
          if (mm && mm.count < 2) {
            const enemy = [...remoteAvatars.values()][0];
            mm.spawn(localAvatar.mannequin.root.position, enemy
              ? { id: [...remoteAvatars.keys()][0], pos: enemy.mannequin.root.position }
              : null);
            MayhemAudio.onFire('summon-minion');
          }
          return;
        }
        if (w.key === 'shield_minion') {
          if (window._minionManager) { window._minionManager.shieldOldest(); MayhemAudio.onFire('shield-minion'); }
          return;
        }
        if (w.key === 'frenzy_minion') {
          if (window._minionManager) { window._minionManager.frenzyOldest(); MayhemAudio.onFire('frenzy-minion'); }
          return;
        }
```

- [ ] **Schritt 3: MinionManager-Tick in `Mayhem.tick()`**

```js
    if (window._minionManager) {
      window._minionManager.tick(dt, Date.now());
    }
```

- [ ] **Schritt 4: Eingehende Minion-Messages verarbeiten**

```js
        if (msg.type === 'minion_spawn') {
          // Remote client spawns a minion mesh for visual sync
          const miniMesh = /* small box placeholder */ new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.9, 0.3),
            new THREE.MeshLambertMaterial({ color: 0xb8c0a8 })
          );
          miniMesh.position.set(msg.x, 0.45, msg.z);
          scene.add(miniMesh);
          window._remoteMinionMeshes = window._remoteMinionMeshes || new Map();
          window._remoteMinionMeshes.set(msg.minionId, miniMesh);
        }
        if (msg.type === 'minion_update') {
          const mesh = window._remoteMinionMeshes && window._remoteMinionMeshes.get(msg.minionId);
          if (mesh) { mesh.position.x = msg.x; mesh.position.z = msg.z; }
        }
        if (msg.type === 'minion_die') {
          const mesh = window._remoteMinionMeshes && window._remoteMinionMeshes.get(msg.minionId);
          if (mesh) { scene.remove(mesh); window._remoteMinionMeshes.delete(msg.minionId); }
        }
```

- [ ] **Schritt 5: Martina in `heroes.js` freischalten**

```js
    unlocked: true,   // Scheibe 3 complete
```

- [ ] **Schritt 6: Manueller Smoke-Test**

Martina wählen → Taste 1: Minion-Figur spawnt und läuft auf Gegner zu → Melee-Damage → Taste 2: Minion bekommt Schutzring → nächster Treffer absorbiert. Taste 3: Minion wird schneller + rot leuchtend (fire-sprite).

- [ ] **Schritt 7: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/mayhem.js brett/public/assets/mayhem/heroes.js
git commit -m "feat(mayhem): scheibe 3 complete — Martina with MinionManager, shield, frenzy [T000248]"
git push origin feature/mayhem-duel-heroes
```

---

## ═══════════════ SCHEIBE 4 — Oskar (Mechaniker) ═══════════════

---

### Task 16: Oskar — Fahrzeuge, AutoTurret, Sprint

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`
- Modify: `brett/public/assets/mayhem/heroes.js`
- Modify: `brett/public/assets/mayhem/vehicle.js`

- [ ] **Schritt 1: AutoTurret-Klasse in `vehicle.js` ergänzen**

Am Ende von `vehicle.js`, vor dem `window.MayhemVehicle`-Block:
```js
class AutoTurret {
  constructor({ vehicle, scene, THREE, onFire }) {
    this._vehicle = vehicle;
    this._active  = false;
    this._lastFire = 0;
    this._geo  = new THREE.BoxGeometry(0.15, 0.15, 0.5);
    this._mat  = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.position.set(0, 0.6, -0.4);
    vehicle.mesh && vehicle.mesh.add(this._mesh);
    this._onFire = onFire || (() => {});
  }

  enable()  { this._active = true; }
  disable() { this._active = false; }

  tick(remoteAvatars, nowMs) {
    if (!this._active) return;
    if (nowMs - this._lastFire < 600) return;
    let nearest = null, nearestDist = Infinity;
    const vp = this._vehicle.mesh ? this._vehicle.mesh.position : { x: 0, z: 0 };
    for (const [id, av] of remoteAvatars) {
      const rp   = av.mannequin.root.position;
      const dist = Math.hypot(rp.x - vp.x, rp.z - vp.z);
      if (dist < 4 && dist < nearestDist) { nearest = { id, pos: rp }; nearestDist = dist; }
    }
    if (!nearest) return;
    this._lastFire = nowMs;
    // Rotate turret toward target
    const dx = nearest.pos.x - vp.x, dz = nearest.pos.z - vp.z;
    this._mesh.rotation.y = Math.atan2(dx, dz);
    // Fire
    this._onFire({ targetId: nearest.id, damage: 15, weaponKey: 'turret' });
  }
}
```

`window.MayhemVehicle`-Export erweitern:
```js
window.MayhemVehicle = { ..., AutoTurret };
```

- [ ] **Schritt 2: Oskar-Waffen-Handler in `mayhem.js`**

```js
        if (w.projectileType === 'vehicle_switch') {
          // Despawn current vehicle, spawn opposite type
          const current = localAvatar._vehicle;
          const nextType = (!current || current.type === 'motorcycle') ? 'car' : 'motorcycle';
          if (current) {
            MayhemVehicle.Vehicle.despawn(current, scene);
            if (window._autoTurret) { window._autoTurret.disable(); }
          }
          const newVehicle = MayhemVehicle.Vehicle.spawn(nextType, localAvatar.mannequin.root.position, scene);
          localAvatar._vehicle = newVehicle;
          MayhemAudio.onFire('vehicle-switch');
          if (nextType === 'car') {
            window._autoTurret = new MayhemVehicle.AutoTurret({
              vehicle: newVehicle, scene, THREE,
              onFire: ({ targetId, damage }) => {
                ws.send(JSON.stringify({ type: 'hit', targetId, damage, weaponKey: 'turret' }));
              },
            });
            window._autoTurret.enable();
          }
          return;
        }

        if (w.projectileType === 'repair') {
          const v = localAvatar._vehicle;
          if (v) {
            v.hp = Math.min(v.maxHp, (v.hp || 0) + 40);
            MayhemEffects.spawnSmokePuff(scene, v.mesh ? v.mesh.position : localAvatar.mannequin.root.position);
            MayhemAudio.onFire('vehicle-repair');
          }
          return;
        }

        if (w.projectileType === 'sprint') {
          const v = localAvatar._vehicle;
          if (v) {
            v.speedMult = 2.5;
            v.damagesOnContact = true;
            MayhemAudio.onFire('motorcycle-engine');
            setTimeout(() => { v.speedMult = 1; v.damagesOnContact = false; }, 1500);
          }
          return;
        }
```

- [ ] **Schritt 3: AutoTurret-Tick in `Mayhem.tick()`**

```js
    if (window._autoTurret) {
      window._autoTurret.tick(remoteAvatars, Date.now());
    }
```

- [ ] **Schritt 4: Oskar Motorrad-Spawn beim Duel-Start**

In `_startDuelRound()`, wenn `_myHeroId === 'oskar'`:
```js
    if (_myHeroId === 'oskar') {
      const vehicle = MayhemVehicle.Vehicle.spawn('motorcycle', localAvatar.mannequin.root.position, scene);
      localAvatar._vehicle = vehicle;
    }
```

- [ ] **Schritt 5: Oskar in `heroes.js` freischalten**

```js
    unlocked: true,   // Scheibe 4 complete
```

- [ ] **Schritt 6: Manueller Smoke-Test**

Oskar wählen → startet auf Motorrad → Taste 1: wechselt zu Auto, Turret dreht sich auf Gegner und feuert alle 600ms → Taste 2: Fahrzeug-HP +40 → Taste 3: Sprint-Boost für 1.5s, Kollision mit Gegner macht 20 Schaden.

- [ ] **Schritt 7: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/mayhem.js brett/public/assets/mayhem/vehicle.js brett/public/assets/mayhem/heroes.js
git commit -m "feat(mayhem): scheibe 4 complete — Oskar with vehicle switch, AutoTurret, sprint [T000248]"
git push origin feature/mayhem-duel-heroes
```

---

## ═══════════════ SCHEIBE 5 — PvAI ═══════════════

---

### Task 17: `ai-bot.js` — Hero-spezifische KI-Profile

**Files:**
- Modify: `brett/public/assets/mayhem/ai-bot.js`

- [ ] **Schritt 1: `aabbRay` in ai-bot verfügbar machen**

Am Anfang der KI-Tick-Logik:
```js
  const aabbRay = (typeof MayhemPhysics !== 'undefined') ? MayhemPhysics.aabbRay : () => false;
```

- [ ] **Schritt 2: `_hasLos(bot, enemy, obstacles)` Hilfsfunktion**

```js
function _hasLos(botPos, enemyPos, obstacles) {
  return !MayhemPhysics.aabbRay(
    { x: botPos.x, y: 0.9, z: botPos.z },
    { x: enemyPos.x, y: 0.9, z: enemyPos.z },
    obstacles
  );
}
```

- [ ] **Schritt 3: Hero-KI-Profiles definieren**

Im `AIBot`-Objekt/Klasse, neue Methode `_heroDecide(heroId, dist, hasLos, botHp)`:

```js
function _heroDecide(heroId, dist, hasLos, botHp) {
  // Returns weapon key to fire, or null
  switch (heroId) {
    case 'tina':
      if (!hasLos) return null;
      if (dist < 2.5) return 'frostnova';
      if (dist < 8)   return 'chainlightning';
      return 'fireball';
    case 'martina':
      return null;   // MinionManager handles Martina — tick() spawns/buffs
    case 'oskar':
      if (dist > 5 && botHp > 40) return 'motorcycle_sprint';
      if (dist < 3) return 'vehicle_switch';   // switch to car + turret
      if (botHp < 40) return 'vehicle_repair';
      return null;   // turret handles shooting
    case 'patrick':
    default:
      if (!hasLos) return null;
      if (dist < 1.5) return 'katana';
      if (dist < 6)   return 'handgun';
      return 'rifle';
  }
}
```

- [ ] **Schritt 4: KI-Tick erweitern**

Im bestehenden `AIBot.tick(dt)`-Methode, nach der Bewegungslogik:

```js
    // Hero-aware attack decision
    if (!_retreating) {
      const weaponKey = _heroDecide(this.heroId, dist, _hasLos(botPos, enemyPos, obstacles), this.hp);
      if (weaponKey && weaponSystem && weaponSystem.canFire(weaponKey)) {
        weaponSystem.fire(weaponKey, botPos, dirToEnemy, botId);
      }
    }
    // Retreat if HP < 30%
    if (this.hp < 30 && !_retreating) {
      _retreating = true;
      setTimeout(() => { _retreating = false; }, 3000);
    }
```

- [ ] **Schritt 5: `_spawnPvAiBot()` in `mayhem.js`**

```js
  function _spawnPvAiBot(heroId) {
    const botId  = 'bot-pvai';
    const botPos = { x: 3, y: 0, z: 3 };   // opposite side of arena
    const bot    = new MayhemAiBot.AIBot({
      id: botId, heroId, pos: botPos, scene, THREE,
      obstacles, weaponSystem: new MayhemWeapons.WeaponSystem(
        MayhemHeroes.HEROES[heroId].abilities,
        (w, origin, dir, id) => {
          // Bot fires → send hit as if it were a real player
          projectileManager.spawn(w, origin, dir, id);
          ws.send(JSON.stringify({ type: 'hit', targetId: localPlayerId, damage: w.damage, weaponKey: w.key }));
        }),
    });
    bot.hp      = 100;
    bot.heroId  = heroId;
    window._pvAiBot = bot;
    remoteAvatars.set(botId, bot);  // so spectators can follow
  }
```

PvAI-Tick in `Mayhem.tick()`:
```js
    if (window._pvAiBot && _pvAiMode) {
      const enemy = { pos: localAvatar.mannequin.root.position };
      window._pvAiBot.tick(dt, enemy, obstacles);
    }
```

- [ ] **Schritt 6: Manueller Smoke-Test**

Hero-Select → "Gegen KI spielen" aktivieren → Patrick wählen → KI-Hero wählen (z.B. Tina) → Runde startet → KI bewegt sich auf Spieler zu, feuert Frostnova wenn nah, Kettenblitz wenn mittel-Distanz.

- [ ] **Schritt 7: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/mayhem/ai-bot.js brett/public/assets/mayhem/mayhem.js
git commit -m "feat(mayhem): scheibe 5 complete — PvAI with hero-aware profiles and LOS check [T000248]"
git push origin feature/mayhem-duel-heroes
```

---

## ═══════════════ FINALISIERUNG ═══════════════

---

### Task 18: SVG HUD-Icons (10 neue)

**Files:**
- Create: `brett/public/assets/icons/` (10 SVG-Dateien)
- Modify: `brett/public/assets/mayhem/hero-select.js` (Icon-Referenzen)

- [ ] **Schritt 1: SVG-Dateien anlegen**

Alle Icons: `viewBox="0 0 64 64"`, brass stroke `#d7b06a`, `stroke-width="1.4"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, fill=none. Cropmarks (opacity 0.35) an allen vier Ecken.

`brett/public/assets/icons/icon-frostnova.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <circle cx="32" cy="32" r="8"/>
  <line x1="32" y1="12" x2="32" y2="22"/><line x1="32" y1="42" x2="32" y2="52"/>
  <line x1="12" y1="32" x2="22" y2="32"/><line x1="42" y1="32" x2="52" y2="32"/>
  <line x1="18" y1="18" x2="25" y2="25"/><line x1="46" y1="18" x2="39" y2="25"/>
  <line x1="18" y1="46" x2="25" y2="39"/><line x1="46" y1="46" x2="39" y2="39"/>
</svg>
```

`brett/public/assets/icons/icon-chainlightning.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <polyline points="38,12 28,34 38,34 26,52"/>
</svg>
```

`brett/public/assets/icons/icon-summon-minion.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <circle cx="32" cy="40" r="8"/>
  <line x1="32" y1="10" x2="32" y2="28"/>
  <polyline points="24,20 32,10 40,20"/>
</svg>
```

`brett/public/assets/icons/icon-shield-minion.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <path d="M32,14 L50,22 L50,38 Q50,50 32,54 Q14,50 14,38 L14,22 Z"/>
</svg>
```

`brett/public/assets/icons/icon-frenzy-minion.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <circle cx="32" cy="36" r="7"/>
  <path d="M28,20 Q32,10 36,20 Q40,12 38,28" stroke-width="1.2"/>
</svg>
```

`brett/public/assets/icons/icon-vehicle-switch.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <rect x="10" y="36" width="18" height="10" rx="3"/>
  <circle cx="15" cy="48" r="3"/><circle cx="24" cy="48" r="3"/>
  <rect x="36" y="30" width="18" height="14" rx="3"/>
  <circle cx="41" cy="48" r="3"/><circle cx="50" cy="48" r="3"/>
  <line x1="28" y1="32" x2="36" y2="32"/>
  <polyline points="32,28 36,32 32,36"/>
</svg>
```

`brett/public/assets/icons/icon-repair.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <path d="M20,44 L44,20 M44,14 Q50,14 50,20 L44,20 L40,24 Q34,18 40,12 Q46,6 52,12 L44,20"/>
  <circle cx="20" cy="44" r="3"/>
</svg>
```

`brett/public/assets/icons/icon-sprint.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <polyline points="40,14 28,32 40,32 28,50"/>
  <line x1="10" y1="22" x2="22" y2="22"/>
  <line x1="10" y1="32" x2="20" y2="32"/>
  <line x1="10" y1="42" x2="22" y2="42"/>
</svg>
```

`brett/public/assets/icons/icon-stealth.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <path d="M12,32 Q32,14 52,32 Q32,50 12,32 Z"/>
  <circle cx="32" cy="32" r="6"/>
  <line x1="12" y1="12" x2="52" y2="52" stroke-dasharray="4,4"/>
</svg>
```

`brett/public/assets/icons/icon-teleport.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d7b06a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 10 H10 V14" opacity="0.35"/><path d="M58 10 H54 V14" opacity="0.35"/>
  <path d="M6 54 H10 V50" opacity="0.35"/><path d="M58 54 H54 V50" opacity="0.35"/>
  <circle cx="22" cy="40" r="10" stroke-dasharray="5,3"/>
  <circle cx="42" cy="24" r="10" stroke-dasharray="5,3"/>
  <line x1="30" y1="34" x2="36" y2="28"/>
  <polyline points="32,24 42,24 42,34"/>
</svg>
```

- [ ] **Schritt 2: Committen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git add brett/public/assets/icons/icon-frostnova.svg brett/public/assets/icons/icon-chainlightning.svg \
        brett/public/assets/icons/icon-summon-minion.svg brett/public/assets/icons/icon-shield-minion.svg \
        brett/public/assets/icons/icon-frenzy-minion.svg brett/public/assets/icons/icon-vehicle-switch.svg \
        brett/public/assets/icons/icon-repair.svg brett/public/assets/icons/icon-sprint.svg \
        brett/public/assets/icons/icon-stealth.svg brett/public/assets/icons/icon-teleport.svg
git commit -m "feat(mayhem): add 10 SVG HUD icons for hero abilities in Brett design system style"
```

---

### Task 19: Abschluss-Verifikation + PR

**Files:** alle

- [ ] **Schritt 1: Vollständige Test-Suite grün**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
MOCK_DB=true node --test test/*.test.js test/*.test.mjs 2>&1
```

Erwartet: alle Tests grün, 0 Failures.

- [ ] **Schritt 2: Brett-Unit-Tests**

```bash
cd /tmp/wt-mayhem-duel-heroes/brett
node --test test/ws-reconnect.test.mjs test/physics.test.js test/damage.test.mjs test/pickups.test.mjs test/mode-state.test.mjs 2>/dev/null | tail -10
```

- [ ] **Schritt 3: Akzeptanzkriterien manuell prüfen**

- [ ] Alle 4 Helden im Hero-Select sichtbar (Patrick spielbar, restliche bis Scheibe unlock)
- [ ] PvP-Duel vollständig: Hero-Select → Runde 1 → Runde 2 → Sieger-Screen (Best-of-3)
- [ ] PvAI-Duel: KI nutzt Basisbewegung + mind. eine Ability
- [ ] Spectator-Slots: Follow-Cam (Tab) + Fly-Cam (F) funktionieren
- [ ] Crosshair zeigt Mausrichtung; Projektil fliegt dorthin auch beim Rückwärtslaufen
- [ ] Arenawände blockieren Bewegung, Projektile, Sichtlinie (PvAI)
- [ ] Oskars Fahrzeuge für alle Spieler sichtbar und kollisionsfähig
- [ ] Desktop (Maus) + Mobile (Touch-Crosshair) spielbar

- [ ] **Schritt 4: PR erstellen**

```bash
cd /tmp/wt-mayhem-duel-heroes
git push origin feature/mayhem-duel-heroes
gh pr create \
  --title "feat(mayhem): Duel-Mode mit 4 Helden, Crosshair, Arena, Spectators, PvAI" \
  --body "$(cat <<'EOF'
## Summary
- Neuer 1v1 Duel-Mode (Best-of-3) mit Hero-Select-Warmup
- 4 Helden: Patrick (bestehende Waffen + Stealth/Teleport), Tina (Frostnova/Feuerball/Kettenblitz), Martina (Minions/Shield/Raserei), Oskar (Fahrzeuge/AutoTurret/Sprint)
- Crosshair-System: Maus-Raycast auf y=0-Plane, Schussrichtung unabhängig von Bewegung
- Hand-crafted symmetrische Duel-Arena (buildDuelArena)
- Spectator-System: Follow-Cam (Tab) + Fly-Cam (F)
- Rule-based PvAI mit hero-spezifischen Profilen + LOS-Check (aabbRay)
- 10 neue SVG HUD-Icons im Brett Design System Stil

## Test plan
- [ ] `MOCK_DB=true node --test test/*.test.js test/*.test.mjs` — grün
- [ ] PvP-Duel manuell getestet (zwei Browser-Tabs)
- [ ] PvAI-Duel manuell getestet (alle 4 KI-Helden)
- [ ] Spectator-Kamera (Follow + Fly) getestet
- [ ] Mobile: Touch-Crosshair auf iOS verifiziert

Ticket: T000248
Grilling: T000248

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Schritt 5: PR mergen**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Schritt 6: Brett-Deploy auf beiden Clustern**

```bash
cd /home/patrick/Bachelorprojekt
task feature:brett
```

Erwartet: Brett-Image rebuilt + rollout auf mentolder + korczewski. Verifikation: `https://brett.mentolder.de` und `https://brett.korczewski.de` zeigen neue Version.
