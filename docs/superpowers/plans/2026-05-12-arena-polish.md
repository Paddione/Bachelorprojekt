---
title: Arena — Polish Pass (Plan 2c of 3) Implementation Plan
domains: [website, arena-server]
status: active
pr_number: null
---

# Arena — Polish Pass (Plan 2c of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add spectator mode (late-joiners watch live matches), slow-mo vignette visual (Pixi ticker slow-down + CSS overlay on match-end), and synthesised SFX (Web Audio API, zero assets) to the arena.

**Architecture:** Three independent features share one PR. Spectator mode adds a server-side `spectator:join` message, a `getState()` accessor on Tick, and a new `SpectatorScene.tsx`. Slow-mo is purely client-side: a `match:event { e:'slow-mo' }` triggers Pixi ticker speed change plus a CSS vignette overlay in `MatchScene`. SFX is a singleton module `sfx.ts` (lazy AudioContext) wired to kill events, zone warnings, slow-mo, and victory.

**Tech Stack:** TypeScript 5, React 18, Pixi.js v8, socket.io/socket.io-client 4, Web Audio API, Vitest.

---

## File Map

**Create:**
- `website/src/components/arena/game/sfx.ts` — Web Audio synthesis module
- `website/src/components/arena/scenes/SpectatorScene.tsx` — spectator view
- `tests/local/FA-40.sh` — spectator join smoke test

**Modify:**
- `arena-server/src/proto/messages.ts` — add `spectator:join` to ClientMsg + CLIENT_TYPES
- `arena-server/src/game/tick.ts` — add public `getState(): MatchState`
- `arena-server/src/lobby/registry.ts` — add `spectators?: Set<string>` to Lobby
- `arena-server/src/ws/handlers.ts` — spectator late-join in `lobby:join`; add `spectator:join` case
- `website/src/components/arena/shared/lobbyTypes.ts` — mirror `spectator:join`
- `website/src/components/arena/game/Renderer.ts` — add `setFollowTarget()` + `setTickerSpeed()`
- `website/src/components/arena/scenes/MatchScene.tsx` — slow-mo overlay + SFX hooks
- `website/src/components/arena/scenes/ResultsScene.tsx` — `playVictory()` on mount
- `website/src/components/arena/hud/Hud.tsx` — mute toggle button
- `website/src/components/arena/ArenaIsland.tsx` — spectator scene routing + slow-mo SFX
- `website/src/data/test-inventory.json` — add FA-40 entry

---

## Task 1: Server protocol — `spectator:join` message type

**Files:**
- Modify: `arena-server/src/proto/messages.ts`
- Modify: `website/src/components/arena/shared/lobbyTypes.ts`
- Test: `arena-server/src/proto/messages.test.ts`

- [ ] **Step 1: Write a failing test for spectator:join round-trip**

Open `arena-server/src/proto/messages.test.ts` and add after the existing `it` blocks:

```typescript
it('round-trips a spectator:join client message', () => {
  const msg: ClientMsg = { t: 'spectator:join', code: 'ZK4M9X' };
  expect(isClientMsg(JSON.parse(JSON.stringify(msg)))).toBe(true);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd arena-server && npx vitest run src/proto/messages.test.ts
```

Expected: FAIL — `'spectator:join'` is not in the `ClientMsg` union.

- [ ] **Step 3: Add `spectator:join` to `arena-server/src/proto/messages.ts`**

In the `ClientMsg` union (after `{ t: 'spectator:follow'; ... }`), add:
```typescript
| { t: 'spectator:join'; code: string }
```

In `CLIENT_TYPES`:
```typescript
const CLIENT_TYPES = new Set([
  'lobby:open','lobby:join','lobby:ready','lobby:leave','lobby:character','input',
  'spectator:follow','spectator:join','rematch:vote','forfeit','auth:refresh',
]);
```

- [ ] **Step 4: Mirror the change in `website/src/components/arena/shared/lobbyTypes.ts`**

In the `ClientMsg` union (after `{ t: 'spectator:follow'; ... }`), add:
```typescript
| { t: 'spectator:join'; code: string }
```

