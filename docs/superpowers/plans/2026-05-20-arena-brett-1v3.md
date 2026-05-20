---
ticket_id: T000076
title: Arena 1v3 + Brett Co-op Waves Implementation Plan
domains: []
status: active
pr_number: null
---

# Arena 1v3 + Brett Co-op Waves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 1v3-vs-bots lobby mode to arena-server (korczewski) and a 10-wave co-op mode to Brett (mentolder).

**Architecture:** Arena 1v3 extends the existing lobby/tick pipeline with a new `mode` field and an early-exit win condition when the host dies. Brett co-op adds a wave state machine to `GameModeManager` and three small bot-system changes (boss multiplier, team targeting, friendly-fire skip), all synced via server-relay.

**Tech Stack:** TypeScript/Express/Socket.IO (arena-server), vanilla JS/Three.js (brett), React/TSX (website), Astro (website pages), vitest (arena tests), Node built-in test runner (brett)

---

## Part 1 — Arena 1v3

### Task 1: Protocol + Registry — add `mode` field

**Files:**
- Modify: `arena-server/src/proto/messages.ts`
- Modify: `arena-server/src/lobby/registry.ts`
- Modify: `website/src/components/arena/shared/lobbyTypes.ts`

- [ ] **Step 1: Bump PROTOCOL_VERSION and add mode type to messages.ts**

In `arena-server/src/proto/messages.ts`, make these exact changes:

```typescript
// line 4 — change:
export const PROTOCOL_VERSION = 2;

// ClientMsg — change the lobby:open variant (line ~82):
  | { t: 'lobby:open'; mode?: 'ffa' | 'one-v-three' }

// ServerMsg — change the lobby:state variant (line ~95):
  | { t: 'lobby:state'; code: string; phase: LobbyPhase;
        players: PlayerSlot[]; expiresAt?: number; countdownMs?: number;
        mode: 'ffa' | 'one-v-three' }
```

- [ ] **Step 2: Replace `solo?` with `mode` in Lobby registry**

In `arena-server/src/lobby/registry.ts`:

```typescript
export interface Lobby {
  code: string;
  phase: 'open' | 'starting' | 'in-match' | 'slow-mo' | 'results' | 'closed';
  hostKey: string;
  openedAt: number;
  expiresAt: number;
  players: Map<string, PlayerSlot>;
  rematchYes: Set<string>;
  spectators?: Set<string>;
  mode: 'ffa' | 'one-v-three';   // replaces solo?: boolean
  timers: { [k: string]: NodeJS.Timeout | undefined };
  tick?: Tick;
}
```

- [ ] **Step 3: Mirror changes in lobbyTypes.ts (CI diff-guard)**

In `website/src/components/arena/shared/lobbyTypes.ts`:

```typescript
// line 4:
export const PROTOCOL_VERSION = 2;

// ClientMsg — change lobby:open variant:
  | { t: 'lobby:open'; mode?: 'ffa' | 'one-v-three' }

// ServerMsg — change lobby:state variant:
  | { t: 'lobby:state'; code: string; phase: LobbyPhase;
        players: PlayerSlot[]; expiresAt?: number; countdownMs?: number;
        mode: 'ffa' | 'one-v-three' }
```

- [ ] **Step 4: Verify CI diff-guard passes**

```bash
cd /tmp/wt-arena-brett-1v3
diff arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
```

Expected: exit 0 (no diff).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add arena-server/src/proto/messages.ts arena-server/src/lobby/registry.ts \
  website/src/components/arena/shared/lobbyTypes.ts
git commit -m "feat(arena): add mode field to protocol + lobby registry (PROTOCOL_VERSION 2)"
```

---

### Task 2: Lifecycle — open() accepts mode, broadcasters emit mode

**Files:**
- Modify: `arena-server/src/lobby/lifecycle.ts`
- Modify: `arena-server/src/ws/broadcasters.ts`

- [ ] **Step 1: Update OpenRequest and open() to accept mode**

In `arena-server/src/lobby/lifecycle.ts`:

```typescript
// Change OpenRequest:
export interface OpenRequest {
  hostKey: string;
  hostName: string;
  mode?: 'ffa' | 'one-v-three';
}

// In open(), change the Lobby construction (around line 41-46):
    const lobby: Lobby = {
      code, phase: 'open', hostKey: req.hostKey,
      openedAt: now, expiresAt,
      players: new Map([[host.key, host]]),
      rematchYes: new Set(), timers: {},
      mode: req.mode ?? 'ffa',
    };
```

- [ ] **Step 2: Replace openSolo() to use mode instead of solo flag**

In `arena-server/src/lobby/lifecycle.ts`, replace the `openSolo` method (lines 61-66):

```typescript
  openSolo(req: OpenRequest): OpenResult {
    return this.open({ ...req, mode: 'one-v-three' });
  }
```

And update `startSolo` to check `mode` instead of `solo`:

```typescript
  startSolo(code: string): void {
    const lobby = getLobby(code);
    if (!lobby || lobby.mode !== 'one-v-three' || lobby.phase !== 'open') return;
    this.toStarting(code);
  }
