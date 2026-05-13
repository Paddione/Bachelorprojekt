---
title: Arena — Game Client (Plan 2b of 3) Implementation Plan
domains: [website, arena-server]
status: active
pr_number: null
---

# Arena — Game Client (Plan 2b of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `portal/arena.astro` placeholder with a fully playable browser client: Lobby scene (character picker + player roster), Match scene (Pixi.js top-down renderer consuming authoritative `match:diff` events at 30 Hz + React HUD overlay), and Results scene (place table + rematch vote) — so a logged-in user who clicks a banner link can play a complete match in the browser.

**Architecture:** `ArenaIsland.tsx` owns the Socket.io lifecycle and routes between three React scenes. `game/Renderer.ts` holds a Pixi.js Application; its `drawFrame(state)` is called from a Pixi ticker at 60 fps reading the latest MatchState snapshot that `MatchScene.tsx` assembles from incoming `match:full-snapshot` / `match:diff` messages. The HUD is a React overlay positioned over the canvas with CSS absolute positioning. `game/diff.ts` is a stateless function that interprets the terse ops format emitted by `arena-server/src/game/tick.ts` `buildDiff()`.

**Depends on:** Plan 2a fully deployed and passing smoke test. Verify arena-server is up: `curl -s https://arena-ws.mentolder.de/healthz` → `{"ok":true,...}`.

**Tech Stack:** React 18, Pixi.js v8, socket.io-client 4, TypeScript 5. Website framework: Astro 5 + @astrojs/svelte (existing) + @astrojs/react (new). Vitest for unit tests. Playwright for FA-38 E2E.

---

## File Structure

**Create — `website/src/components/arena/`:**
- `ArenaIsland.tsx` — React root: token fetch, Socket.io connection, scene state machine
- `scenes/LobbyScene.tsx` — waiting room: player roster, character picker, countdown
- `scenes/MatchScene.tsx` — game: Pixi canvas + HUD overlay + forfeit button
- `scenes/ResultsScene.tsx` — results table, rematch vote, "back to portal" link
- `game/diff.ts` — `applyDiff(state, ops)` — terse op interpreter (matches buildDiff in tick.ts)
- `game/mapData.ts` — client-side copy of CONCRETE_ARENA wall AABBs (mirrors arena-server/src/game/map.ts)
- `game/Renderer.ts` — Pixi Application: background layer, player sprites, items, zone ring, drawFrame()
- `hud/Hud.tsx` — HP pips, ammo counter, active powerup icons, zone warning, ping display
- `hud/KillFeed.tsx` — last-5 kill events with 4-second auto-fade

**Modify — arena-server:**
- `arena-server/src/proto/messages.ts` — add `lobby:character` to ClientMsg union
- `arena-server/src/lobby/lifecycle.ts` — add `setCharacter(code, playerKey, characterId)` method
- `arena-server/src/ws/handlers.ts` — add `lobby:character` case

**Modify — website:**
- `website/package.json` — add react, react-dom, @astrojs/react, pixi.js, socket.io-client
- `website/astro.config.mjs` — add `react()` integration
- `website/src/pages/portal/arena.astro` — mount `<ArenaIsland client:load />`
- `website/src/pages/admin/arena.astro` — populate recent matches table via safe DOM methods
- `website/src/pages/api/arena/matches.ts` — new: proxy GET /match from arena-server

**Copy:**
- `website/public/arena/` ← `Kore Design System latest/assets/arena/` (5 character PNGs)

**Create — tests:**
- `tests/e2e/specs/fa-38-arena-game-client.spec.ts` — Playwright: lobby loads, match starts with 3 bots, results screen shown
- `tests/local/FA-39.sh` — shell: arena schema + auth smoke (forfeit DB preconditions)

**Update:**
- `website/src/data/test-inventory.json` — regenerate via `task test:inventory`

---

## Diff Op Reference (read before writing diff.ts or the renderer)

`buildDiff()` in `arena-server/src/game/tick.ts` emits these path keys:

| `p` value               | What it updates                              |
|-------------------------|----------------------------------------------|
| `tick`                  | `state.tick`                                 |
| `alive`                 | `state.aliveCount`                           |
| `z.r`                   | `state.zone.radius`                          |
| `z.s`                   | `state.zone.shrinking`                       |
| `p.${k}`                | `state.players[k]` ← full PlayerState object |
| `p.${k}.x`              | `state.players[k].x`                         |
| `p.${k}.y`              | `state.players[k].y`                         |
| `p.${k}.f`              | `state.players[k].facing`                    |
| `p.${k}.hp`             | `state.players[k].hp`                        |
| `p.${k}.ar`             | `state.players[k].armor`                     |
| `p.${k}.alive`          | `state.players[k].alive`                     |
| `p.${k}.dodge`          | `state.players[k].dodging`                   |
| `p.${k}.wammo`          | `state.players[k].weapon.ammo`               |
| `p.${k}.wrl`            | `state.players[k].weapon.reloading`          |
| `p.${k}.wid`            | `state.players[k].weapon.id`                 |
| `p.${k}.pw`             | `state.players[k].activePowerups`            |
| `item+.${id}`           | push `v` (GroundItem) onto `state.items`     |
| `item-.${id}`           | remove from `state.items` where item.id===id |
| `pu+.${id}`             | push `v` (GroundPowerup) onto `state.powerups` |
| `pu-.${id}`             | remove from `state.powerups` where pu.id===id |
| `door.${doorId}.locked` | `state.doors.find(d=>d.id===doorId).locked`  |

Character IDs used on the server → sprite filename mapping:

| characterId          | PNG file                    |
|----------------------|-----------------------------|
| `blonde-guy`         | warrior-stand-00.png        |
| `brown-guy`          | tank-stand-00.png           |
| `long-red-girl`      | rogue-stand-00.png          |
| `blonde-long-girl`   | mage-stand-00.png           |
| anything else        | zombie-stand-00.png         |

Valid `characterId` values players may choose: `blonde-guy`, `brown-guy`, `long-red-girl`, `blonde-long-girl`.

---

## Task 1: Dependencies + Astro React integration

**Files:**
- Modify: `website/package.json`
- Modify: `website/astro.config.mjs`

- [ ] **Step 1: Install packages**

```bash
cd website
pnpm add react@18 react-dom@18 @types/react@18 @types/react-dom@18 @astrojs/react pixi.js@8 socket.io-client
```

Expected: No errors. `pnpm list pixi.js` shows version `^8.x`.

- [ ] **Step 2: Update `website/astro.config.mjs`**

Add the react import and integration:

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte(), react()],
  vite: { plugins: [tailwindcss()] },
  server: { host: true, port: 4321 },
  i18n: { defaultLocale: 'de', locales: ['de'] },
  security: { checkOrigin: false },
});
```

- [ ] **Step 3: Verify build**

```bash
cd website && npx astro build 2>&1 | tail -10
```

Expected: `✓ Completed in` — no error about React or Pixi.

- [ ] **Step 4: Commit**

```bash
git add website/package.json website/pnpm-lock.yaml website/astro.config.mjs
git commit -m "feat(arena): add React 18 + Pixi.js v8 + socket.io-client to website (Plan 2b Task 1)"
```

---

## Task 2: Copy character sprites

**Files:**
- Create: `website/public/arena/` (directory + 5 PNGs)

- [ ] **Step 1: Copy the 5 character PNGs**

```bash
mkdir -p website/public/arena
cp "Kore Design System latest/assets/arena/warrior-stand-00.png"  website/public/arena/
cp "Kore Design System latest/assets/arena/tank-stand-00.png"     website/public/arena/
cp "Kore Design System latest/assets/arena/rogue-stand-00.png"    website/public/arena/
cp "Kore Design System latest/assets/arena/mage-stand-00.png"     website/public/arena/
cp "Kore Design System latest/assets/arena/zombie-stand-00.png"   website/public/arena/
ls website/public/arena/
```

Expected: 5 PNG files listed.

- [ ] **Step 2: Commit**

```bash
git add website/public/arena/
git commit -m "feat(arena): copy character sprite PNGs to website public (Plan 2b Task 2)"
```

---

## Task 3: diff.ts — diff applier (TDD)

**Files:**
- Create: `website/src/components/arena/game/diff.ts`
- Create: `website/src/components/arena/game/diff.test.ts`

- [ ] **Step 1: Write the failing test at `website/src/components/arena/game/diff.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { MatchState, PlayerState } from '../shared/lobbyTypes';
import { applyDiff } from './diff';