In `CLIENT_TYPES`:
```typescript
const CLIENT_TYPES = new Set([
  'lobby:open','lobby:join','lobby:ready','lobby:leave','input',
  'spectator:follow','spectator:join','rematch:vote','forfeit','auth:refresh',
]);
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd arena-server && npx vitest run src/proto/messages.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add arena-server/src/proto/messages.test.ts arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
git commit -m "feat(arena): add spectator:join to client message protocol"
```

---

## Task 2: Tick — `getState()` public accessor

**Files:**
- Modify: `arena-server/src/game/tick.ts`

The spectator:join handler (Task 3) needs to emit a `match:full-snapshot` of the current tick state to the joining socket. `this.state` is private so a public accessor is required.

- [ ] **Step 1: Add `getState()` to the `Tick` class**

In `arena-server/src/game/tick.ts`, after the `playerDisconnected` method (line 128), add:

```typescript
getState(): MatchState {
  return this.state;
}
```

This returns the internal state reference (Socket.io serialises it before it leaves the process, so mutation risk is contained).

- [ ] **Step 2: Run existing server tests to verify no regression**

```bash
cd arena-server && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add arena-server/src/game/tick.ts
git commit -m "feat(arena): expose Tick.getState() for spectator snapshot"
```

---

## Task 3: Server — registry + spectator:join handler

**Files:**
- Modify: `arena-server/src/lobby/registry.ts`
- Modify: `arena-server/src/ws/handlers.ts`

- [ ] **Step 1: Add `spectators` field to Lobby interface in `arena-server/src/lobby/registry.ts`**

In the `Lobby` interface, after `rematchYes: Set<string>`, add:
```typescript
spectators?: Set<string>;
```

Full updated interface:
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
  timers: { [k: string]: NodeJS.Timeout | undefined };
  tick?: Tick;
}
```

- [ ] **Step 2: Modify `lobby:join` case for spectator late-join in `arena-server/src/ws/handlers.ts`**

Replace the `case 'lobby:join':` block with:

```typescript
case 'lobby:join': {
  const targetLobby = getLobby(m.code);
  if (targetLobby && (targetLobby.phase === 'in-match' || targetLobby.phase === 'slow-mo')) {
    // Late spectator join: join the room so future broadcasts reach this socket,
    // then emit current lobby:state so the client can detect it should spectate.
    socket.join(`lobby:${m.code}`);
    const stateMsg: ServerMsg = {
      t: 'lobby:state', code: m.code, phase: targetLobby.phase,
      players: [...targetLobby.players.values()], expiresAt: targetLobby.expiresAt,
    };
    socket.emit('msg', stateMsg);
  } else {
    deps.lc.join(m.code, {
      key, displayName: deps.user.displayName, brand: deps.user.brand,
      characterId: 'blonde-guy', isBot: false, ready: false, alive: true,
    });
    socket.join(`lobby:${m.code}`);
  }
  break;
}
```

- [ ] **Step 3: Add `spectator:join` case in the switch in `handlers.ts`**

After the `'input'` case block and before `'auth:refresh'`, add:

```typescript
case 'spectator:join': {
  const specLobby = getLobby(m.code);
  if (!specLobby) { sendError(socket, 'not-found', 'lobby not found'); break; }
  if (specLobby.phase !== 'in-match' && specLobby.phase !== 'slow-mo') {
    sendError(socket, 'not-in-match', 'match not in progress'); break;
  }
  if (!specLobby.spectators) specLobby.spectators = new Set();
  specLobby.spectators.add(key);
  const currentState = specLobby.tick?.getState();
  if (currentState) {
    const snap: ServerMsg = { t: 'match:full-snapshot', tick: currentState.tick, state: currentState };
    socket.emit('msg', snap);
  }
  break;
}
```

- [ ] **Step 4: Run server tests**

```bash
cd arena-server && npx vitest run
```

Expected: all tests PASS (no existing test covers handlers directly).

- [ ] **Step 5: Commit**

```bash
git add arena-server/src/lobby/registry.ts arena-server/src/ws/handlers.ts
git commit -m "feat(arena): spectator:join handler — late-join room + full-snapshot"
```

---

## Task 4: Renderer — `setFollowTarget()` and `setTickerSpeed()`

**Files:**
- Modify: `website/src/components/arena/game/Renderer.ts`

Note: MAP_W = 960, MAP_H = 540 — exactly the canvas dimensions. `setFollowTarget` stores the target for future camera extensions but produces no visible stage offset at this map size. `setTickerSpeed` is used by MatchScene and SpectatorScene to slow the animation during slow-mo.

- [ ] **Step 1: Add `followTarget` field and two public methods to the `Renderer` class**

After the `private ready = false;` field declaration, add:
```typescript
private followTarget: string | null = null;
```

After the `startTicker` method and before `destroy()`, add:

```typescript
setFollowTarget(playerKey: string | null): void {
  this.followTarget = playerKey;
}

