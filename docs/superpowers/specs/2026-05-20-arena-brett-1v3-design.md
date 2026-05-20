# Arena 1v3 + Brett Co-op Waves — Design Spec

## Overview

Two new game modes deployed to their respective clusters:

- **Arena 1v3** — korczewski: host plays solo against 3 AI bots; real players can join and displace bots, converting to FFA
- **Brett Co-op Waves** — mentolder: up to 3 human players cooperate against 10 waves of AI enemies (mid-boss at W5, final boss at W10)

---

## Arena 1v3 (korczewski)

### Concept

Underdog mode — identical stats for all players, pure skill. Host opens a 1v3 lobby; 3 bots fill immediately. Real players can join at any time, displacing bots one-for-one. When all 3 bot slots are filled by real players the match becomes standard FFA with no further distinction.

### Protocol Changes

**`arena-server/src/proto/messages.ts`** — bump `PROTOCOL_VERSION` to `2`:
- `ClientMsg` `lobby:open` gains optional `mode?: 'ffa' | 'one-v-three'` (default `'ffa'`)
- Lobby state broadcast includes `mode: 'ffa' | 'one-v-three'`

**`arena-server/src/lobby/registry.ts`**:
- Remove `solo?: boolean`
- Add `mode: 'ffa' | 'one-v-three'`

**`website/src/components/arena/shared/lobbyTypes.ts`** — mirror the same `mode` field (CI diff-guard enforces sync).

### Win-Condition Logic (`lifecycle.ts`)

| Mode | Opponents | Match ends when | Winner |
|---|---|---|---|
| `one-v-three` | 3 bots | Host eliminated | Bots |
| `one-v-three` | 3 bots | All 3 bots eliminated | Host 🏆 |
| `one-v-three` → FFA | Any real player has joined | Last survivor | Standard FFA |

"Any real player joined" switches the win-condition immediately and permanently for that match — there is no revert back to 1v3 semantics even if the real player disconnects.

### Bot Fill Behaviour

No change to `botfill.ts`. Existing behaviour already:
- Fills slots up to 4 when host is alone
- Retires one bot when a real player joins (`// Retire one bot to make room for the real player`)

1v3 mode uses this as-is.

### UI Changes

**`website/src/components/arena/LobbyScreen.svelte`**:
- Lobby-open screen gains a two-state toggle: **"1v3 vs Bots"** (default) / **"FFA"**
- Selected mode is passed to `lobby:open` message

**`website/src/components/arena/HUD.svelte`**:
- When `mode === 'one-v-three'` and all opponents are bots: show small badge **"1v3"**
- When real players have joined: badge disappears (standard FFA HUD)

### Affected Files

```
arena-server/src/proto/messages.ts          PROTOCOL_VERSION 1→2, mode type
arena-server/src/lobby/registry.ts          mode field (replaces solo?)
arena-server/src/lobby/lifecycle.ts         open() accepts mode, win-condition branch
website/src/components/arena/shared/lobbyTypes.ts   mirror mode field (CI-sync)
website/src/components/arena/LobbyScreen.svelte     mode toggle
website/src/components/arena/HUD.svelte             1v3 badge
```

---

## Brett Co-op Waves (mentolder)

### Concept

3 human players cooperate against 10 waves of AI enemies. Waves 1–4 and 6–9 are normal bots (count ramps up). Wave 5 is a mid-boss (3× HP, faster). Wave 10 is the final boss (6× HP, faster, visually larger). Players do not respawn mid-wave; all dead players respawn between waves. If all humans die mid-wave it is `coop_lose`. Surviving all 10 waves is `coop_win`.

### Wave Definitions

| Wave | Type | Enemy count | Boss multipliers |
|---|---|---|---|
| 1 | Normal | 2 | — |
| 2 | Normal | 3 | — |
| 3 | Normal | 3 | — |
| 4 | Normal | 4 | — |
| 5 | **Mid-boss** | 1 | HP×3, shoot rate×1.5, speed×1.2 |
| 6 | Normal | 3 | — |
| 7 | Normal | 4 | — |
| 8 | Normal | 4 | — |
| 9 | Normal | 5 | — |
| 10 | **Final boss** | 1 | HP×6, shoot rate×2, speed×1.3, scale×1.5, red tint |

### Game-Mode State Machine (`game-mode.js`)

New constant: `COOP: 'coop'` added to `MODES`.

`GameModeManager` gains wave state:
```
_wave: 0            // current wave (0 = not started)
_enemiesAlive: Set  // bot IDs still alive this wave
_phase: 'idle' | 'in-wave' | 'between' | 'won' | 'lost'
```