function baseState(): MatchState {
  return {
    matchId: 'test', tick: 0, phase: 'in-match', startedAt: 0,
    players: {}, items: [], powerups: [],
    zone: { cx: 480, cy: 270, radius: 300, shrinking: false, nextDamageMs: 3000 },
    doors: [{ id: 'north', locked: true }],
    itemSpawnRemainingMs: 60_000, powerupSpawnRemainingMs: 90_000,
    aliveCount: 4, everAliveCount: 4, nextItemId: 0, eliminationOrder: [],
  };
}

function basePlayer(): PlayerState {
  return {
    key: 'alice@mentolder', displayName: 'Alice', brand: 'mentolder',
    characterId: 'blonde-guy', isBot: false,
    x: 100, y: 200, facing: 0, hp: 2, armor: 0, alive: true, forfeit: false,
    dodging: false, dodgeCooldownRemainingMs: 0, spawnInvulnRemainingMs: 0,
    meleeCooldownRemainingMs: 0,
    weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
    activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
  };
}

describe('applyDiff', () => {
  it('updates tick and aliveCount', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'tick', v: 5 }, { p: 'alive', v: 3 }]);
    expect(s.tick).toBe(5);
    expect(s.aliveCount).toBe(3);
  });

  it('updates zone radius and shrinking flag', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'z.r', v: 250 }, { p: 'z.s', v: true }]);
    expect(s.zone.radius).toBe(250);
    expect(s.zone.shrinking).toBe(true);
  });

  it('adds a new player from full PlayerState op', () => {
    const s = baseState();
    const p = basePlayer();
    applyDiff(s, [{ p: `p.${p.key}`, v: p }]);
    expect(s.players[p.key]).toBeDefined();
    expect(s.players[p.key].x).toBe(100);
  });

  it('updates individual player fields', () => {
    const s = baseState();
    s.players['alice@mentolder'] = basePlayer();
    applyDiff(s, [
      { p: 'p.alice@mentolder.x', v: 350 },
      { p: 'p.alice@mentolder.hp', v: 1 },
      { p: 'p.alice@mentolder.alive', v: false },
      { p: 'p.alice@mentolder.wammo', v: 8 },
      { p: 'p.alice@mentolder.wrl', v: true },
      { p: 'p.alice@mentolder.wid', v: 'deagle' },
      { p: 'p.alice@mentolder.f', v: 1.57 },
      { p: 'p.alice@mentolder.ar', v: 1 },
      { p: 'p.alice@mentolder.dodge', v: true },
    ]);
    const pl = s.players['alice@mentolder'];
    expect(pl.x).toBe(350);
    expect(pl.hp).toBe(1);
    expect(pl.alive).toBe(false);
    expect(pl.weapon.ammo).toBe(8);
    expect(pl.weapon.reloading).toBe(true);
    expect(pl.weapon.id).toBe('deagle');
    expect(pl.facing).toBeCloseTo(1.57);
    expect(pl.armor).toBe(1);
    expect(pl.dodging).toBe(true);
  });

  it('adds and removes items', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'item+.i1', v: { id: 'i1', kind: 'health-pack', x: 100, y: 200 } }]);
    expect(s.items).toHaveLength(1);
    applyDiff(s, [{ p: 'item-.i1', v: null }]);
    expect(s.items).toHaveLength(0);
  });

  it('adds and removes powerups', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'pu+.pu1', v: { id: 'pu1', kind: 'shield', x: 300, y: 400 } }]);
    expect(s.powerups).toHaveLength(1);
    applyDiff(s, [{ p: 'pu-.pu1', v: null }]);
    expect(s.powerups).toHaveLength(0);
  });

  it('updates door locked state', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'door.north.locked', v: false }]);
    expect(s.doors.find(d => d.id === 'north')!.locked).toBe(false);
  });

  it('updates activePowerups array', () => {
    const s = baseState();
    s.players['alice@mentolder'] = basePlayer();
    const pws = [{ kind: 'shield', expiresAtTick: 100 }];
    applyDiff(s, [{ p: 'p.alice@mentolder.pw', v: pws }]);
    expect(s.players['alice@mentolder'].activePowerups).toEqual(pws);
  });

  it('ignores unknown op paths (no throw)', () => {
    const s = baseState();
    expect(() => applyDiff(s, [{ p: 'unknown.field', v: 99 }])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd website && npx vitest run src/components/arena/game/diff.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './diff'`.

- [ ] **Step 3: Create `website/src/components/arena/game/diff.ts`**

```ts
import type { MatchState, DiffOp } from '../shared/lobbyTypes';

export function applyDiff(state: MatchState, ops: DiffOp[]): void {
  for (const { p, v } of ops) {
    if (p === 'tick')  { state.tick = v as number; continue; }
    if (p === 'alive') { state.aliveCount = v as number; continue; }
    if (p === 'z.r')   { state.zone.radius = v as number; continue; }
    if (p === 'z.s')   { state.zone.shrinking = v as boolean; continue; }

    if (p.startsWith('item+.')) {
      state.items.push(v as any); continue;
    }
    if (p.startsWith('item-.')) {
      const id = p.slice(6);
      state.items = state.items.filter(i => i.id !== id); continue;
    }
    if (p.startsWith('pu+.')) {
      state.powerups.push(v as any); continue;
    }
    if (p.startsWith('pu-.')) {
      const id = p.slice(4);
      state.powerups = state.powerups.filter(i => i.id !== id); continue;
    }
    if (p.startsWith('door.')) {
      // door.${doorId}.locked
      const parts = p.split('.');
      const doorId = parts[1];
      const field = parts[2];
      const door = state.doors.find(d => d.id === doorId);
      if (door && field === 'locked') door.locked = v as boolean;
      continue;
    }
    if (p.startsWith('p.')) {
      // p.${playerKey} or p.${playerKey}.${field}
      // Player key may contain '@' but not end in a known field code.
      // Strategy: try to split off the last segment if it matches a known field code.
      const FIELD_CODES = new Set(['x','y','f','hp','ar','alive','dodge','wammo','wrl','wid','pw']);
      const rest = p.slice(2); // e.g. "alice@mentolder.x" or "alice@mentolder"

      let playerKey: string;
      let field: string | null = null;

      const lastDot = rest.lastIndexOf('.');
      if (lastDot >= 0 && FIELD_CODES.has(rest.slice(lastDot + 1))) {
        playerKey = rest.slice(0, lastDot);
        field = rest.slice(lastDot + 1);
      } else {
        playerKey = rest;
      }

      if (!field) {
        // Full player state replacement
        state.players[playerKey] = v as any;
        continue;
      }

      const pl = state.players[playerKey];
      if (!pl) continue;
      switch (field) {
        case 'x':     pl.x = v as number; break;
        case 'y':     pl.y = v as number; break;
        case 'f':     pl.facing = v as number; break;
        case 'hp':    pl.hp = v as number; break;
        case 'ar':    pl.armor = v as number; break;
        case 'alive': pl.alive = v as boolean; break;
        case 'dodge': pl.dodging = v as boolean; break;
        case 'wammo': pl.weapon.ammo = v as number; break;
        case 'wrl':   pl.weapon.reloading = v as boolean; break;
        case 'wid':   pl.weapon.id = v as any; break;
        case 'pw':    pl.activePowerups = v as any; break;
      }
      continue;
    }
    // Unknown op — silently ignored (forward-compatible)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd website && npx vitest run src/components/arena/game/diff.test.ts 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/arena/game/diff.ts website/src/components/arena/game/diff.test.ts
git commit -m "feat(arena): diff applier for match:diff ops (Plan 2b Task 3)"
```

---

## Task 4: mapData.ts — client-side wall geometry

**Files:**
- Create: `website/src/components/arena/game/mapData.ts`

This mirrors the wall AABBs from `arena-server/src/game/map.ts`. The client needs them to draw walls in the Pixi renderer. Keep in sync manually (CI does not guard this file).

- [ ] **Step 1: Create `website/src/components/arena/game/mapData.ts`**

```ts
export const MAP_W = 960;
export const MAP_H = 540;

export interface Aabb { x1: number; y1: number; x2: number; y2: number; }

const BORDER_WALLS: Aabb[] = [
  { x1: 0, y1: 0, x2: MAP_W, y2: 1 },
  { x1: 0, y1: MAP_H - 1, x2: MAP_W, y2: MAP_H },
  { x1: 0, y1: 0, x2: 1, y2: MAP_H },
  { x1: MAP_W - 1, y1: 0, x2: MAP_W, y2: MAP_H },
];

const WALL_SEGMENTS: Aabb[] = [
  { x1: 60, y1: 50, x2: 360, y2: 76 },
  { x1: 680, y1: 50, x2: 960, y2: 76 },
  { x1: 60, y1: 464, x2: 480, y2: 490 },
  { x1: 600, y1: 464, x2: 960, y2: 490 },
];

const COVER_WALLS: Aabb[] = [
  { x1: 230, y1: 182, x2: 370, y2: 218 },
  { x1: 750, y1: 282, x2: 890, y2: 318 },
  { x1: 415, y1: 442, x2: 585, y2: 478 },
  { x1: 100, y1: 280, x2: 200, y2: 320 },
];

export const SOLID_WALLS: Aabb[] = [...BORDER_WALLS, ...WALL_SEGMENTS, ...COVER_WALLS];

export const DOORS: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [
  { id: 'north', x1: 389, y1: 52, x2: 451, y2: 72 },
  { id: 'south', x1: 649, y1: 468, x2: 711, y2: 488 },
];
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/arena/game/mapData.ts
git commit -m "feat(arena): client-side map geometry (mirrors arena-server map.ts) (Plan 2b Task 4)"
```

---

## Task 5: Add lobby:character to arena-server

**Files:**
- Modify: `arena-server/src/proto/messages.ts`
- Modify: `arena-server/src/lobby/lifecycle.ts`
- Modify: `arena-server/src/ws/handlers.ts`

- [ ] **Step 1: Add `lobby:character` to ClientMsg in `arena-server/src/proto/messages.ts`**

Find the `ClientMsg` union type and add the new case after the `lobby:leave` line:

```ts
  | { t: 'lobby:character'; characterId: string }
```

Valid characterIds are: `blonde-guy`, `brown-guy`, `long-red-girl`, `blonde-long-girl`.

- [ ] **Step 2: Add `setCharacter()` to `arena-server/src/lobby/lifecycle.ts`**

Add this method to the `Lifecycle` class, after the `leave()` method:

```ts
setCharacter(code: string, playerKey: string, characterId: string): void {
  const VALID = new Set(['blonde-guy', 'brown-guy', 'long-red-girl', 'blonde-long-girl']);
  if (!VALID.has(characterId)) return;
  const lobby = getLobby(code);
  if (!lobby || lobby.phase !== 'open') return;
  const slot = lobby.players.get(playerKey);
  if (!slot || slot.isBot) return;
  slot.characterId = characterId;
  this.deps.onBroadcast(code);
}
```

- [ ] **Step 3: Add handler in `arena-server/src/ws/handlers.ts`**

Inside the switch statement in `attachHandlers`, add after the `lobby:leave` case:

```ts
        case 'lobby:character':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.setCharacter(room.slice(6), key, m.characterId);
          }
          break;
```

- [ ] **Step 4: Build to verify**

```bash
cd arena-server && pnpm build 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add arena-server/src/proto/messages.ts arena-server/src/lobby/lifecycle.ts arena-server/src/ws/handlers.ts
git commit -m "feat(arena): add lobby:character message for character picker (Plan 2b Task 5)"
```

---

## Task 6: LobbyScene.tsx

**Files:**
- Create: `website/src/components/arena/scenes/LobbyScene.tsx`

- [ ] **Step 1: Create `website/src/components/arena/scenes/LobbyScene.tsx`**

```tsx
import React, { useState } from 'react';
import type { PlayerSlot } from '../shared/lobbyTypes';

const CHARACTERS = ['blonde-guy', 'brown-guy', 'long-red-girl', 'blonde-long-girl'] as const;
type CharacterId = typeof CHARACTERS[number];

const CHAR_SPRITE: Record<CharacterId, string> = {
  'blonde-guy':       '/arena/warrior-stand-00.png',
  'brown-guy':        '/arena/tank-stand-00.png',
  'long-red-girl':    '/arena/rogue-stand-00.png',
  'blonde-long-girl': '/arena/mage-stand-00.png',
};

interface Props {
  code: string;
  players: PlayerSlot[];
  phase: 'open' | 'starting';
  countdownMs: number;
  myKey: string;
  onCharacter: (characterId: CharacterId) => void;
  onLeave: () => void;
}

export function LobbyScene({ code, players, phase, countdownMs, myKey, onCharacter, onLeave }: Props) {
  const [charIdx, setCharIdx] = useState(0);

  function cycleChar(delta: 1 | -1) {
    const next = (charIdx + delta + CHARACTERS.length) % CHARACTERS.length;
    setCharIdx(next);
    onCharacter(CHARACTERS[next]);
  }

  const countdownSec = Math.ceil(countdownMs / 1000);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, letterSpacing: '.18em', color: '#C8F76A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 22, height: 1, background: 'currentColor', display: 'inline-block' }} />
          Arena &middot; Lobby {code}
        </div>
        {phase === 'starting' ? (
          <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 36, margin: '12px 0 0', color: '#C8F76A' }}>
            Starting in {countdownSec}s&hellip;
          </h2>
        ) : (
          <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 36, margin: '12px 0 0' }}>
            Waiting for players &mdash; <em style={{ color: '#C8F76A' }}>{players.filter(p => !p.isBot).length} / 4</em>
          </h2>
        )}
      </div>

      {/* Character picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '16px 20px', border: '1px solid rgba(255,255,255,.08)' }}>
        <button onClick={() => cycleChar(-1)} style={arrowBtn} aria-label="Previous character">&lsaquo;</button>
        <img
          src={CHAR_SPRITE[CHARACTERS[charIdx]]}
          alt={CHARACTERS[charIdx]}
          width={64}
          height={64}
          style={{ imageRendering: 'pixelated' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>Character</div>
          <div style={{ fontFamily: 'inherit', fontSize: 15, marginTop: 4 }}>{CHARACTERS[charIdx].replace(/-/g, ' ')}</div>
        </div>
        <button onClick={() => cycleChar(1)} style={arrowBtn} aria-label="Next character">&rsaquo;</button>
      </div>

      {/* Player roster */}
      <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden' }}>
        {players.map((p, i) => (
          <div key={p.key} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
            padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)',
            background: p.key === myKey ? 'rgba(200,247,106,.04)' : 'transparent',
          }}>
            <img
              src={CHAR_SPRITE[p.characterId as CharacterId] ?? '/arena/zombie-stand-00.png'}
              alt=""
              width={36}
              height={36}
              style={{ imageRendering: 'pixelated', borderRadius: 4 }}
            />
            <div>
              <div style={{ fontSize: 14 }}>
                {p.displayName}
                {p.key === myKey && <span style={{ color: '#C8F76A', fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', marginLeft: 8 }}>YOU</span>}
              </div>
              <div style={{ fontSize: 11, color: '#8A8497', textTransform: 'uppercase', letterSpacing: '.1em' }}>{p.isBot ? 'Bot' : p.brand ?? ''}</div>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: p.isBot ? '#3A2E52' : '#C8F76A' }} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
          <div key={`empty-${i}`} style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.06)', color: '#3A2E52', fontSize: 13 }}>
            &mdash; waiting&hellip;
          </div>
        ))}
      </div>

      <button
        onClick={onLeave}
        style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: '#8A8497', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
      >
        Leave lobby
      </button>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: '#C8F76A',
  width: 36, height: 36, borderRadius: 6, cursor: 'pointer', fontSize: 20, lineHeight: 1,
};
```

- [ ] **Step 2: Build check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -i "arena/scenes" | head -10
```