```

- [ ] **Step 3: Include mode in lobby state broadcasts**

In `arena-server/src/ws/broadcasters.ts`, update `emitLobbyState`:

```typescript
    emitLobbyState(code: string) {
      const l = getLobby(code);
      if (!l) return;
      const msg: ServerMsg = {
        t: 'lobby:state', code,
        phase: l.phase,
        players: [...l.players.values()],
        expiresAt: l.expiresAt,
        mode: l.mode,
      };
      to(code).emit('msg', msg);
    },
```

- [ ] **Step 4: Run existing lifecycle tests to confirm no regression**

```bash
cd /tmp/wt-arena-brett-1v3/arena-server
pnpm test -- lifecycle
```

Expected: all existing lifecycle tests pass. If `openSolo` test checks `lobby.solo === true`, update it to check `lobby.mode === 'one-v-three'`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add arena-server/src/lobby/lifecycle.ts arena-server/src/ws/broadcasters.ts
git commit -m "feat(arena): open() accepts mode, broadcasters emit mode in lobby:state"
```

---

### Task 3: Tick — 1v3 host-death triggers immediate match end

**Files:**
- Modify: `arena-server/src/game/tick.ts`

- [ ] **Step 1: Add oneVsThree and hostKey to TickInit**

In `arena-server/src/game/tick.ts`, update the `TickInit` interface (around line 36):

```typescript
export interface TickInit {
  matchId: string;
  players: Map<string, PlayerSlot>;
  bots: Map<string, BotAI>;
  oneVsThree?: boolean;
  hostKey?: string;
}
```

Also store it on the class — add to the class body after line 54 (`private readonly matchId: string;`):

```typescript
  private readonly oneVsThree: boolean;
  private readonly hostKey: string | undefined;
```

And initialise in the constructor (after `this.matchId = init.matchId;`):

```typescript
    this.oneVsThree = init.oneVsThree ?? false;
    this.hostKey = init.hostKey;
```

- [ ] **Step 2: Add 1v3 early-exit check to phase 5 win condition**

In `processTick()`, find the Phase 5 block (around line 255) that starts:

```typescript
    // --- Phase 5: Win condition ---
    const alivePlayers = Object.values(this.state.players).filter(p => p.alive);
    if (alivePlayers.length <= 1 && this.state.everAliveCount >= 2) {
```

Insert the 1v3 check **before** the existing `if`:

```typescript
    // --- Phase 5: Win condition ---
    const alivePlayers = Object.values(this.state.players).filter(p => p.alive);

    // 1v3: host death = immediate defeat (bots win)
    if (this.oneVsThree && this.hostKey &&
        this.state.everAliveCount >= 2 &&
        !this.state.players[this.hostKey]?.alive) {
      events.push({ e: 'slow-mo' });
      if (events.length > 0) this.deps.broadcastEvent(this.matchId, events);
      const results = this.buildResults(null);
      this.stop();
      this.deps.onEnd(null, results);
      return;
    }

    if (alivePlayers.length <= 1 && this.state.everAliveCount >= 2) {
```

- [ ] **Step 3: Pass oneVsThree + hostKey from lifecycle.toInMatch()**

In `arena-server/src/lobby/lifecycle.ts`, inside `toInMatch()`, find where `new Tick(...)` is constructed (around line 139). Update:

```typescript
    // Determine if this is still a 1v3-vs-bots match or has converted to FFA.
    // It stays 1v3 only if all non-host players are bots.
    const nonHostPlayers = [...lobby.players.values()].filter(p => p.key !== lobby.hostKey);
    const allBots = nonHostPlayers.every(p => p.isBot);
    const isOneVsThree = lobby.mode === 'one-v-three' && allBots;

    const tick = new Tick(
      { matchId, players: lobby.players, bots,
        oneVsThree: isOneVsThree, hostKey: lobby.hostKey },
      {
```

- [ ] **Step 4: Run full arena test suite**

```bash
cd /tmp/wt-arena-brett-1v3/arena-server
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add arena-server/src/game/tick.ts arena-server/src/lobby/lifecycle.ts
git commit -m "feat(arena): 1v3 host-death triggers immediate match end in tick.ts"
```

---

### Task 4: Tests — 1v3 lifecycle win conditions

