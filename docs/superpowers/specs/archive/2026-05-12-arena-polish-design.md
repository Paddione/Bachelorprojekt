# Arena — Polish Pass (Plan 2c of 3) Design

**Date:** 2026-05-12  
**Status:** Approved  
**Follows:** Plan 2b (Game Client, PR #675)

## Goal

Add the three remaining features from the original arena vision: spectator mode (late-joiners can watch an ongoing match), slow-mo visual (client-side ticker slowdown + vignette on match end), and synthesized SFX (Web Audio API, zero extra assets).

---

## 1. Spectator Mode

### Server changes

**`arena-server/src/proto/messages.ts`**  
Add `{ t: 'spectator:join'; code: string }` to the `ClientMsg` union. The existing `spectator:follow` stays in the union but remains a no-op on the server (client resolves camera target locally from the full state).

Update `CLIENT_MSG_TYPES` guard to include `'spectator:join'`.

**`arena-server/src/lobby/registry.ts`**  
Add `spectators?: Set<string>` to the `Lobby` interface.

**`arena-server/src/ws/handlers.ts`**  
Add `spectator:join` case:
1. Look up lobby by `m.code`.
2. If phase is not `'in-match'` or `'slow-mo'`, emit an error and return.
3. Add socket to `lobby:{code}` room.
4. Initialize `lobby.spectators` if absent, add `key` to it.
5. Emit a `match:full-snapshot` of the current tick state to the socket directly (not broadcast).

### Client changes

**`website/src/components/arena/shared/lobbyTypes.ts`**  
Mirror `spectator:join` in `ClientMsg` union and `CLIENT_MSG_TYPES` guard.

**`website/src/components/arena/ArenaIsland.tsx`**  
In the lobby-state change handler, detect the spectator entry condition:  
- `lobbyState.phase === 'in-match'` AND own key is not in `Object.keys(lobbyState.players)` → set scene to `'spectator'`.  
On scene = `'spectator'`, emit `{ t: 'spectator:join', code: lobbyState.code }`.

**`website/src/components/arena/scenes/SpectatorScene.tsx`** *(new)*  
- Mounts `Renderer.ts` with a `followTarget` prop (initially the first alive player key).
- Player-picker row above the canvas: one chip per alive player, clicking sets `followTarget`.
- Read-only HUD: shows HP, ammo, and active powerups of the followed player.
- No WASD/mouse input listeners.
- "Back to portal" link.
- Receives `match:diff` and `match:full-snapshot` events from `ArenaIsland` via props (same pattern as `MatchScene`).
- Also handles the `slow-mo` phase: applies the same vignette overlay and ticker slowdown as `MatchScene` (share the overlay as a component or duplicate the 10-line CSS block).

**`website/src/components/arena/game/Renderer.ts`**  
Add `setFollowTarget(playerKey: string | null)`: when set, the camera offset tracks that player's position each frame instead of the local player. No other changes.

---

## 2. Slow-mo Visual

**`website/src/components/arena/scenes/MatchScene.tsx`**  
Watch for `phase` prop changing to `'slow-mo'`:
- Call `renderer.app.ticker.speed = 0.2`.
- Set a React state flag `isSlowMo = true` to render the overlay.
- On `phase` changing to `'results'` (or any non-slow-mo value), set ticker speed back to `1.0` and `isSlowMo = false`.

Overlay div (absolute-positioned over canvas, pointer-events none):
```css
background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%);
backdrop-filter: saturate(0.3);
opacity: 0 → 1 over 300ms CSS transition;
width: 100%; height: 100%; position: absolute; top: 0; left: 0;
```

No server changes needed.

---

## 3. SFX Synthesis

**`website/src/components/arena/game/sfx.ts`** *(new)*

Singleton module with a lazy-initialized `AudioContext`. All sounds are synthesized:

| Function | Sound design |
|---|---|
| `playShot('pistol')` | 100ms white-noise burst through a 2 kHz bandpass filter, fast decay |
| `playShot('shotgun')` | 150ms noise burst at 400 Hz, rumble envelope |
| `playShot('sniper')` | 40ms sharp transient, 8 kHz highpass click |
| `playMelee()` | 80ms noise burst, 200 Hz bandpass, soft thud envelope |
| `playDeath()` | 400ms descending sawtooth: 300 → 80 Hz, amplitude ramps down |
| `playZoneWarning()` | 300ms two-tone pulse (440 + 880 Hz sine), called when zone radius < 30% of initial |
| `playSlowMo()` | 600ms noise swept from 200 → 80 Hz via `frequency.linearRampToValueAtTime` |
| `playVictory()` | 800ms: C4 → E4 → G4 three-note sine arpeggio, 200ms each + 200ms sustain |

State:
- `isMuted: boolean` — initialized from `localStorage.getItem('arena:sfx:muted') === 'true'`
- `toggleMute()` — flips `isMuted`, persists to localStorage
- All `play*` functions are no-ops when `isMuted`

**Wire-up:**

| Location | Trigger | Sound |
|---|---|---|
| `ArenaIsland.tsx` | Own player input fire=true | `playShot(weapon.id)` |
| `ArenaIsland.tsx` | Own player input melee=true | `playMelee()` |
| `ArenaIsland.tsx` | `lobbyState.phase` → `'slow-mo'` | `playSlowMo()` |
| `MatchScene.tsx` | `match:event` with `e: 'kill'` | `playDeath()` |
| `MatchScene.tsx` | zone `shrinking === true` && radius drops below `ZONE_INITIAL_RADIUS * 0.3` (initial = `Math.min(MAP_W, MAP_H) * 0.6`) | `playZoneWarning()` (debounced — once per shrink cycle) |
| `ResultsScene.tsx` | component mount | `playVictory()` |
| `Hud.tsx` | mute toggle button | `sfx.toggleMute()` |

**Mute button** (`Hud.tsx`): speaker icon in the top-right of the HUD overlay. Uses SVG inline icon (🔊 / 🔇 approximation via CSS). Reflects `sfx.isMuted`.

---

## 4. Testing

**`tests/local/FA-40.sh`** — Spectator join smoke:  
Verifies arena-server is up (`/healthz`), posts a lobby open (skips if no open lobby), then checks that a `spectator:join` over Socket.io returns a `match:full-snapshot`. Uses the existing auth test token from FA-39.

**`website/src/data/test-inventory.json`** — Regenerate with `task test:inventory` after adding FA-40.

No Playwright test for spectator (requires two simultaneous authenticated sessions — deferred to a future plan).

---

## 5. File Map

**Create:**
- `arena-server/src/` — no new files; changes to `proto/messages.ts`, `lobby/registry.ts`, `ws/handlers.ts`
- `website/src/components/arena/scenes/SpectatorScene.tsx`
- `website/src/components/arena/game/sfx.ts`
- `tests/local/FA-40.sh`

**Modify:**
- `arena-server/src/proto/messages.ts`
- `arena-server/src/lobby/registry.ts`
- `arena-server/src/ws/handlers.ts`
- `website/src/components/arena/shared/lobbyTypes.ts`
- `website/src/components/arena/ArenaIsland.tsx`
- `website/src/components/arena/scenes/MatchScene.tsx`
- `website/src/components/arena/game/Renderer.ts`
- `website/src/components/arena/hud/Hud.tsx`
- `website/src/data/test-inventory.json`

---

## 6. Out of Scope

- Multi-spectator analytics / spectator count display
- Chat in spectator mode
- Spectator mode for `slow-mo` phase (spectators who join during slow-mo see a frozen frame — acceptable for this plan)
- SFX for item pickups and powerups (stretch — can add later)