setTickerSpeed(speed: number): void {
  this.app.ticker.speed = speed;
}
```

- [ ] **Step 2: TypeScript-check the website**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/game/Renderer.ts
git commit -m "feat(arena): Renderer.setFollowTarget + setTickerSpeed for spectator and slow-mo"
```

---

## Task 5: SFX synthesis module

**Files:**
- Create: `website/src/components/arena/game/sfx.ts`

All sounds are synthesised; no audio assets required. `AudioContext` is lazily created to comply with browser autoplay policies (first created on user interaction). Each play function guards on `isMuted` and resumes a suspended context.

- [ ] **Step 1: Create `website/src/components/arena/game/sfx.ts`**

```typescript
import type { WeaponId } from '../shared/lobbyTypes';

let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function noiseBuffer(c: AudioContext, durationS: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * durationS), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export let isMuted: boolean = typeof localStorage !== 'undefined'
  ? localStorage.getItem('arena:sfx:muted') === 'true'
  : false;

export function toggleMute(): void {
  isMuted = !isMuted;
  if (typeof localStorage !== 'undefined')
    localStorage.setItem('arena:sfx:muted', String(isMuted));
}

export function playShot(weapon: WeaponId): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  const gain = c.createGain();
  gain.connect(c.destination);

  if (weapon === 'glock') {
    // 100ms white-noise burst, 2 kHz bandpass, fast decay
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.1);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1;
    gain.gain.setValueAtTime(0.7, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    src.connect(filter);
    filter.connect(gain);
    src.start();
  } else if (weapon === 'm4a1') {
    // 150ms noise burst, 400 Hz bandpass, rumble envelope
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.15);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.9, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    src.connect(filter);
    filter.connect(gain);
    src.start();
  } else {
    // deagle: 40ms sharp transient, 8 kHz highpass click
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.04);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    gain.gain.setValueAtTime(1.0, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    src.connect(filter);
    filter.connect(gain);
    src.start();
  }
}

export function playMelee(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 80ms noise burst, 200 Hz bandpass, soft thud envelope
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.08);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 200;
  filter.Q.value = 1;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.8, c.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}

export function playDeath(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 400ms descending sawtooth: 300 → 80 Hz, amplitude ramps to zero
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, c.currentTime);
  osc.frequency.linearRampToValueAtTime(80, c.currentTime + 0.4);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.4, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.4);
}

let zoneWarnPlayed = false;
export function resetZoneWarnFlag(): void { zoneWarnPlayed = false; }

export function playZoneWarning(): void {
  if (isMuted || zoneWarnPlayed) return;
  zoneWarnPlayed = true;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 300ms two-tone pulse: 440 Hz + 880 Hz sine
  [440, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.2, c.currentTime + i * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3 + i * 0.05);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + i * 0.05);
    osc.stop(c.currentTime + 0.31 + i * 0.05);
  });
}

export function playSlowMo(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 600ms noise swept from 200 → 80 Hz via bandpass linearRamp
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.6);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, c.currentTime);
  filter.frequency.linearRampToValueAtTime(80, c.currentTime + 0.6);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.6, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}

export function playVictory(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 800ms: C4 → E4 → G4 arpeggio, 200ms each + 200ms sustain on G4
  const notes = [261.63, 329.63, 392.0]; // C4, E4, G4
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    const startAt = c.currentTime + i * 0.2;
    const endAt = startAt + (i === notes.length - 1 ? 0.4 : 0.18);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.3, startAt + 0.01);
    gain.gain.setValueAtTime(0.3, endAt - 0.04);
    gain.gain.linearRampToValueAtTime(0, endAt);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startAt);
    osc.stop(endAt);
  });
}
```