**Files:**
- Modify: `arena-server/src/lobby/lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `arena-server/src/lobby/lifecycle.test.ts` (after the last existing `it` block):

```typescript
  describe('1v3 mode', () => {
    function makeLc() {
      return new Lifecycle({
        onBroadcast: vi.fn(),
        persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any,
        bc: { emitMatchSnapshot: vi.fn(), emitMatchDiff: vi.fn(), emitMatchEvent: vi.fn(), emitMatchEnd: vi.fn() } as any,
      });
    }

    it('open() with mode one-v-three sets lobby.mode', () => {
      const lc = makeLc();
      const { code } = lc.open({ hostKey: 'p@korczewski', hostName: 'P', mode: 'one-v-three' });
      const lobby = registry.getLobby(code)!;
      expect(lobby.mode).toBe('one-v-three');
    });

    it('openSolo() sets mode one-v-three (backwards compat)', () => {
      const lc = makeLc();
      const { code } = lc.openSolo({ hostKey: 'p@korczewski', hostName: 'P' });
      expect(registry.getLobby(code)!.mode).toBe('one-v-three');
    });

    it('open() defaults to ffa when no mode given', () => {
      const lc = makeLc();
      const { code } = lc.open({ hostKey: 'p@korczewski', hostName: 'P' });
      expect(registry.getLobby(code)!.mode).toBe('ffa');
    });

    it('1v3 lobby fills 3 bots on toStarting', () => {
      const lc = makeLc();
      const { code } = lc.open({ hostKey: 'p@korczewski', hostName: 'P', mode: 'one-v-three' });
      vi.advanceTimersByTime(60_001);
      const lobby = registry.getLobby(code)!;
      expect(lobby.players.size).toBe(4);
      expect([...lobby.players.values()].filter(p => p.isBot)).toHaveLength(3);
    });
  });
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd /tmp/wt-arena-brett-1v3/arena-server
pnpm test -- lifecycle
```

Expected: the four new tests FAIL (because `open()` doesn't accept `mode` yet — but we already implemented it in Task 2). If Task 2 is done, they should PASS here.

- [ ] **Step 3: Run full suite to confirm all pass**

```bash
cd /tmp/wt-arena-brett-1v3/arena-server
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add arena-server/src/lobby/lifecycle.test.ts
git commit -m "test(arena): 1v3 mode lifecycle tests"
```

---

### Task 5: HTTP route + UI — 1v3 lobby button

**Files:**
- Modify: `arena-server/src/http/routes.ts`
- Create: `website/src/pages/api/arena/1v3.ts`
- Modify: `website/src/pages/admin/arena.astro`
- Modify: `website/src/components/arena/ArenaIsland.tsx`
- Modify: `website/src/components/arena/scenes/LobbyScene.tsx`

- [ ] **Step 1: Add /lobby/open-1v3 HTTP route to arena-server**

In `arena-server/src/http/routes.ts`, after the existing `r.post('/lobby/solo', ...)` block (around line 43):

```typescript
  r.post('/lobby/open-1v3', requireUser, requireAdmin, (req, res) => {
    const out = deps.lc.open({
      hostKey: req.userKey!,
      hostName: req.user!.displayName,
      mode: 'one-v-three',
    });
    res.status(201).json(out);
  });
```

- [ ] **Step 2: Create website API proxy for 1v3**

Create `website/src/pages/api/arena/1v3.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { mintArenaToken } from '../../../lib/arena-token';