Expected: no errors in arena/scenes files.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/scenes/LobbyScene.tsx
git commit -m "feat(arena): LobbyScene — player roster + character picker (Plan 2b Task 6)"
```

---

## Task 7: Renderer.ts — Pixi game renderer

**Files:**
- Create: `website/src/components/arena/game/Renderer.ts`

The renderer wraps a Pixi.js v8 Application. It draws the static map background once, then updates dynamic elements (players, items, powerups, zone ring) via `drawFrame(state, myKey)` called from the Pixi ticker at 60 fps.

- [ ] **Step 1: Create `website/src/components/arena/game/Renderer.ts`**

```ts
import { Application, Graphics, Sprite, Texture, Assets, Container, Text } from 'pixi.js';
import type { MatchState, PlayerState } from '../shared/lobbyTypes';
import { SOLID_WALLS, DOORS, MAP_W, MAP_H } from './mapData';

const KORE = {
  floor:       0x120d1c,
  wall:        0x1a1326,
  cover:       0x2d2240,
  lime:        0xc8f76a,
  blood:       0xd33a2c,
  teal:        0x5bd4d0,
  door_locked: 0x3a2e52,
  door_open:   0x4a5a1a,
};

const CHAR_SPRITE: Record<string, string> = {
  'blonde-guy':       '/arena/warrior-stand-00.png',
  'brown-guy':        '/arena/tank-stand-00.png',
  'long-red-girl':    '/arena/rogue-stand-00.png',
  'blonde-long-girl': '/arena/mage-stand-00.png',
};