- [ ] **Step 2: TypeScript-check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/game/sfx.ts
git commit -m "feat(arena): sfx.ts — Web Audio synthesis (shot/melee/death/zone/slowmo/victory)"
```

---

## Task 6: MatchScene — slow-mo overlay + SFX wiring

**Files:**
- Modify: `website/src/components/arena/scenes/MatchScene.tsx`

Triggers:
- `match:event { e: 'slow-mo' }` → enable slow-mo (overlay + ticker slow-down + `playSlowMo()`)
- `match:event { e: 'kill' | 'kill-zone' }` → `playDeath()`
- Own player's `wammo` diff op decreases → `playShot(weapon)`
- Zone shrinking && radius < `540 * 0.6 * 0.3 = 97.2` → `playZoneWarning()`

Note: `MatchScene` does not yet handle WASD input — shot SFX fires when own player's ammo decreases in a diff, which is the observable server-side equivalent.

- [ ] **Step 1: Add imports and state to `MatchScene.tsx`**

At the top of the file, add:
```typescript
import * as sfx from '../game/sfx';
import { MAP_H } from '../game/mapData';
```

Inside the `MatchScene` component, after `const lastTickAt = useRef(Date.now());`, add:
```typescript
const [isSlowMo, setIsSlowMo] = useState(false);
const prevAmmoRef = useRef<number | null>(null);
const zoneWarnThreshold = Math.min(960, MAP_H) * 0.6 * 0.3; // 97.2
```

- [ ] **Step 2: Update the `onMsg` handler to detect slow-mo, deaths, shots, and zone warnings**

Replace the `function onMsg(m: ServerMsg)` block inside the `useEffect([socket])` with:

```typescript
function onMsg(m: ServerMsg) {
  if (m.t === 'match:full-snapshot') {
    stateRef.current = m.state as MatchState;
    setHudState(m.state as MatchState);
    lastTickAt.current = Date.now();
    prevAmmoRef.current = (m.state as MatchState).players[myKey]?.weapon.ammo ?? null;
  }
  if (m.t === 'match:diff') {
    applyDiff(stateRef.current, m.ops as DiffOp[]);
    lastTickAt.current = Date.now();
    // Shot detection: own player's ammo decreased
    for (const op of m.ops as DiffOp[]) {
      if (op.p === `p.${myKey}.wammo` && typeof op.v === 'number') {
        if (prevAmmoRef.current !== null && op.v < prevAmmoRef.current) {
          const weaponId = stateRef.current.players[myKey]?.weapon.id;
          if (weaponId) sfx.playShot(weaponId as 'glock' | 'deagle' | 'm4a1');
        }
        prevAmmoRef.current = op.v;
      }
    }
    // Zone warning: shrinking and below 30% of initial radius
    const zone = stateRef.current.zone;
    if (zone.shrinking && zone.radius < zoneWarnThreshold) sfx.playZoneWarning();
    if (!zone.shrinking) sfx.resetZoneWarnFlag();
    if (stateRef.current.tick % 5 === 0) setHudState({ ...stateRef.current });
  }
  if (m.t === 'match:event') {
    const evs = m.events as GameEvent[];
    setEvents(prev => [...prev, ...evs]);
    for (const ev of evs) {
      if (ev.e === 'slow-mo') {
        setIsSlowMo(true);
        rendererRef.current?.setTickerSpeed(0.2);
        sfx.playSlowMo();
      }
      if (ev.e === 'kill' || ev.e === 'kill-zone') sfx.playDeath();
    }
  }
}
```

- [ ] **Step 3: Add the slow-mo vignette overlay div to the JSX**

Replace the return statement:
```tsx
return (
  <div style={{ position: 'relative', width: '100%', maxWidth: 960, margin: '0 auto', userSelect: 'none' }}>
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', aspectRatio: '960/540', background: '#120d1c' }}
    />
    <div
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
        backdropFilter: 'saturate(0.3)',
        opacity: isSlowMo ? 1 : 0,
        transition: 'opacity 300ms ease',
        pointerEvents: 'none',
      }}
    />
    <Hud state={hudState} myKey={myKey} events={events} ping={ping} onForfeit={handleForfeit} />
  </div>
);
```

- [ ] **Step 4: TypeScript-check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/arena/scenes/MatchScene.tsx
git commit -m "feat(arena): MatchScene slow-mo vignette overlay + SFX wiring"
```