const UPSTREAM = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const { token } = mintArenaToken(user.access_token);

  const upstream = await fetch(`${UPSTREAM}/lobby/open-1v3`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 3: Add 1v3 button to admin/arena.astro**

In `website/src/pages/admin/arena.astro`, find the `<div class="actions">` section and add a third button:

```html
<div class="actions">
  <button id="open-lobby" class="primary">Open lobby (FFA)</button>
  <button id="open-1v3" class="primary" style="background:#c9aa71;border-color:#c9aa71;" title="Open a 1v3 lobby — host vs 3 AI bots, real players can join converting to FFA">1v3 vs Bots</button>
  <button id="start-solo" class="secondary" title="Start immediately against 3 AI bots — for testing">Start solo match</button>
</div>
```

And in the `<script>` block, add after the `soloBtn?.addEventListener(...)` line:

```typescript
  const btn1v3 = document.getElementById('open-1v3') as HTMLButtonElement | null;
  btn1v3?.addEventListener('click', () => postAndJoin('/api/arena/1v3', btn1v3));
```

- [ ] **Step 4: Store and expose mode in ArenaIsland**

In `website/src/components/arena/ArenaIsland.tsx`:

Add a mode state variable (after the existing `useState` declarations, around line 23):

```typescript
  const [lobbyMode, setLobbyMode] = useState<'ffa' | 'one-v-three'>('ffa');
```

In the `socket.on('msg', ...)` handler, in the `case 'lobby:state':` branch, add:

```typescript
          if (m.mode) setLobbyMode(m.mode);
```

Pass `lobbyMode` to `LobbyScene` in the render (find the `<LobbyScene` JSX element, around line 152):

```tsx
        <LobbyScene
          code={lobbyCode}
          players={lobbyPlayers}
          phase={lobbyPhase}
          countdownMs={countdown}
          myKey={myKey}
          isHost={isHost}
          mode={lobbyMode}
          onCharacter={handleCharacter}
          onLeave={handleLeave}
          onStart={handleStart}
        />
```

- [ ] **Step 5: Show 1v3 badge in LobbyScene**

In `website/src/components/arena/scenes/LobbyScene.tsx`:

Add `mode` to Props interface:

```typescript
interface Props {
  code: string;
  players: PlayerSlot[];
  phase: 'open' | 'starting';
  countdownMs: number;
  myKey: string;
  isHost: boolean;
  mode: 'ffa' | 'one-v-three';
  onCharacter: (characterId: CharacterId) => void;
  onLeave: () => void;
  onStart: () => void;
}
```

Update destructuring:

```typescript
export function LobbyScene({ code, players, phase, countdownMs, myKey, isHost, mode, onCharacter, onLeave, onStart }: Props) {
```

Add mode badge after the `<div>` containing the "Arena · Lobby {code}" header (after the closing `</h2>` of the starting/waiting message):

```tsx
        {mode === 'one-v-three' && (
          <div style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px',
            background: 'rgba(201,170,113,.15)', border: '1px solid #c9aa71',
            borderRadius: 3, fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11, letterSpacing: '.14em', color: '#c9aa71' }}>
            1v3 · HOST vs BOTS — real players can join
          </div>
        )}
```

- [ ] **Step 6: Run arena-server tests**

```bash
cd /tmp/wt-arena-brett-1v3/arena-server
pnpm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add arena-server/src/http/routes.ts \
  website/src/pages/api/arena/1v3.ts \
  website/src/pages/admin/arena.astro \
  website/src/components/arena/ArenaIsland.tsx \
  website/src/components/arena/scenes/LobbyScene.tsx
git commit -m "feat(arena): 1v3 HTTP endpoint + admin UI button + lobby badge"
```

---

## Part 2 — Brett Co-op Waves

### Task 6: Brett server — relay types + coop mode + coopWave state

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Add wave relay types**

In `brett/server.js`, find the `RELAY_TYPES` array (around line 331):

```javascript
// Change:
'mayhem_mode','player_join','player_state','player_leave',
// Add wave events to the relay list:
'mayhem_mode','player_join','player_state','player_leave',
'wave_start','wave_complete','coop_win','coop_lose',
```

- [ ] **Step 2: Allow 'coop' in admin_mode_set**

In `brett/server.js`, find the validation line (around line 651):

```javascript
// Change:
if (!['warmup','deathmatch','lms'].includes(msg.mode)) return;
// To:
if (!['warmup','deathmatch','lms','coop'].includes(msg.mode)) return;
```

- [ ] **Step 3: Track coopWave per room**

In `brett/server.js`, find where room state is stored/initialised. Rooms are stored in a Map (search for the `rooms` or `figs` Map). Find the per-room data structure and add `coopWave: 0`.

Specifically, find where `wave_start` relay happens (it will be in the RELAY_TYPES loop) and add tracking. After the `RELAY_TYPES` relay block, add a special-case for `wave_start`:

```javascript
// After the RELAY_TYPES relay loop (around the switch/case section),
// add inside the message handler where RELAY_TYPES are processed:
if (RELAY_TYPES.includes(msg.type)) {
  broadcast(room, msg, ws);
  // Track wave number for reconnecting clients
  if (msg.type === 'wave_start' && typeof msg.wave === 'number') {
    const roomState = rooms.get(room) ?? {};
    roomState.coopWave = msg.wave;
    rooms.set(room, roomState);
  }
}
```

Note: look at the actual relay code in the server to find the exact location. The pattern is a `switch` or `if (RELAY_TYPES.includes(...))` block in the WebSocket message handler.

- [ ] **Step 4: Send coopWave to reconnecting clients**

Find where the server sends the initial snapshot to a newly joined client (search for `onSnapshot` or the initial state send). Add:

```javascript
// In the snapshot/join response, include coopWave:
const roomState = rooms.get(room) ?? {};
ws.send(JSON.stringify({
  type: 'coop_wave_sync',
  wave: roomState.coopWave ?? 0,
}));
```

Also add `'coop_wave_sync'` to `RELAY_TYPES` so it can be broadcast if needed, or handle it as a direct send.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add brett/server.js
git commit -m "feat(brett): server relay for wave events + coop mode validation + coopWave tracking"
```

---

### Task 7: Brett GameModeManager — COOP mode + wave state machine

**Files:**
- Modify: `brett/public/assets/mayhem/game-mode.js`

- [ ] **Step 1: Add COOP to MODES and wave definitions**

In `brett/public/assets/mayhem/game-mode.js`, add after the existing `MODES` constant:

```javascript
const MODES = Object.freeze({ WARMUP: 'warmup', DEATHMATCH: 'deathmatch', LMS: 'lms', COOP: 'coop' });

// Wave definitions: normal waves have count, boss waves have boss:true + multipliers
const WAVE_DEFS = [
  { wave: 1,  boss: false, count: 2 },
  { wave: 2,  boss: false, count: 3 },
  { wave: 3,  boss: false, count: 3 },
  { wave: 4,  boss: false, count: 4 },
  { wave: 5,  boss: true,  count: 1, multiplier: { hp: 3, shootRate: 1.5, speed: 1.2, scale: 1.0 } },
  { wave: 6,  boss: false, count: 3 },
  { wave: 7,  boss: false, count: 4 },
  { wave: 8,  boss: false, count: 4 },
  { wave: 9,  boss: false, count: 5 },
  { wave: 10, boss: true,  count: 1, multiplier: { hp: 6, shootRate: 2.0, speed: 1.3, scale: 1.5 } },
];
```

- [ ] **Step 2: Add wave state to GameModeManager constructor**

In the `GameModeManager` constructor, add after the existing fields:

```javascript
    // Co-op wave state
    this._wave        = 0;
    this._enemiesAlive = new Set();
    this._deadPlayers  = new Set();
    this._coopPhase    = 'idle'; // 'idle' | 'in-wave' | 'between' | 'won' | 'lost'
    this._onWaveStart  = null;
    this._onWaveComplete = null;
    this._onCoopWin   = null;
    this._onCoopLose  = null;
```

Also update `setMode()` to clear coop state:

```javascript
  setMode(mode) {
    if (!Object.values(MODES).includes(mode)) return;
    this.mode = mode;
    this._killCounts.clear();
    this._deathTimers.forEach(t => clearTimeout(t));
    this._deathTimers.clear();
    this._deadSet.clear();
    this._spectating = false;
    this._canRespawn = false;
    // Reset co-op state on mode change
    this._wave = 0;
    this._enemiesAlive.clear();
    this._deadPlayers.clear();
    this._coopPhase = 'idle';
    this._onModeChange(mode);
  }
```

- [ ] **Step 3: Add co-op callback registration and startCoop()**

Add these methods to the `GameModeManager` class (before the closing `}`):

```javascript
  // Register co-op callbacks — called by mayhem.js after creating the manager
  setCoopCallbacks({ onWaveStart, onWaveComplete, onCoopWin, onCoopLose }) {
    this._onWaveStart    = onWaveStart    || (() => {});
    this._onWaveComplete = onWaveComplete || (() => {});
    this._onCoopWin      = onCoopWin      || (() => {});
    this._onCoopLose     = onCoopLose     || (() => {});
  }

  // Called by mayhem.js 3 s after game_mode_change {mode:'coop'} (host only)
  startCoop() {
    if (this.mode !== MODES.COOP || this._coopPhase !== 'idle') return;
    this._startWave(1);
  }

  _startWave(n) {
    if (n > WAVE_DEFS.length) {
      this._coopPhase = 'won';
      this._onCoopWin && this._onCoopWin();
      return;
    }
    this._wave = n;
    this._enemiesAlive.clear();
    this._deadPlayers.clear();
    this._coopPhase = 'in-wave';
    const def = WAVE_DEFS[n - 1];
    this._onWaveStart && this._onWaveStart({ wave: n, def });
  }

  // Called by mayhem.js when an enemy bot dies (pass the bot's id)
  handleEnemyDeath(botId) {
    this._enemiesAlive.delete(botId);
    if (this._coopPhase !== 'in-wave') return;
    if (this._enemiesAlive.size === 0) {
      this._coopPhase = 'between';
      this._onWaveComplete && this._onWaveComplete({ wave: this._wave });
      // Advance after 3 s — mayhem.js will respawn dead players on wave_complete
      setTimeout(() => this._startWave(this._wave + 1), 3000);
    }
  }

  // Called by mayhem.js when a human player dies during co-op
  handlePlayerDeathCoop(playerId, allHumanIds) {
    this._deadPlayers.add(playerId);
    if (this._coopPhase !== 'in-wave') return;
    const allDead = allHumanIds.every(id => this._deadPlayers.has(id));
    if (allDead) {
      this._coopPhase = 'lost';
      this._onCoopLose && this._onCoopLose();
    }
  }

  // Register an enemy bot spawned this wave
  registerEnemy(botId) {
    this._enemiesAlive.add(botId);
  }

  getCoopWaveDef() {
    return WAVE_DEFS[this._wave - 1] ?? null;
  }

  getCoopPhase() { return this._coopPhase; }
  getCoopWave()  { return this._wave; }