const ITEM_COLORS: Record<string, number> = {
  'health-pack':  0xd33a2c,
  'med-syringe':  0xd33a2c,
  'armor-plate':  0x5bd4d0,
  'ammo-box':     0xc8a857,
  'keycard':      0xc8f76a,
  'respect-coin': 0xd8ff8a,
};

const POWERUP_COLORS: Record<string, number> = {
  shield: 0x5bd4d0, speed: 0xc8f76a, damage: 0xd33a2c,
  emp: 0xe0d060, cloak: 0x8a8497,
};

interface PlayerSprite {
  container: Container;
  body: Sprite | Graphics;
  hpBar: Graphics;
  nameTag: Text;
}

export class Renderer {
  private app: Application;
  private backgroundG = new Graphics();
  private dynamicLayer = new Container();
  private zoneG = new Graphics();
  private playerSprites = new Map<string, PlayerSprite>();
  private itemSprites = new Map<string, Graphics>();
  private powerupSprites = new Map<string, Graphics>();
  private textures = new Map<string, Texture>();
  private ready = false;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new Application();
    this.app.init({
      canvas,
      width: MAP_W,
      height: MAP_H,
      backgroundColor: KORE.floor,
      antialias: false,
    }).then(() => this.initScene());
  }

  private initScene() {
    this.drawBackground();
    this.app.stage.addChild(this.backgroundG, this.dynamicLayer);
    this.dynamicLayer.addChild(this.zoneG);
    this.ready = true;
  }

  private drawBackground() {
    const g = this.backgroundG;
    g.setStrokeStyle({ width: 1, color: 0x1d1230, alpha: 0.5 });
    for (let x = 0; x < MAP_W; x += 32) g.moveTo(x, 0).lineTo(x, MAP_H);
    for (let y = 0; y < MAP_H; y += 32) g.moveTo(0, y).lineTo(MAP_W, y);
    g.stroke();

    g.setFillStyle({ color: KORE.wall });
    for (const w of SOLID_WALLS) g.rect(w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1).fill();

    g.setStrokeStyle({ width: 1, color: KORE.lime, alpha: 0.25 });
    for (const w of SOLID_WALLS) g.rect(w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1).stroke();
  }

  private drawDoors(state: MatchState) {
    for (const doorDef of DOORS) {
      const locked = state.doors.find(d => d.id === doorDef.id)?.locked ?? true;
      const color = locked ? KORE.door_locked : KORE.door_open;
      const w = doorDef.x2 - doorDef.x1;
      const h = doorDef.y2 - doorDef.y1;
      this.backgroundG.setFillStyle({ color });
      this.backgroundG.rect(doorDef.x1, doorDef.y1, w, h).fill();
      if (!locked) {
        this.backgroundG.setStrokeStyle({ width: 1, color: KORE.lime });
        this.backgroundG.rect(doorDef.x1, doorDef.y1, w, h).stroke();
      }
    }
  }

  private drawZone(state: MatchState) {
    this.zoneG.clear();
    const { cx, cy, radius, shrinking } = state.zone;
    const zoneColor = shrinking ? 0xff3344 : 0x4466ff;
    // Dim overlay: fill whole canvas semi-transparent, cut out zone circle
    this.zoneG.setFillStyle({ color: 0x000000, alpha: 0.35 });
    this.zoneG.rect(0, 0, MAP_W, MAP_H).fill();
    // Zone boundary ring
    this.zoneG.setStrokeStyle({ width: shrinking ? 3 : 2, color: zoneColor, alpha: 0.85 });
    this.zoneG.circle(cx, cy, radius).stroke();
  }

  private getOrCreatePlayerSprite(key: string, player: PlayerState): PlayerSprite {
    const existing = this.playerSprites.get(key);
    if (existing) return existing;

    const container = new Container();
    const spritePath = CHAR_SPRITE[player.characterId] ?? '/arena/zombie-stand-00.png';

    // Fallback graphics circle while async texture loads
    const fallback = new Graphics();
    fallback.setFillStyle({ color: player.isBot ? KORE.teal : KORE.lime });
    fallback.circle(0, 0, 12).fill();

    const hpBar = new Graphics();
    const nameTag = new Text({
      text: player.displayName.split('@')[0].slice(0, 12),
      style: { fontSize: 9, fill: 0xeceff3, fontFamily: 'monospace' },
    });
    nameTag.anchor.set(0.5, 1);
    nameTag.y = -18;

    container.addChild(fallback, hpBar, nameTag);
    this.dynamicLayer.addChild(container);

    const ps: PlayerSprite = { container, body: fallback, hpBar, nameTag };
    this.playerSprites.set(key, ps);

    // Load texture and swap body sprite
    const cached = this.textures.get(spritePath);
    if (cached) {
      this.swapSprite(ps, cached, fallback, container);
    } else {
      Assets.load(spritePath).then((t: Texture) => {
        this.textures.set(spritePath, t);
        this.swapSprite(ps, t, ps.body, container);
      }).catch(() => {/* keep fallback */});
    }

    return ps;
  }

  private swapSprite(ps: PlayerSprite, tex: Texture, old: Sprite | Graphics, container: Container) {
    const spr = new Sprite(tex);
    spr.anchor.set(0.5);
    spr.width = 32;
    spr.height = 32;
    container.removeChild(old);
    container.addChildAt(spr, 0);
    ps.body = spr;
  }

  private updatePlayerSprite(ps: PlayerSprite, player: PlayerState, isMe: boolean) {
    ps.container.x = player.x;
    ps.container.y = player.y;
    ps.container.rotation = player.facing;

    const hasCloakEnemy = !isMe && player.activePowerups.some(a => a.kind === 'cloak');
    ps.container.alpha = !player.alive ? 0.15 : hasCloakEnemy ? 0.12 : player.dodging ? 0.5 : 1;

    ps.hpBar.clear();
    for (let i = 0; i < 2; i++) {
      ps.hpBar.setFillStyle({ color: i < player.hp ? KORE.blood : 0x3a2e52 });
      ps.hpBar.rect(-8 + i * 10, -28, 8, 4).fill();
    }
    if (player.armor > 0) {
      ps.hpBar.setFillStyle({ color: KORE.teal });
      ps.hpBar.rect(-4, -34, 8, 3).fill();
    }
    if (isMe) {
      ps.hpBar.setStrokeStyle({ width: 1, color: KORE.lime, alpha: 0.6 });
      ps.hpBar.circle(0, 0, 16).stroke();
    }
  }

  private syncItems(state: MatchState) {
    const currentIds = new Set(state.items.map(i => i.id));
    for (const [id, g] of this.itemSprites) {
      if (!currentIds.has(id)) { this.dynamicLayer.removeChild(g); this.itemSprites.delete(id); }
    }
    for (const item of state.items) {
      if (!this.itemSprites.has(item.id)) {
        const g = new Graphics();
        g.setFillStyle({ color: ITEM_COLORS[item.kind] ?? 0xffffff }).circle(0, 0, 8).fill();
        g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.4 }).circle(0, 0, 8).stroke();
        g.x = item.x; g.y = item.y;
        this.dynamicLayer.addChild(g);
        this.itemSprites.set(item.id, g);
      }
    }
  }

  private syncPowerups(state: MatchState) {
    const currentIds = new Set(state.powerups.map(p => p.id));
    for (const [id, g] of this.powerupSprites) {
      if (!currentIds.has(id)) { this.dynamicLayer.removeChild(g); this.powerupSprites.delete(id); }
    }
    for (const pu of state.powerups) {
      if (!this.powerupSprites.has(pu.id)) {
        const g = new Graphics();
        const color = POWERUP_COLORS[pu.kind] ?? 0xffffff;
        g.setFillStyle({ color, alpha: 0.8 }).circle(0, 0, 12).fill();
        g.setStrokeStyle({ width: 2, color }).circle(0, 0, 12).stroke();
        g.x = pu.x; g.y = pu.y;
        this.dynamicLayer.addChild(g);
        this.powerupSprites.set(pu.id, g);
      }
    }
  }

  drawFrame(state: MatchState, myKey: string) {
    if (!this.ready) return;
    this.drawDoors(state);
    this.drawZone(state);
    this.syncItems(state);
    this.syncPowerups(state);

    const visibleKeys = new Set(Object.keys(state.players));
    for (const [key, ps] of this.playerSprites) {
      if (!visibleKeys.has(key)) { this.dynamicLayer.removeChild(ps.container); this.playerSprites.delete(key); }
    }
    for (const [key, player] of Object.entries(state.players)) {
      const ps = this.getOrCreatePlayerSprite(key, player);
      this.updatePlayerSprite(ps, player, key === myKey);
    }
  }

  startTicker(getState: () => MatchState | null, myKey: string) {
    this.app.ticker.add(() => {
      const s = getState();
      if (s) this.drawFrame(s, myKey);
    });
  }

  destroy() {
    this.app.destroy(false, { children: true });
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -i "Renderer\|arena/game" | head -10
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/game/Renderer.ts
git commit -m "feat(arena): Pixi.js Renderer — floor/walls/zone/players/items (Plan 2b Task 7)"
```

---

## Task 8: HUD components

**Files:**
- Create: `website/src/components/arena/hud/KillFeed.tsx`
- Create: `website/src/components/arena/hud/Hud.tsx`

- [ ] **Step 1: Create `website/src/components/arena/hud/KillFeed.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../shared/lobbyTypes';

interface KillEntry { id: number; text: string; at: number; }

export function KillFeed({ events }: { events: GameEvent[] }) {
  const [entries, setEntries] = useState<KillEntry[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const newEntries = events.flatMap<KillEntry>(e => {
      if (e.e === 'kill') return [{ id: counterRef.current++, text: `${e.killer.split('@')[0]} x ${e.victim.split('@')[0]} [${e.weapon}]`, at: Date.now() }];
      if (e.e === 'kill-zone') return [{ id: counterRef.current++, text: `${e.victim.split('@')[0]} x [zone]`, at: Date.now() }];
      return [];
    });
    if (newEntries.length === 0) return;
    setEntries(prev => [...prev, ...newEntries].slice(-5));
  }, [events]);

  useEffect(() => {
    const id = setInterval(() => {
      setEntries(prev => prev.filter(e => Date.now() - e.at < 4_000));
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', pointerEvents: 'none' }}>
      {entries.map(e => (
        <div key={e.id} style={{ fontFamily: 'monospace', fontSize: 11, color: '#eceff3', background: 'rgba(18,13,28,.75)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,.06)' }}>
          {e.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `website/src/components/arena/hud/Hud.tsx`**

```tsx
import React from 'react';
import type { MatchState, GameEvent } from '../shared/lobbyTypes';
import { KillFeed } from './KillFeed';

const POWERUP_LABELS: Record<string, string> = {
  shield: 'SHIELD', speed: 'SPEED', damage: 'DMGx2', emp: 'EMP', cloak: 'CLOAK',
};

interface Props {
  state: MatchState;
  myKey: string;
  events: GameEvent[];
  ping: number;
  onForfeit: () => void;
}

export function Hud({ state, myKey, events, ping, onForfeit }: Props) {
  const me = state.players[myKey];
  if (!me) return null;

  const { cx, cy, radius } = state.zone;
  const dx = me.x - cx, dy = me.y - cy;
  const isOutsideZone = Math.sqrt(dx * dx + dy * dy) > radius;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Top-left: alive count + ping */}
      <div style={{ position: 'absolute', top: 12, left: 12, fontFamily: 'monospace', fontSize: 11, color: '#8A8497' }}>
        <span style={{ color: '#C8F76A', fontSize: 14, fontWeight: 600 }}>{state.aliveCount}</span>
        <span style={{ marginLeft: 4 }}>alive</span>
        <span style={{ marginLeft: 16, opacity: 0.5 }}>{ping}ms</span>
      </div>

      {/* Bottom-left: HP + ammo + powerups */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>HP</span>
          {[0, 1].map(i => (
            <div key={i} style={{ width: 18, height: 18, borderRadius: 3, border: '2px solid #D33A2C', background: i < me.hp ? '#D33A2C' : 'transparent' }} />
          ))}
          {me.armor > 0 && (
            <div style={{ width: 18, height: 14, borderRadius: 3, border: '2px solid #5BD4D0', background: 'rgba(91,212,208,.1)', fontSize: 9, color: '#5BD4D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
              A
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>{me.weapon.id}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 18, color: me.weapon.reloading ? '#8A8497' : '#ECEFF3' }}>
            {me.weapon.reloading ? 'RELOADING' : String(me.weapon.ammo)}
          </span>
        </div>

        {me.activePowerups.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {me.activePowerups.map((ap, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 9, padding: '2px 6px', border: '1px solid rgba(200,247,106,.4)', color: '#C8F76A', borderRadius: 4, background: 'rgba(200,247,106,.08)' }}>
                {POWERUP_LABELS[ap.kind] ?? ap.kind}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone warning */}
      {isOutsideZone && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'monospace', fontSize: 13, color: '#ff3344', letterSpacing: '.14em', textTransform: 'uppercase', background: 'rgba(0,0,0,.6)', padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,51,68,.4)', pointerEvents: 'none' }}>
          Outside zone
        </div>
      )}

      {/* Kill feed */}
      <KillFeed events={events} />

      {/* Forfeit */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, pointerEvents: 'auto' }}>
        <button
          onClick={onForfeit}
          style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.12em', color: '#8A8497', background: 'transparent', border: '1px solid rgba(255,255,255,.12)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', textTransform: 'uppercase' }}
        >
          Forfeit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "arena/hud" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/arena/hud/
git commit -m "feat(arena): HUD overlay — HP pips, ammo, kill feed, zone warning (Plan 2b Task 8)"
```

---

## Task 9: MatchScene.tsx

**Files:**
- Create: `website/src/components/arena/scenes/MatchScene.tsx`

MatchScene owns the Pixi canvas, applies incoming diffs, and renders the Hud overlay.

- [ ] **Step 1: Create `website/src/components/arena/scenes/MatchScene.tsx`**

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { MatchState, ServerMsg, GameEvent, DiffOp } from '../shared/lobbyTypes';
import { applyDiff } from '../game/diff';
import { Renderer } from '../game/Renderer';
import { Hud } from '../hud/Hud';

interface Props {
  socket: Socket;
  initialState: MatchState;
  myKey: string;
}

export function MatchScene({ socket, initialState, myKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const stateRef = useRef<MatchState>(structuredClone(initialState));
  const [hudState, setHudState] = useState<MatchState>(initialState);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ping, setPing] = useState(0);
  const lastTickAt = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    renderer.startTicker(() => stateRef.current, myKey);
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, [myKey]);

  useEffect(() => {
    const id = setInterval(() => {
      setPing(Math.max(0, Date.now() - lastTickAt.current - 33));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onMsg(m: ServerMsg) {
      if (m.t === 'match:full-snapshot') {
        stateRef.current = m.state as MatchState;
        setHudState(m.state as MatchState);
        lastTickAt.current = Date.now();
      }
      if (m.t === 'match:diff') {
        applyDiff(stateRef.current, m.ops as DiffOp[]);
        lastTickAt.current = Date.now();
        if (stateRef.current.tick % 5 === 0) setHudState({ ...stateRef.current });
      }
      if (m.t === 'match:event') {
        setEvents(prev => [...prev, ...(m.events as GameEvent[])]);
      }
    }
    socket.on('msg', onMsg);
    return () => { socket.off('msg', onMsg); };
  }, [socket]);

  const handleForfeit = useCallback(() => {
    socket.emit('msg', { t: 'forfeit' });
  }, [socket]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 960, margin: '0 auto', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', aspectRatio: '960/540', background: '#120d1c' }}
      />
      <Hud state={hudState} myKey={myKey} events={events} ping={ping} onForfeit={handleForfeit} />
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "MatchScene" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/scenes/MatchScene.tsx
git commit -m "feat(arena): MatchScene — Pixi canvas + HUD + socket event routing (Plan 2b Task 9)"
```

---

## Task 10: ResultsScene.tsx

**Files:**
- Create: `website/src/components/arena/scenes/ResultsScene.tsx`

- [ ] **Step 1: Create `website/src/components/arena/scenes/ResultsScene.tsx`**

```tsx
import React from 'react';
import type { MatchResult } from '../shared/lobbyTypes';

interface Props {
  results: MatchResult[];
  matchId: string;
  onRematch: () => void;
  onBack: () => void;
}

export function ResultsScene({ results, matchId, onRematch, onBack }: Props) {
  const sorted = [...results].sort((a, b) => a.place - b.place);
  const winner = sorted[0];

  return (
    <div style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.18em', color: '#C8F76A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 22, height: 1, background: 'currentColor', display: 'inline-block' }} />
        Match over &middot; {matchId.slice(-8)}
      </div>

      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 40, margin: '0 0 24px' }}>
        <em style={{ color: '#C8F76A' }}>{winner?.displayName.split('@')[0] ?? '?'}</em> wins.
      </h2>

      <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 56px 56px 80px', gap: 12, padding: '10px 16px', fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span>#</span><span>Player</span><span>K</span><span>D</span><span>Status</span>
        </div>
        {sorted.map((r, i) => (
          <div key={r.playerKey} style={{
            display: 'grid', gridTemplateColumns: '36px 1fr 56px 56px 80px', gap: 12,
            padding: '12px 16px', alignItems: 'center',
            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.04)',
            background: i === 0 ? 'rgba(200,247,106,.04)' : 'transparent',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 16, color: i === 0 ? '#C8F76A' : '#8A8497' }}>{r.place}</span>
            <div>
              <span style={{ fontSize: 14 }}>{r.displayName.split('@')[0]}</span>
              {r.isBot && <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#5BD4D0', marginLeft: 8 }}>BOT</span>}
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{r.kills}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#8A8497' }}>{r.deaths}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: r.forfeit ? '#D33A2C' : '#8A8497', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              {r.forfeit ? 'Forfeit' : String.fromCharCode(8212)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onRematch} style={{ padding: '10px 22px', background: '#C8F76A', color: '#1a0e22', border: 'none', fontWeight: 600, cursor: 'pointer', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}>
          Rematch vote
        </button>
        <button onClick={onBack} style={{ padding: '10px 22px', background: 'transparent', color: '#8A8497', border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}>
          Back to portal
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/arena/scenes/ResultsScene.tsx
git commit -m "feat(arena): ResultsScene — place table, rematch + back buttons (Plan 2b Task 10)"
```

---

## Task 11: ArenaIsland.tsx — root component

**Files:**
- Create: `website/src/components/arena/ArenaIsland.tsx`

ArenaIsland fetches an arena-scoped JWT, opens a Socket.io connection, and routes between the three scenes based on server-driven phase.

- [ ] **Step 1: Create `website/src/components/arena/ArenaIsland.tsx`**

```tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ServerMsg, PlayerSlot, MatchState, MatchResult } from './shared/lobbyTypes';
import { PROTOCOL_VERSION } from './shared/lobbyTypes';
import { LobbyScene } from './scenes/LobbyScene';
import { MatchScene } from './scenes/MatchScene';
import { ResultsScene } from './scenes/ResultsScene';

type Scene = 'loading' | 'lobby' | 'match' | 'results' | 'error';

interface Props {
  wsUrl: string;
  lobbyCode: string;
  myKey: string;
}

export function ArenaIsland({ wsUrl, lobbyCode, myKey }: Props) {
  const [scene, setScene] = useState<Scene>('loading');
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerSlot[]>([]);
  const [lobbyPhase, setLobbyPhase] = useState<'open' | 'starting'>('open');
  const [countdownMs, setCountdownMs] = useState(0);
  const [initialMatchState, setInitialMatchState] = useState<MatchState | null>(null);
  const [results, setResults] = useState<{ results: MatchResult[]; matchId: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sceneRef = useRef<Scene>('loading');

  sceneRef.current = scene;

  const connect = useCallback(async () => {
    setScene('loading');
    let token: string;
    try {
      const res = await fetch('/api/arena/token', { method: 'POST' });
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      const json = await res.json() as { token: string };
      token = json.token;
    } catch (e: any) {
      setError(String(e.message ?? 'Token fetch failed'));
      setScene('error');
      return;
    }

    const socket = io(wsUrl, {
      path: '/ws',
      transports: ['websocket'],
      auth: { token, protocolVersion: PROTOCOL_VERSION },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('msg', { t: 'lobby:join', code: lobbyCode });
      setScene('lobby');
    });

    socket.on('connect_error', (err: Error) => {
      setError(String(err.message ?? 'Connection failed'));
      setScene('error');
    });

    socket.on('msg', (m: ServerMsg) => {
      switch (m.t) {
        case 'lobby:state':
          setPlayers(m.players as PlayerSlot[]);
          if (m.phase === 'starting') {
            setLobbyPhase('starting');
            setCountdownMs(m.countdownMs ?? 5000);
          } else {
            setLobbyPhase('open');
          }
          break;
        case 'match:full-snapshot':
          setInitialMatchState(m.state as MatchState);
          setScene('match');
          break;
        case 'match:end':
          setResults({ results: m.results as MatchResult[], matchId: m.matchId });
          setScene('results');
          break;
        case 'error':
          setError(m.message);
          setScene('error');
          break;
      }
    });

    socket.on('disconnect', () => {
      if (sceneRef.current !== 'results') {
        setError('Disconnected from arena server');
        setScene('error');
      }
    });
  }, [wsUrl, lobbyCode]);

  useEffect(() => {
    connect();
    return () => { socketRef.current?.disconnect(); };
  }, [connect]);

  const handleCharacter = useCallback((characterId: string) => {
    socketRef.current?.emit('msg', { t: 'lobby:character', characterId });
  }, []);

  const handleLeave = useCallback(() => {
    socketRef.current?.emit('msg', { t: 'lobby:leave' });
    window.location.href = '/portal';
  }, []);

  const handleRematch = useCallback(() => {
    socketRef.current?.emit('msg', { t: 'rematch:vote', yes: true });
  }, []);

  const handleBack = useCallback(() => {
    window.location.href = '/portal';
  }, []);

  if (scene === 'loading') {
    return (
      <div style={{ padding: 32, fontFamily: 'monospace', color: '#8A8497' }}>
        <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>Connecting to arena&hellip;</div>
      </div>
    );
  }

  if (scene === 'error') {
    return (
      <div style={{ padding: 32, fontFamily: 'monospace' }}>
        <div style={{ color: '#D33A2C', fontSize: 13 }}>{error ?? 'Unknown error'}</div>
        <button onClick={connect} style={{ marginTop: 16, padding: '8px 16px', background: '#C8F76A', color: '#1a0e22', border: 'none', cursor: 'pointer', fontWeight: 600, borderRadius: 6 }}>
          Retry
        </button>
      </div>
    );
  }

  if (scene === 'lobby') {
    return (
      <LobbyScene
        code={lobbyCode}
        players={players}
        phase={lobbyPhase}
        countdownMs={countdownMs}
        myKey={myKey}
        onCharacter={handleCharacter}
        onLeave={handleLeave}
      />
    );
  }

  if (scene === 'match' && initialMatchState && socketRef.current) {
    return (
      <MatchScene
        socket={socketRef.current}
        initialState={initialMatchState}
        myKey={myKey}
      />
    );
  }

  if (scene === 'results' && results) {
    return (
      <ResultsScene
        results={results.results}
        matchId={results.matchId}
        onRematch={handleRematch}
        onBack={handleBack}
      />
    );
  }

  return null;
}
```

- [ ] **Step 2: Build check — full website TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -i "arena" | head -20
```

Expected: no errors in arena components.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/ArenaIsland.tsx
git commit -m "feat(arena): ArenaIsland root — socket.io, token fetch, scene routing (Plan 2b Task 11)"
```

---

## Task 12: portal/arena.astro upgrade + matches API

**Files:**
- Modify: `website/src/pages/portal/arena.astro`
- Create: `website/src/pages/api/arena/matches.ts`

- [ ] **Step 1: Create `website/src/pages/api/arena/matches.ts`**

Proxies `/match` on arena-server. Returns JSON array of recent matches, or `[]` on any error.

```ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

const UPSTREAM_BASE = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

export const GET: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const tokenRes = await fetch(`${ctx.url.origin}/api/arena/token`, {
    method: 'POST',
    headers: { cookie: ctx.request.headers.get('cookie') ?? '' },
  }).catch(() => null);

  if (!tokenRes?.ok) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const { token } = await tokenRes.json() as { token: string };

  const upstream = await fetch(`${UPSTREAM_BASE}/match`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!upstream?.ok) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(await upstream.text(), { status: 200, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Rewrite `website/src/pages/portal/arena.astro`**

```astro
---
import PortalLayout from '../../layouts/PortalLayout.astro';
import { getSession } from '../../lib/auth';
import { ArenaIsland } from '../../components/arena/ArenaIsland';

const user = await getSession(Astro.request.headers.get('cookie'));
if (!user) return Astro.redirect('/auth/login?return=/portal/arena');

const lobbyCode = Astro.url.searchParams.get('lobby');
if (!lobbyCode) return Astro.redirect('/portal');

const wsUrl = import.meta.env.ARENA_WS_URL ?? 'http://arena.localhost';
const userKey = `${user.sub}@${user.brand ?? 'mentolder'}`;
---

<PortalLayout title="Arena">
  <ArenaIsland client:load wsUrl={wsUrl} lobbyCode={lobbyCode} myKey={userKey} />
</PortalLayout>

<style>
  :global(body) { background: #120d1c; color: #eceff3; }
</style>
```

- [ ] **Step 3: Build check**

```bash
cd website && npx astro build 2>&1 | tail -15
```

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/portal/arena.astro website/src/pages/api/arena/matches.ts
git commit -m "feat(arena): portal/arena.astro mounts ArenaIsland + matches proxy API (Plan 2b Task 12)"
```

---

## Task 13: admin/arena.astro — recent matches table

**Files:**
- Modify: `website/src/pages/admin/arena.astro`

The recent matches table must be populated without using unsafe DOM methods. Use `document.createElement` and `textContent`.

- [ ] **Step 1: Replace the script block in `website/src/pages/admin/arena.astro`**

Find and replace the existing `<script>` block with the following. Do **not** use `innerHTML` — use `textContent` and `createElement` for all dynamic content to prevent XSS.

```html
<script>
  const btn = document.getElementById('open-lobby') as HTMLButtonElement | null;
  const tbody = document.querySelector('#recent tbody') as HTMLElement | null;

  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    const res = await fetch('/api/arena/start', { method: 'POST' });
    if (!res.ok) { alert('failed: ' + res.status); btn.disabled = false; return; }
    const { code } = await res.json() as { code: string };
    window.location.href = `/portal/arena?lobby=${encodeURIComponent(code)}`;
  });

  async function loadMatches() {
    if (!tbody) return;
    let rows: Array<{ started_at: string; code?: string; winner_player?: string; human_count?: number; bot_count?: number }>;
    try {
      const res = await fetch('/api/arena/matches');
      rows = res.ok ? await res.json() : [];
    } catch { rows = []; }

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.setAttribute('colspan', '5');
      td.textContent = 'No matches yet.';
      tr.appendChild(td);
      tbody.replaceChildren(tr);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const m of rows.slice(0, 20)) {
      const tr = document.createElement('tr');
      const whenStr = new Date(m.started_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
      const cells = [
        whenStr,
        m.code ?? '',
        m.winner_player ? m.winner_player.split('@')[0] : '',
        String(m.human_count ?? 0),
        String(m.bot_count ?? 0),
      ];
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }
    tbody.replaceChildren(fragment);
  }

  loadMatches();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/admin/arena.astro
git commit -m "feat(arena): admin page populates recent matches safely via DOM API (Plan 2b Task 13)"
```

---

## Task 14: FA-38 Playwright E2E test — arena game client

**Files:**
- Create: `tests/e2e/specs/fa-38-arena-game-client.spec.ts`

Tests the full browser flow: admin opens a lobby, the lobby scene renders, bots fill, the match starts and completes, and the results screen appears with the winner.

- [ ] **Step 1: Create `tests/e2e/specs/fa-38-arena-game-client.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.MENTOLDER_ADMIN_USER!;
const ADMIN_PW   = process.env.MENTOLDER_ADMIN_PW!;
const MENTOLDER_HOME = 'https://web.mentolder.de/';

test.describe('FA-38 · Arena game client @smoke', () => {
  test.setTimeout(120_000);

  test('admin opens lobby → lobby scene renders → bots fill → results screen shown', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login as admin
    await page.goto(MENTOLDER_HOME + 'auth/login?return=/admin/arena');
    await page.getByLabel(/username/i).fill(ADMIN_USER);
    await page.getByLabel(/password/i).fill(ADMIN_PW);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/arena/);

    // Verify recent matches table loads (no JS errors on admin page)
    await expect(page.locator('#recent')).toBeVisible();

    // Open a lobby — button click should redirect to /portal/arena?lobby=...
    await page.getByRole('button', { name: /open lobby/i }).click();
    await page.waitForURL(/\/portal\/arena\?lobby=/, { timeout: 10_000 });

    // Lobby scene: expect the lobby code to appear in the heading
    await expect(page.locator('text=/Arena · Lobby/i')).toBeVisible({ timeout: 15_000 });

    // After 60s open window + 5s starting, the match begins. Bots fill the remaining 3 slots.
    // A bot-only match ends in a few seconds.  Wait up to 90s for the results screen.
    await expect(page.locator('text=/wins\./i')).toBeVisible({ timeout: 90_000 });

    // Results table should list 3 bots
    const botLabels = page.locator('text=BOT');
    await expect(botLabels).toHaveCount(3, { timeout: 5_000 });

    // Rematch vote button and back button must be present
    await expect(page.getByRole('button', { name: /rematch/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible();

    await ctx.close();
  });
});
```

- [ ] **Step 2: Regenerate test inventory**

```bash
task test:inventory
```

Expected: `website/src/data/test-inventory.json` updated; `FA-38` entry present.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-38-arena-game-client.spec.ts website/src/data/test-inventory.json
git commit -m "test(arena): FA-38 Playwright — game client lobby to results (Plan 2b Task 14)"
```

---

## Task 15: FA-39 shell test — arena schema + DB smoke

**Files:**
- Create: `tests/local/FA-39.sh`

Validates that arena-server is running, its healthz responds, and the arena DB schema is bootstrapped (preconditions for forfeit recording).

- [ ] **Step 1: Create `tests/local/FA-39.sh`**

```bash
#!/usr/bin/env bash
# FA-39: Arena DB schema bootstrap + service health smoke
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NAMESPACE:-workspace}"

# T1: arena-server pod is Ready
READY=$(kubectl -n "$NS" get deploy/arena-server \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "")
assert_gt "${READY:-0}" 0 "FA-39" "T1" "arena-server pod is Ready"
[ "${READY:-0}" -gt 0 ] || { echo "Skipping remaining tests — arena-server not ready"; exit 0; }

# T2: healthz responds with ok:true
HEALTH=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS http://localhost:8090/healthz 2>/dev/null || echo "{}")
assert_contains "$HEALTH" '"ok"' "FA-39" "T2" "arena-server healthz returns ok"

# T3: /match requires auth (returns 401 without bearer token)
HTTP_STATUS=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8090/match 2>/dev/null || echo "000")
assert_eq "$HTTP_STATUS" "401" "FA-39" "T3" "/match returns 401 without bearer token"

# T4: arena schema exists in shared-db
TABLE_COUNT=$(kubectl -n "$NS" exec deploy/shared-db -- \
  psql -U postgres -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='arena';" \
  2>/dev/null || echo "0")
assert_gt "${TABLE_COUNT:-0}" "0" "FA-39" "T4" "arena schema has tables in shared-db"

# T5: arena.match_players table exists (required for forfeit recording)
MP_EXISTS=$(kubectl -n "$NS" exec deploy/shared-db -- \
  psql -U postgres -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='arena' AND table_name='match_players';" \
  2>/dev/null || echo "0")
assert_eq "${MP_EXISTS:-0}" "1" "FA-39" "T5" "arena.match_players table exists"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x tests/local/FA-39.sh
```

- [ ] **Step 3: Regenerate test inventory**

```bash
task test:inventory
```

Expected: FA-39 entry added.

- [ ] **Step 4: Commit**

```bash
git add tests/local/FA-39.sh website/src/data/test-inventory.json
git commit -m "test(arena): FA-39 shell — arena schema bootstrap + auth gate smoke (Plan 2b Task 15)"
```

---

## Task 16: Deploy + smoke

**Files:** None (deployment only).

- [ ] **Step 1: Build and push arena-server** (contains lobby:character from Task 5)

```bash
task arena:build ENV=mentolder && task arena:push
```

Expected: `Pushed ghcr.io/paddione/arena-server:latest`

- [ ] **Step 2: Deploy arena-server**

```bash
task arena:deploy ENV=mentolder
kubectl -n workspace rollout status deploy/arena-server
```

Expected: `successfully rolled out`

- [ ] **Step 3: Deploy website to both clusters**

```bash
task feature:website
```

Expected: website rebuilt and deployed on mentolder + korczewski.

- [ ] **Step 4: Verify arena healthz**

```bash
curl -s https://arena-ws.mentolder.de/healthz
```

Expected: `{"ok":true,...}`

- [ ] **Step 5: Manual smoke — full match flow**

1. Open `https://web.mentolder.de/admin/arena` (logged in as admin).
2. Verify recent matches table loads (may say "No matches yet").
3. Click "Open lobby" — page redirects to `/portal/arena?lobby=XXXXXX`.
4. Lobby scene visible: code, character picker arrows work, player list shows the admin.
5. Wait 65 seconds — canvas appears (match starts with 3 bots).
6. Canvas shows the dark floor grid, wall rectangles, and player sprites at spawn corners.
7. After ~5-10 seconds the results screen shows winner name and BOT labels.
8. Click "Back to portal".
9. Open admin/arena — recent matches table now shows the completed match.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(arena): Plan 2b deployed — game client live on mentolder (Plan 2b Task 16)"
```

---

## Self-Review

### Spec Coverage

| Plan 2a Post-Note Item | Task |
|------------------------|------|
| ArenaIsland.tsx — React+Pixi game client | Tasks 7, 11 |
| HUD overlay (HP pips, kill feed, ping) | Task 8 |
| portal/arena.astro upgrade | Task 12 |
| Arena sprite + sound assets from Kore DS | Task 2 |
| FA-31 (4-player match E2E) | Task 14 — issued as FA-38 (FA-31 is already the monitoring auth test) |
| FA-32 (rematch) | Rematch vote button wired in ArenaIsland (Task 11); full E2E deferred to Plan 2c |
| FA-33 (forfeit+spectator) | Forfeit button in HUD (Task 8); schema smoke in FA-39 (Task 15) |
| Character picker | Tasks 5 (server), 6 (UI) |
| med-syringe cast time | Deferred to Plan 2c |
| EMP weapon-locked flag | Deferred to Plan 2c |
| Supply drop animation | Deferred to Plan 2c |
| M4A1 cache weapon pickup | Deferred to Plan 2c |

### Type Consistency Check

- `applyDiff` (Task 3) imports `MatchState, DiffOp` from `../shared/lobbyTypes` ✓
- `Renderer.drawFrame(state: MatchState, myKey: string)` consistent in Tasks 7, 9 ✓
- `LobbyScene` props `players: PlayerSlot[]` from lobbyTypes ✓
- `ArenaIsland` imports `PROTOCOL_VERSION` — verify it is exported from lobbyTypes:

```bash
grep "PROTOCOL_VERSION" website/src/components/arena/shared/lobbyTypes.ts
```

Expected: `export const PROTOCOL_VERSION = 1;` — present from Plan 2a Task 12.

- `MatchScene` uses `structuredClone` (Node 17+ / Chrome 98+) — safe for this target environment.

### Placeholder Scan

No TBD, "similar to", or open-ended instruction found. All code blocks are complete and self-contained.

### XSS / Security

- `admin/arena.astro` uses `textContent` exclusively for match data (Task 13) — no DOM injection risk.
- `ArenaIsland.tsx` passes wsUrl from Astro server-side (env var, not user input) — safe.
- Token is sent as `auth` object in socket.io handshake, not in the URL.

---

## Post-Plan Notes

**What Plan 2c adds on top of this:**
- `scenes/SpectatorScene.tsx` — spectator follow-target picker using `spectator:follow` message
- `hud/Minimap.tsx` — 80-px Canvas 2D overview: zone ring + player dots (color-coded by brand)
- EMP weapon-locked: add `weaponLocked: boolean` to PlayerState; `weapons.ts` skips fire if set; client renders HUD ammo as locked
- med-syringe cast stagger: `castRemainingMs: number` on PlayerState; 400ms window; client shows cast bar in HUD
- M4A1 north-cache pickup: special item kind `m4a1` dropped when north door unlocks; client handles weapon swap animation
- FA-40 full rematch lifecycle E2E (two consecutive matches with vote)
- FA-41 spectator mode E2E

**Do not change `buildDiff()` in tick.ts without simultaneously updating `diff.ts` in the website.** The path encoding is a private contract between these two files.