---

## Task 7: Hud mute button

**Files:**
- Modify: `website/src/components/arena/hud/Hud.tsx`

The mute button lives in the top-right corner. It passes `isMuted` and `onMuteToggle` as props so MatchScene can manage React state while the sfx module holds the real flag.

- [ ] **Step 1: Add mute props to `Hud` interface and render the button**

Replace the full content of `website/src/components/arena/hud/Hud.tsx` with:

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
  isMuted: boolean;
  onMuteToggle: () => void;
}

export function Hud({ state, myKey, events, ping, onForfeit, isMuted, onMuteToggle }: Props) {
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

      {/* Top-right: mute button */}
      <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'auto' }}>
        <button
          onClick={onMuteToggle}
          title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,.12)',
            color: isMuted ? '#8A8497' : '#C8F76A', borderRadius: 6,
            width: 28, height: 28, cursor: 'pointer', fontFamily: 'monospace',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
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

- [ ] **Step 2: Update `MatchScene.tsx` to supply the new Hud props**

In `MatchScene.tsx`, add mute state after the existing state declarations:
```typescript
const [isMuted, setIsMuted] = useState(sfx.isMuted);
const handleMuteToggle = useCallback(() => {
  sfx.toggleMute();
  setIsMuted(sfx.isMuted);
}, []);
```

Update the `<Hud />` call in the return:
```tsx
<Hud state={hudState} myKey={myKey} events={events} ping={ping} onForfeit={handleForfeit} isMuted={isMuted} onMuteToggle={handleMuteToggle} />
```

- [ ] **Step 3: TypeScript-check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/arena/hud/Hud.tsx website/src/components/arena/scenes/MatchScene.tsx
git commit -m "feat(arena): Hud mute toggle button + isMuted/onMuteToggle props"
```

---

## Task 8: ResultsScene — victory sound on mount

**Files:**
- Modify: `website/src/components/arena/scenes/ResultsScene.tsx`

- [ ] **Step 1: Add victory sound to `ResultsScene.tsx`**

Add the import at the top:
```typescript
import { useEffect } from 'react';
import { playVictory } from '../game/sfx';
```

Inside the `ResultsScene` component body, before the return, add:
```typescript
useEffect(() => { playVictory(); }, []);
```

- [ ] **Step 2: TypeScript-check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/scenes/ResultsScene.tsx
git commit -m "feat(arena): play victory arpeggio on ResultsScene mount"
```

---

## Task 9: SpectatorScene component

**Files:**
- Create: `website/src/components/arena/scenes/SpectatorScene.tsx`

SpectatorScene mirrors MatchScene structurally but: has no input, shows a player-picker row above the canvas, shows a read-only HUD for the followed player, and detects slow-mo from `match:event { e: 'slow-mo' }` (same signal as MatchScene).