```

- [ ] **Step 4: Update the window export**

At the bottom of `game-mode.js`, update the export to include WAVE_DEFS:

```javascript
if (typeof window !== 'undefined') {
  window.MayhemGameMode = { GameModeManager, MODES, WAVE_DEFS };
}
```

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add brett/public/assets/mayhem/game-mode.js
git commit -m "feat(brett): GameModeManager COOP mode + wave state machine"
```

---

### Task 8: Brett ai-bot.js — boss multiplier + team targeting

**Files:**
- Modify: `brett/public/assets/mayhem/ai-bot.js`

- [ ] **Step 1: Add bossMultiplier to constructor**

In `brett/public/assets/mayhem/ai-bot.js`, update the constructor to accept and apply `bossMultiplier`:

```javascript
  // callbacks: { onFire(weaponDef, originPos, dirVec, shooterId),
  //              onDeath(botId, killerId),
  //              getGameMode() }
  // bossMultiplier?: { hp: number, shootRate: number, speed: number, scale: number }
  constructor({ id, mannequin, colorIndex = 0, callbacks, bossMultiplier = null }) {
    this.id     = id;
    this.isBoss = !!bossMultiplier;
    this.avatar = new window.MayhemPlayerAvatar({
      id, mannequin, local: false,
      color: bossMultiplier ? '#e74c3c' : BOT_COLORS[colorIndex % BOT_COLORS.length],
    });

    // Boss: scale the 3D model
    if (bossMultiplier && bossMultiplier.scale && bossMultiplier.scale !== 1.0) {
      mannequin.root.scale.setScalar(bossMultiplier.scale);
    }

    this._x = mannequin.root.position.x;
    this._z = mannequin.root.position.z;
    this._facingY    = Math.random() * Math.PI * 2;
    this._aiState    = 'wander';
    this._wanderDx   = 0;
    this._wanderDz   = 1;
    this._wanderTtl  = 0;

    // Boss has increased HP tracked separately (normal bots are one-shot)
    this._hp         = bossMultiplier ? bossMultiplier.hp : 1;
    this._shootTimer = Math.random() * BOT_SHOOT_RATE;
    this._shootRate  = bossMultiplier ? BOT_SHOOT_RATE / bossMultiplier.shootRate : BOT_SHOOT_RATE;
    this._speed      = bossMultiplier ? BOT_SPEED * bossMultiplier.speed : BOT_SPEED;

    this._onFire    = callbacks.onFire;
    this._onDeath   = callbacks.onDeath;
    this._getMode   = callbacks.getGameMode;
```