Public API additions:
- `startCoop()` — sets phase to `in-wave`, emits `wave_start {wave:1}` — called automatically by the host client 3 s after `game_mode_change { mode: 'coop' }` is received (same pattern as LMS; non-host clients wait for the relayed `wave_start` from the server)
- `handleEnemyDeath(botId)` — removes from `_enemiesAlive`; if empty → emits `wave_complete`
- `handlePlayerDeath(playerId)` — adds to `_deadPlayers`; checks if all human IDs are in `_deadPlayers` → emits `coop_lose`
- `_advanceWave()` — 3 s pause, emits `wave_start` for next wave (triggering respawn callback for each entry in `_deadPlayers`, then clears it)

### Server Changes (`server.js`)

Add to `RELAY_TYPES`:
```
'wave_start', 'wave_complete', 'coop_win', 'coop_lose'
```

Add `'coop'` to the allowed-modes list in `admin_mode_set` validation:
```js
if (!['warmup','deathmatch','lms','coop'].includes(msg.mode)) return;
```

Add per-room `coopWave: number` (default 0) to room state, updated on each `wave_start` relay — used to inform reconnecting players of the current wave.

### AI Bot Changes (`ai-bot.js`)

**Team targeting:** `MayhemAIBot.tick()` receives a `teamMode` flag when `gameMode === 'coop'`. When set, `_findNearest()` filters `allAvatars` to human-controlled avatars only — human IDs do **not** start with `bot-` (existing ID convention). Bot IDs always match `/^bot-/`.

**Boss option:** Constructor accepts `bossMultiplier?: { hp: number; shootRate: number; speed: number; scale: number }`. When provided:
- `this._hp = BASE_HP * bossMultiplier.hp` — `_hp` is a new instance field (not previously tracked; normal bots are one-shot in the current LMS mode, but bosses need multi-hit tracking)
- `BOT_SHOOT_RATE` overridden locally by `bossMultiplier.shootRate`
- `BOT_SPEED` overridden locally by `bossMultiplier.speed`
- `mannequin.root.scale.setScalar(bossMultiplier.scale)` called immediately after spawn

### Mayhem Changes (`mayhem.js`)

**Friendly fire:** In projectile hit-detection, if `gameMode === 'coop'` and both shooter and target IDs do **not** match `/^bot-/` (i.e. both are human), skip damage.

**Wave spawning:** `spawnWave(waveDef)` replaces the single `spawnAIBot` loop:
- Reads `waveDef.count`, `waveDef.boss` flag, `waveDef.bossMultiplier`
- Passes `bossMultiplier` to `MayhemAIBot` when spawning boss
- Registers spawned bot IDs with `GameModeManager._enemiesAlive`

**Dead-player tracking:** `mayhem.js` maintains a `Set<string> deadHumans` — players added on death, cleared on wave start. `GameModeManager.handlePlayerDeath()` receives the player ID from this set.

**Between-wave respawn:** On `wave_complete` relay received, after 3 s: iterate `deadHumans`, call `onRespawn(id)` for each (existing respawn callback), then clear `deadHumans`.

### HUD Changes (`index.html`)

New co-op HUD element (hidden by default, shown when `mode === 'coop'`):
- **Wave counter:** "WELLE 7 / 10" — updates on `wave_start`
- **Enemy counter:** "Feinde: 3" — decrements on each enemy death
- **Boss HP bar:** visible only during wave 5 and wave 10; tracks boss HP as percentage

### Affected Files

```
brett/public/assets/mayhem/game-mode.js     COOP mode + wave state machine
brett/public/assets/mayhem/ai-bot.js        bossMultiplier + team-targeting
brett/public/assets/mayhem/mayhem.js        wave spawning + friendly-fire check + respawn
brett/public/index.html                     co-op HUD section
brett/server.js                             RELAY_TYPES + coop mode validation + coopWave state
```

---

## Testing

### Arena 1v3
- Open a `one-v-three` lobby → verify 3 bots spawn
- Kill all 3 bots → verify host-wins result screen
- Die as host → verify immediate game-over (not "waiting for last survivor")
- Join as real player → verify bot is displaced, mode shows FFA
- All 3 real players join → verify standard FFA win condition

### Brett Co-op
- Set mode `coop`, start → wave 1 spawns 2 bots
- Kill all → wave_complete fires, 3s pause, wave 2 spawns 3 bots
- Die mid-wave → no respawn until wave ends
- All humans die → coop_lose fires
- Complete all 10 waves → coop_win fires
- Wave 5 boss → verify HP×3, faster shooting, standard bot at wave 6
- Wave 10 boss → verify HP×6, scale×1.5, red tint
- Friendly fire: human shoots human → no damage
- Reconnect mid-wave → coopWave state restored from server

## Deployment

- Arena 1v3: `task feature:arena` (builds + deploys arena-server to korczewski; website deploys via `task feature:website`)
- Brett Co-op: `task feature:brett` (builds + deploys brett to both clusters; co-op only surfaced on mentolder via mode availability in admin UI — no korczewski-specific gating needed at this stage)