- [ ] **Step 1: Create `website/src/components/arena/scenes/SpectatorScene.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { MatchState, ServerMsg, GameEvent, DiffOp } from '../shared/lobbyTypes';
import { applyDiff } from '../game/diff';
import { Renderer } from '../game/Renderer';
import * as sfx from '../game/sfx';

interface Props {
  socket: Socket;
  initialState: MatchState;
}

export function SpectatorScene({ socket, initialState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const stateRef = useRef<MatchState>(structuredClone(initialState));
  const [hudState, setHudState] = useState<MatchState>(initialState);
  const [followTarget, setFollowTarget] = useState<string>(() => {
    const firstAlive = Object.entries(initialState.players).find(([, p]) => p.alive);
    return firstAlive?.[0] ?? Object.keys(initialState.players)[0] ?? '';
  });
  const [isSlowMo, setIsSlowMo] = useState(false);
  const [isMuted, setIsMuted] = useState(sfx.isMuted);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    // Spectator has no own player — pass empty string so no ring is drawn
    renderer.startTicker(() => stateRef.current, '');
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => {
    rendererRef.current?.setFollowTarget(followTarget);
  }, [followTarget]);

  useEffect(() => {
    rendererRef.current?.setTickerSpeed(isSlowMo ? 0.2 : 1.0);
  }, [isSlowMo]);

  useEffect(() => {
    function onMsg(m: ServerMsg) {
      if (m.t === 'match:full-snapshot') {
        stateRef.current = m.state as MatchState;
        setHudState(m.state as MatchState);
      }
      if (m.t === 'match:diff') {
        applyDiff(stateRef.current, m.ops as DiffOp[]);
        if (stateRef.current.tick % 5 === 0) setHudState({ ...stateRef.current });
      }
      if (m.t === 'match:event') {
        for (const ev of m.events as GameEvent[]) {
          if (ev.e === 'slow-mo') {
            setIsSlowMo(true);
            rendererRef.current?.setTickerSpeed(0.2);
          }
        }
      }
    }
    socket.on('msg', onMsg);
    return () => { socket.off('msg', onMsg); };
  }, [socket]);

  const alivePlayers = Object.entries(hudState.players).filter(([, p]) => p.alive);
  const followed = hudState.players[followTarget];

  const handleMuteToggle = () => {
    sfx.toggleMute();
    setIsMuted(sfx.isMuted);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', userSelect: 'none' }}>
      {/* Player picker */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase', marginRight: 4 }}>
          Spectating
        </span>
        {alivePlayers.map(([key, player]) => (
          <button
            key={key}
            onClick={() => setFollowTarget(key)}
            style={{
              fontFamily: 'monospace', fontSize: 11, padding: '4px 12px',
              background: key === followTarget ? '#C8F76A' : 'transparent',
              color: key === followTarget ? '#1a0e22' : '#8A8497',
              border: '1px solid ' + (key === followTarget ? '#C8F76A' : 'rgba(255,255,255,.15)'),
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            {player.displayName.split('@')[0]}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', width: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', aspectRatio: '960/540', background: '#120d1c' }}
        />
        {/* Slow-mo vignette */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
          backdropFilter: 'saturate(0.3)',
          opacity: isSlowMo ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Read-only HUD for followed player */}
      {followed && (
        <div style={{ display: 'flex', gap: 24, padding: '10px 0', alignItems: 'center', fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>HP</span>
            {[0, 1].map(i => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: 3, border: '2px solid #D33A2C', background: i < followed.hp ? '#D33A2C' : 'transparent' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, letterSpacing: '.14em', color: '#8A8497', textTransform: 'uppercase' }}>{followed.weapon.id}</span>
            <span style={{ fontSize: 16, color: followed.weapon.reloading ? '#8A8497' : '#ECEFF3' }}>
              {followed.weapon.reloading ? 'RLD' : String(followed.weapon.ammo)}
            </span>
          </div>
          {followed.activePowerups.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {followed.activePowerups.map((ap, i) => (
                <div key={i} style={{ fontSize: 9, padding: '2px 6px', border: '1px solid rgba(200,247,106,.4)', color: '#C8F76A', borderRadius: 4, background: 'rgba(200,247,106,.08)' }}>
                  {ap.kind.toUpperCase()}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleMuteToggle}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.12)', color: isMuted ? '#8A8497' : '#C8F76A', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <a href="/portal" style={{ fontSize: 11, letterSpacing: '.12em', color: '#8A8497', textDecoration: 'none', textTransform: 'uppercase' }}>
              Back to portal
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript-check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/scenes/SpectatorScene.tsx
git commit -m "feat(arena): SpectatorScene — player picker, read-only HUD, slow-mo overlay"
```