- [ ] **Step 2: Add processHit to handle multi-hit boss HP**

The existing `processHit` method handles taking damage. Update it to respect `_hp`:

Find the existing `processHit` method and update it so bosses require multiple hits:

```javascript
  processHit(weaponKey, impulse, shooterId, weaponSystem) {
    if (this._aiState === 'dead') return;
    const weaponDef = weaponSystem ? weaponSystem.getWeaponDef(weaponKey) : null;
    const damage    = weaponDef ? (weaponDef.damage / 100) : 0.25; // normalised hit

    this._hp -= damage;
    this.avatar.applyHit(impulse, weaponKey || 'flail');

    if (this._hp <= 0) {
      this._aiState = 'dead';
      this.avatar.die();
      this._onDeath(this.id, shooterId);
    }
  }
```

Note: if the existing `processHit` already calls `_onDeath` unconditionally, replace it with this version that checks `_hp`.

- [ ] **Step 3: Add team-targeting filter to _findNearest()**

Find the `_findNearest(allAvatars)` method and add a human-only filter when in coop mode:

```javascript
  _findNearest(allAvatars) {
    const inCoop = this._getMode() === 'coop';
    let nearest = null, minDist = Infinity;
    for (const [id, av] of allAvatars) {
      if (id === this.id) continue;
      if (av.isDead || av.state === window.MayhemPlayerAvatar?.STATE?.RAGDOLL) continue;
      // In co-op mode, only target human avatars (IDs that don't start with 'bot-')
      if (inCoop && id.startsWith('bot-')) continue;
      const dist = this._dist(av);
      if (dist < minDist) { minDist = dist; nearest = av; }
    }
    return nearest;
  }
```

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add brett/public/assets/mayhem/ai-bot.js
git commit -m "feat(brett): ai-bot bossMultiplier (HP tracking + scale + color) + team targeting"
```

---

### Task 9: Brett mayhem.js — wave spawning, friendly fire, dead-human tracking

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`

- [ ] **Step 1: Add deadHumans set and co-op callbacks setup**

At the top of the `start()` function body in `mayhem.js` (after the existing local variable declarations), add:

```javascript
    let deadHumans = new Set(); // tracks dead human IDs for between-wave respawn
    let coopStartTimer = null;  // setTimeout handle for auto-starting wave 1
```

After `gameMode` is created (the `new window.MayhemGameMode.GameModeManager(...)` call), register co-op callbacks:

```javascript
    gameMode.setCoopCallbacks({
      onWaveStart: ({ wave, def }) => {
        deadHumans.clear();
        // Spawn enemies for this wave
        spawnWave(def);
        // Broadcast wave_start so all clients sync
        send({ type: 'wave_start', wave, enemyCount: def.count, boss: def.boss ?? false });
        updateHud();
      },
      onWaveComplete: ({ wave }) => {
        send({ type: 'wave_complete', wave });
        // Respawn dead humans after 3 s (matches the _startWave timeout)
        setTimeout(() => {
          for (const id of deadHumans) {
            if (id === playerId) localRespawn();
          }
          deadHumans.clear();
          updateHud();
        }, 3000);
      },
      onCoopWin:  () => { send({ type: 'coop_win' });  showCoopBanner('YOU WIN — all waves cleared!'); },
      onCoopLose: () => { send({ type: 'coop_lose' }); showCoopBanner('DEFEATED'); },
    });
```

- [ ] **Step 2: Add spawnWave() function**

Add `spawnWave(def)` as a new function near `spawnAIBot()`:

```javascript
  function spawnWave(def) {
    // Remove any leftover bots from previous wave
    for (const bot of aiBots.values()) { bot.remove(scene); remoteAvatars.delete(bot.id); }
    aiBots.clear();

    for (let i = 0; i < def.count; i++) {
      const botId = 'bot-' + crypto.randomUUID();
      const pos   = nextSpawnPoint();
      const botMannequin = makeMannequin(botId, pos);
      const bot = new window.MayhemAIBot({
        id: botId,
        mannequin: botMannequin,
        colorIndex: i,
        bossMultiplier: def.boss ? def.multiplier : null,
        callbacks: {
          onFire: (weaponDef, originPos, dirVec, shooterId) => {
            if (projectileMgr) projectileMgr.spawn(weaponDef, originPos, dirVec, shooterId);
          },
          onDeath: (id, killerId) => {
            aiBots.delete(id);
            remoteAvatars.delete(id);
            if (killerId && killerId !== id) gameMode?.handleKill(killerId);
            gameMode?.handleEnemyDeath(id);
            updateHud();
          },
          getGameMode: () => gameMode?.mode || 'warmup',
        },
      });
      if (bot.avatar && bot.weaponDef) bot.avatar.setWeapon(bot.weaponDef);
      aiBots.set(botId, bot);
      remoteAvatars.set(botId, bot.avatar);
      gameMode?.registerEnemy(botId);
    }
  }
```