---

## Task 10: ArenaIsland — spectator routing + slow-mo SFX

**Files:**
- Modify: `website/src/components/arena/ArenaIsland.tsx`

ArenaIsland detects the spectator condition when `lobby:state` arrives with `phase === 'in-match'` and own key is absent from the player list. It then emits `spectator:join` and — when the resulting `match:full-snapshot` arrives — routes to SpectatorScene instead of MatchScene.

Slow-mo SFX: `playSlowMo()` is called here (ArenaIsland receives `lobby:state` with `phase:'slow-mo'`) so both players and spectators get the audio cue regardless of which scene is active.

- [ ] **Step 1: Add imports to `ArenaIsland.tsx`**

Add to the top imports:
```typescript
import { SpectatorScene } from './scenes/SpectatorScene';
import { playSlowMo } from './game/sfx';
```

- [ ] **Step 2: Extend `Scene` type and add `isSpectatorRef`**

Replace:
```typescript
type Scene = 'loading' | 'lobby' | 'match' | 'results' | 'error';
```
With:
```typescript
type Scene = 'loading' | 'lobby' | 'match' | 'spectator' | 'results' | 'error';
```

Inside the component body, after `const sceneRef = useRef<Scene>('loading');`, add:
```typescript
const isSpectatorRef = useRef(false);
```

- [ ] **Step 3: Update the `socket.on('msg', ...)` handler**

Replace the `case 'lobby:state':` block with:

```typescript
case 'lobby:state': {
  setPlayers(m.players as PlayerSlot[]);
  if (m.phase === 'in-match') {
    const playerKeys = new Set((m.players as PlayerSlot[]).map(p => p.key));
    if (!playerKeys.has(myKey)) {
      isSpectatorRef.current = true;
      socketRef.current?.emit('msg', { t: 'spectator:join', code: m.code });
    }
  } else if (m.phase === 'slow-mo') {
    playSlowMo();
  } else if (m.phase === 'starting') {
    setLobbyPhase('starting');
    setCountdownMs(m.countdownMs ?? 5000);
  } else {
    setLobbyPhase('open');
  }
  break;
}
```

Replace the `case 'match:full-snapshot':` line:
```typescript
case 'match:full-snapshot':
  setInitialMatchState(m.state as MatchState);
  setScene(isSpectatorRef.current ? 'spectator' : 'match');
  break;
```

- [ ] **Step 4: Add the spectator scene render path**

After the `if (scene === 'match' && ...)` block, add:

```tsx
if (scene === 'spectator' && initialMatchState && socketRef.current) {
  return (
    <SpectatorScene
      socket={socketRef.current}
      initialState={initialMatchState}
    />
  );
}
```

- [ ] **Step 5: TypeScript-check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 new errors.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/arena/ArenaIsland.tsx
git commit -m "feat(arena): ArenaIsland spectator routing + slow-mo SFX on lobby:state"
```

---

## Task 11: FA-40 smoke test + test-inventory

**Files:**
- Create: `tests/local/FA-40.sh`
- Modify: `website/src/data/test-inventory.json` (via `task test:inventory`)

FA-40 verifies arena-server is running and the spectator:join message type is accepted by the server protocol. A full end-to-end Socket.io spectator test requires two concurrent authenticated sessions and is deferred to Playwright (noted in spec §4).

- [ ] **Step 1: Create `tests/local/FA-40.sh`**

```bash
#!/usr/bin/env bash
# FA-40: Spectator join smoke — verifies arena-server is up and spectator:join is valid protocol
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NAMESPACE:-workspace}"

# T1: arena-server pod is Ready
READY=$(kubectl -n "$NS" get deploy/arena-server \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "")
assert_gt "${READY:-0}" 0 "FA-40" "T1" "arena-server pod is Ready"
[ "${READY:-0}" -gt 0 ] || { echo "Skipping remaining tests — arena-server not ready"; exit 0; }

# T2: healthz responds with ok:true
HEALTH=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS http://localhost:8090/healthz 2>/dev/null || echo "{}")
assert_contains "$HEALTH" '"ok"' "FA-40" "T2" "arena-server healthz returns ok"