- [ ] **Step 3: Add friendly-fire skip in applyHitLocally()**

In `applyHitLocally(victimId, weaponKey, impulse, shooterId)`, add a friendly-fire check at the very top of the function:

```javascript
  function applyHitLocally(victimId, weaponKey, impulse, shooterId) {
    // In co-op mode, skip damage between human players (no friendly fire)
    if (gameMode?.mode === 'coop') {
      const shooterIsHuman = shooterId && !shooterId.startsWith('bot-');
      const victimIsHuman  = victimId  && !victimId.startsWith('bot-');
      if (shooterIsHuman && victimIsHuman) return;
    }
    // ... rest of existing function unchanged
```

- [ ] **Step 4: Track dead humans and call handlePlayerDeathCoop**

In `processLocalHit()`, find the block that handles `localAvatar.isDead` (around "player_death" send). Update it for co-op:

```javascript
    if (localAvatar.isDead) {
      send({ type: 'player_death', playerId, killerId: shooterId });
      if (gameMode?.mode === 'coop') {
        deadHumans.add(playerId);
        // Collect all known human IDs (local + any non-bot remote avatars)
        const allHumanIds = [playerId, ...[...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'))];
        gameMode.handlePlayerDeathCoop(playerId, allHumanIds);
      } else {
        gameMode?.handleDeath(playerId, true);
      }
      if (shooterId && shooterId !== playerId) gameMode?.handleKill(shooterId);
    }
```

- [ ] **Step 5: Auto-start wave 1 after co-op mode set (host only)**

In the `game_mode_change` handler in `onMessage()` (around line where `gameMode.setMode(msg.mode)` is called), add the co-op auto-start:

```javascript
      case 'game_mode_change':
        if (gameMode && msg.mode) gameMode.setMode(msg.mode);
        updateHud();
        // Host auto-starts wave 1 after 3 s when co-op mode is set
        if (msg.mode === 'coop' && isHost) {
          if (coopStartTimer) clearTimeout(coopStartTimer);
          coopStartTimer = setTimeout(() => gameMode?.startCoop(), 3000);
        }
        break;
```

Note: `isHost` must be available in this scope. Check if there's an existing `isHost` variable in `mayhem.js`; if not, derive it from the room's admin state or pass it as a parameter to `start()`.

- [ ] **Step 6: Handle wave_start received from server (non-host clients)**

In the `onMessage` switch, add a new case for clients that receive wave events relayed from the server:

```javascript
      case 'wave_start':
        // Non-host clients: spawn enemies for this wave
        if (!isHost && gameMode) {
          const def = window.MayhemGameMode.WAVE_DEFS[msg.wave - 1];
          if (def) {
            deadHumans.clear();
            spawnWave(def);
            updateHud();
          }
        }
        break;

      case 'coop_wave_sync':
        // Sent by server on reconnect — catch up to current wave
        if (gameMode && msg.wave > 0) {
          const def = window.MayhemGameMode.WAVE_DEFS[msg.wave - 1];
          if (def) spawnWave(def);
          updateHud();
        }
        break;
```

- [ ] **Step 7: Add showCoopBanner helper**

Add a simple function near the other banner/display helpers:

```javascript
  function showCoopBanner(text) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:#1a1a2e;border:2px solid #c9aa71;color:#c9aa71;font-family:monospace;' +
      'font-size:32px;padding:24px 48px;z-index:9999;text-align:center;border-radius:8px;';
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }
```

- [ ] **Step 8: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): wave spawning, friendly fire skip, dead-human tracking in mayhem.js"
```

---

### Task 10: Brett HUD — co-op wave counter + enemy count + boss HP bar

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add co-op HUD HTML**

In `brett/public/index.html`, find the existing HUD section (search for `id="hud"` or the score/kill display). Add the co-op HUD element **after** the existing HUD, hidden by default:

```html
<!-- Co-op Wave HUD (shown only in coop mode) -->
<div id="coop-hud" style="display:none;position:fixed;top:12px;left:50%;transform:translateX(-50%);
  background:rgba(10,10,20,.82);border:1px solid #4a7;border-radius:8px;
  padding:8px 20px;font-family:monospace;color:#ccd;font-size:13px;
  display:none;flex-direction:column;gap:4px;min-width:220px;z-index:200;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#c9aa71;font-weight:bold;letter-spacing:.1em;">CO-OP</span>
    <span id="coop-wave-label" style="font-size:15px;font-weight:bold;color:#fff;">WELLE 1 / 10</span>
    <span id="coop-enemy-count" style="color:#e87;">Feinde: <strong>0</strong></span>
  </div>
  <div style="background:#1e1e1e;border-radius:4px;overflow:hidden;height:4px;">
    <div id="coop-progress-bar" style="width:10%;height:100%;background:linear-gradient(90deg,#4a7,#c9aa71);transition:width .5s;"></div>
  </div>
  <div id="boss-hp-wrap" style="display:none;margin-top:4px;">
    <div style="color:#f44;font-size:11px;margin-bottom:2px;">⚠ BOSS HP</div>
    <div style="background:#1e1e1e;border-radius:4px;overflow:hidden;height:6px;">
      <div id="boss-hp-bar" style="width:100%;height:100%;background:#f44;transition:width .3s;"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Update the co-op HUD on wave_start and enemy death**