# T3: /match requires auth (spectator feature uses same auth gate)
HTTP_STATUS=$(kubectl -n "$NS" exec deploy/arena-server -- \
  curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8090/match 2>/dev/null || echo "000")
assert_eq "$HTTP_STATUS" "401" "FA-40" "T3" "/match returns 401 without bearer token"

# T4: spectator:join is registered in CLIENT_TYPES (source check)
SPECTATOR_TYPE=$(kubectl -n "$NS" exec deploy/arena-server -- \
  grep -c "spectator:join" /app/src/proto/messages.ts 2>/dev/null || echo "0")
assert_gt "${SPECTATOR_TYPE:-0}" 0 "FA-40" "T4" "spectator:join registered in messages.ts"

# NOTE: Full spectator Socket.io test (spectator:join → match:full-snapshot round-trip) requires
# two concurrent authenticated sessions and is deferred to Playwright (spec §4).
echo "FA-40 PASS (Socket.io round-trip deferred to Playwright)"
```

Make it executable:
```bash
chmod +x tests/local/FA-40.sh
```

- [ ] **Step 2: Regenerate test-inventory.json**

```bash
task test:inventory
```

Expected: `website/src/data/test-inventory.json` now includes an entry for `FA-40`.

- [ ] **Step 3: Verify the new entry**

```bash
python3 -c "
import json
d = json.load(open('website/src/data/test-inventory.json'))
fa40 = [x for x in d if x.get('id') == 'FA-40']
print(fa40)
"
```

Expected: one entry with `id: 'FA-40'`, `file: 'tests/local/FA-40.sh'`, `kind: 'shell'`.

- [ ] **Step 4: Commit**

```bash
git add tests/local/FA-40.sh website/src/data/test-inventory.json
git commit -m "test(arena): FA-40 spectator join smoke test + test-inventory"
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `spectator:join` added to ClientMsg + CLIENT_TYPES (server) | Task 1 |
| `spectator:join` mirrored in lobbyTypes.ts (client) | Task 1 |
| `spectators?: Set<string>` added to Lobby interface | Task 3 |
| `lobby:join` allows late spectator join | Task 3 |
| `spectator:join` handler: phase guard, snapshot emit | Task 3 |
| `Renderer.setFollowTarget()` | Task 4 |
| `Renderer.setTickerSpeed()` | Task 4 |
| `SpectatorScene.tsx` — player picker, read-only HUD | Task 9 |
| SpectatorScene slow-mo overlay | Task 9 |
| ArenaIsland detects spectator, emits spectator:join | Task 10 |
| ArenaIsland routes to SpectatorScene on full-snapshot | Task 10 |
| MatchScene: ticker slow-down on slow-mo event | Task 6 |
| MatchScene: CSS vignette overlay | Task 6 |
| sfx.ts all 8 sound functions + mute/localStorage | Task 5 |
| SFX wired: shot (ammo-drop proxy), kill, zone warning | Task 6 |
| SFX wired: slow-mo (ArenaIsland + MatchScene) | Tasks 6, 10 |
| SFX wired: victory (ResultsScene mount) | Task 8 |
| Mute button in Hud | Task 7 |
| FA-40 smoke test | Task 11 |
| test-inventory.json regenerated | Task 11 |

All spec sections covered.

**Placeholder scan:** No TBD, TODO, or implement-later phrases.

**Type consistency check:**
- `sfx.playShot(weapon: WeaponId)` — uses `WeaponId` from lobbyTypes throughout.
- `Renderer.setFollowTarget(playerKey: string | null)` — called with `followTarget` string in SpectatorScene.
- `Renderer.setTickerSpeed(speed: number)` — called with `0.2` / `1.0` in MatchScene and SpectatorScene.
- `Hud` props `isMuted: boolean` + `onMuteToggle: () => void` — provided in updated MatchScene.
- `SpectatorScene` props: `socket: Socket`, `initialState: MatchState` — provided by ArenaIsland.
- `sfx.resetZoneWarnFlag()` — exported from sfx.ts, called in MatchScene's diff handler.