In the `onMessage` handler (in the `<script>` in `index.html`, or in `mayhem.js` if the HUD updates are centralised), add HUD update calls. Find the `updateHud()` or equivalent function and add:

```javascript
function updateCoopHud() {
  const hud = document.getElementById('coop-hud');
  if (!hud || !gameMode) return;

  const isCoop = gameMode.mode === 'coop';
  hud.style.display = isCoop ? 'flex' : 'none';
  if (!isCoop) return;

  const wave     = gameMode.getCoopWave();
  const enemies  = gameMode._enemiesAlive.size;
  const def      = gameMode.getCoopWaveDef();

  document.getElementById('coop-wave-label').textContent = `WELLE ${wave} / 10`;
  document.getElementById('coop-enemy-count').innerHTML  = `Feinde: <strong>${enemies}</strong>`;
  document.getElementById('coop-progress-bar').style.width = `${(wave / 10) * 100}%`;

  const bossWrap = document.getElementById('boss-hp-wrap');
  const bossBar  = document.getElementById('boss-hp-bar');
  const isBossWave = def && def.boss;
  bossWrap.style.display = isBossWave ? 'block' : 'none';

  // Boss HP: find the boss bot and read its _hp vs max hp
  if (isBossWave && def) {
    const maxHp = def.multiplier.hp;
    let currentHp = 0;
    for (const bot of aiBots.values()) {
      if (bot.isBoss) { currentHp = bot._hp; break; }
    }
    bossBar.style.width = `${Math.max(0, (currentHp / maxHp) * 100)}%`;
  }
}
```

Call `updateCoopHud()` at the end of `updateHud()` (or wherever the main HUD is refreshed).

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-arena-brett-1v3
git add brett/public/index.html
git commit -m "feat(brett): co-op HUD — wave counter, enemy count, boss HP bar"
```

---

### Task 11: Verification + Deploy

**Files:** none (test + deploy only)

- [ ] **Step 1: Run all offline tests**

```bash
cd /tmp/wt-arena-brett-1v3
task test:all
```

Expected: all pass. Fix any failures before continuing.

- [ ] **Step 2: Run arena server tests**

```bash
cd /tmp/wt-arena-brett-1v3/arena-server
pnpm test
```

Expected: all pass.

- [ ] **Step 3: Run brett unit tests**

```bash
cd /tmp/wt-arena-brett-1v3
npm ci --prefix brett
node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs
```

Expected: all pass.

- [ ] **Step 4: Validate kustomize manifests**

```bash
cd /tmp/wt-arena-brett-1v3
task workspace:validate
```

Expected: no errors.

- [ ] **Step 5: Check CI diff-guard (proto sync)**

```bash
cd /tmp/wt-arena-brett-1v3
diff arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
```

Expected: exit 0.

- [ ] **Step 6: Create PR from the feature branch**

```bash
cd /tmp/wt-arena-brett-1v3
git push -u origin feature/arena-brett-1v3
gh pr create \
  --title "feat(arena+brett): 1v3 lobby mode + co-op wave survival" \
  --body "$(cat <<'EOF'
## Summary
- Arena 1v3: host vs 3 AI bots, real players can join converting to FFA; host death = immediate game over vs bots
- Brett Co-op: 10-wave survival mode with mid-boss (W5, HP×3) and final boss (W10, HP×6); no friendly fire; between-wave respawn; server-relayed wave sync

## Test plan
- [ ] Arena: open 1v3 lobby via admin button → 3 bots fill, badge shows
- [ ] Arena: kill all 3 bots → host wins; die as host → immediate game over
- [ ] Arena: real player joins → bot displaced, badge disappears, FFA win condition
- [ ] Brett: set mode `coop` as admin → wave 1 starts after 3 s, 2 bots spawn
- [ ] Brett: kill all wave 1 bots → wave 2 starts after 3 s pause
- [ ] Brett: die mid-wave → no respawn; all dead → coop_lose
- [ ] Brett: wave 5 boss → red, larger, more HP required
- [ ] Brett: survive all 10 → coop_win banner
- [ ] Brett: human shoots human → no damage

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Deploy arena to korczewski**

```bash
task feature:arena
```

Expected: arena-server image builds and rolls out on korczewski. Verify: `task arena:status ENV=korczewski`

- [ ] **Step 8: Deploy website to both clusters (arena UI + brett unchanged)**

```bash
task feature:website
```

Expected: website rolls on both clusters. Verify: `task workspace:verify:all-prods`

- [ ] **Step 9: Deploy brett to both clusters**

```bash
task feature:brett
```

Expected: brett image builds and rolls on both clusters. Verify: `task brett:logs ENV=mentolder`

- [ ] **Step 10: Merge PR**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```
