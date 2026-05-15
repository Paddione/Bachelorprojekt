# Brett Mayhem Mode — Design

**Status:** approved
**Date:** 2026-05-15
**Component:** brett

## Goal

Add a per-room "Mayhem mode" to Brett (the 3D Systembrett at `brett.mentolder.de` / `brett.korczewski.de`) that lets each connected user control their own avatar, run around the plane, flail arms to ragdoll other players on collision, and spawn a vehicle that drives across the board ragdolling whoever it hits. Existing Aufstellung use-case must remain untouched when mayhem is off.

## Non-goals

- No physics engine dependency (Rapier/Cannon). Brett's existing spring-based bones cover ragdoll.
- No persistence of player avatars or vehicles in `brett_rooms` — purely ephemeral session state.
- No anti-cheat. Brett rooms are token-gated; trust model matches existing `move`/`update`/`optik` mutations.
- No driveable vehicle (autonomous straight-line traversal only).
- No new player-avatar customization — avatars reuse the existing `makeMannequin` rig with a randomized color so players are visually distinguishable.

## User-facing behavior

### Activation

- New toolbar button: **"Mayhem-Modus"** (icon + label). Pressing it broadcasts a `mayhem_mode` toggle to every client in the room.
- When ON:
  - A banner appears at top of canvas: "🤸 Mayhem-Modus aktiv — WASD/Maus zum Steuern, F flailen, V Fahrzeug, M zum Beenden".
  - Each connected client spawns one **player avatar** at a random spot on the edge of the plane.
  - Camera switches from orbit to **chase** (3 m behind, 1.5 m up, follows avatar yaw).
  - Existing Aufstellung figures remain placed and visible but do **not** collide with avatars or vehicles — they are inert props.
- When OFF:
  - Avatars despawn, vehicles clear, ragdolls reset.
  - Camera returns to orbit. Aufstellung state preserved unchanged.

### Controls (active only while mayhem ON)

| Key / Input | Action |
|---|---|
| WASD | Walk in direction relative to camera yaw |
| Shift (held) | Sprint (1.6× speed) |
| Space | Small hop (gravity pulls back down) |
| Mouse (after canvas click) | Pointer-lock yaw/pitch; camera follows |
| Esc | Release pointer lock |
| F (held) **or** LMB (held) | Flail arms — large random oscillation, wrist hitboxes active |
| V | Spawn a vehicle (5 s per-player cooldown) |
| Toolbar "Mayhem" button | Toggle the mode off (same as toggle on) |

### Avatar state machine

```
idle ──WASD──> running ──hold F──> flailing
  ▲              │                    │
  │              └── released F ──────┘
  │                                    
  └── hit by flail / vehicle ──> ragdoll (3 s) ──> recovering (0.4 s stand-up) ──> idle
```

- `idle`: zero velocity, neutral pose.
- `running`: walk cycle drives leg/arm bone targets in the existing spring system.
- `flailing`: arm bone targets jitter randomly each frame (±90° on shoulder, ±60° on elbow). Wrist hitboxes are checked for collisions against other avatars' torso-capsules.
- `ragdoll`: all bone spring targets cleared; per-bone gravity + angular damping integrates them toward downward limp. Avatar root falls under gravity until hips reach `y = 0.2` (lying on plane). Input ignored.
- `recovering`: 0.4 s tween from current bone rotations back to neutral, root y-position lerps to standing 1.0. Then returns to `idle`.

### Vehicle behavior

- Single preset: a chunky **shopping cart** (box geometry, grey, ~1.5 × 1.0 × 1.0 m).
- Spawned via `V` key. Spawn position: chosen by the spawning client — perpendicular to the player's facing direction, starting on the far plane edge.
- Constant velocity 6 m/s along a fixed axis. No steering, no friction.
- Despawns when it crosses past the opposite edge (~10 m past origin, configurable).
- Per-player cooldown 5 s (client-enforced; not server-side).
- Vehicle AABB checked against all player-avatar torso-capsules per frame. Intersection → fires `hit` with `source: 'vehicle'` and impulse along the vehicle's travel vector.

### Collision & ragdoll details

- **Player capsule:** vertical capsule, radius 0.35 m, height 1.8 m, centered on the avatar root.
- **Flail wrist hitbox:** sphere radius 0.18 m attached to each wrist bone (`lWrist`, `rWrist`). Only active while `flailing`.
- **Vehicle hitbox:** axis-aligned bounding box from vehicle geometry, expanded by 0.1 m.
- Hitter-authoritative: the client whose flail/vehicle caused the intersection fires `hit`. Victim accepts unconditionally.
- Hit impulse: flail → magnitude 4 m/s in the direction from hitter to victim; vehicle → magnitude 12 m/s along vehicle velocity vector. Impulse seeds the ragdoll's initial root velocity and applies angular kick to spine.
- Ragdoll duration: 3 s fixed. Recovery animation 0.4 s. Total knock-out 3.4 s.

## Architecture

### Client-side (`brett/public/index.html` + new modules)

The existing `index.html` is 1 000 lines and growing. Extract Mayhem into new modules so the existing Aufstellung code stays untouched:

```
brett/public/assets/
├── mayhem/
│   ├── mayhem.js          # Mode entry point, toggle, banner, lifecycle
│   ├── player-avatar.js   # PlayerAvatar class, state machine, controls
│   ├── vehicle.js         # Vehicle class, spawn + travel
│   ├── physics.js         # capsule-capsule, AABB-capsule, ragdoll integration
│   └── chase-camera.js    # Third-person chase + pointer-lock
```

`index.html` gets:
- A `<script>` tag loading `mayhem.js` (vanilla ES module, no bundler — Brett doesn't bundle today).
- One new toolbar button.
- A small init hook that calls `Mayhem.init({ scene, makeMannequin, ws, roomToken })`.

`mayhem.js` exposes `Mayhem.init`, `Mayhem.setEnabled(bool)`, `Mayhem.onSnapshot(snapshot)`, `Mayhem.onMessage(msg)` so the existing WS handler in `index.html` can dispatch new message types to it without entangling Aufstellung logic.

### Server-side (`brett/server.js`)

Three small changes:

1. **Add to relay allowlist** (line ~392): extend the `['add','move','update','delete','clear','optik','stiffness']` list with `'mayhem_mode'`, `'player_join'`, `'player_state'`, `'player_leave'`, `'hit'`, `'vehicle_spawn'`.
2. **Persist only `mayhem_mode`**: add a case in `applyMutation` storing the flag as a `__mayhem__` special figure (mirroring `__optik__`).
3. **Include in snapshot**: `buildStateFromMutations` reads `__mayhem__` and adds `mayhem: bool` to the snapshot payload.

Player/vehicle/hit messages are **pure relay** — server does not parse, store, or replay them. They are dropped if the room has no recipients.

### Protocol

| Type | Direction | Payload | Notes |
|------|-----------|---------|------|
| `mayhem_mode` | C→S→broadcast + persist | `{type, enabled: bool}` | Persisted in `brett_rooms.state.__mayhem__` |
| `player_join` | C→S→broadcast | `{type, playerId, color}` | Sent on local player spawn |
| `player_state` | C→S→broadcast | `{type, playerId, x, y, z, yaw, anim, flailing}` | 15 Hz from controlling client |
| `player_leave` | C→S→broadcast | `{type, playerId}` | On disconnect or mode off |
| `hit` | C→S→broadcast | `{type, victimId, source, impulse: {x,z}, durationMs}` | Hitter-authoritative |
| `vehicle_spawn` | C→S→broadcast | `{type, vehicleId, kind, fromX, fromZ, dirX, dirZ, speed, spawnedAt}` | Each receiver runs vehicle locally |

`playerId` is a `crypto.randomUUID()` generated client-side at mayhem entry. `vehicleId` likewise.

### Rendering & physics loop

Existing Brett render loop already runs an `update(dt)` over `STATE.figures`. Add:

- Local player avatar update (input → velocity → root position → animation state).
- Remote player avatar interpolation (lerp toward latest `player_state` payload over 100 ms).
- Active vehicles: integrate position by `velocity * dt`; remove when past edge.
- Collision pass: for each local-controlled hitbox (own flail wrists, own vehicles), test against every other avatar's torso capsule. On hit, fire `hit` message (debounced 200 ms per (hitter, victim) pair to avoid spam).
- Ragdoll integration: when an avatar is in `ragdoll`, integrate root y under gravity (−9.8 m/s²), apply angular damping (0.92 per frame) to each bone's currentRot, ignore targetRot.

## Edge cases & failure modes

- **Multiple users toggle mayhem in the same second:** `mayhem_mode` is last-write-wins (existing pattern for `__optik__`). Final broadcast is the truth; clients re-sync on any received `mayhem_mode`.
- **Player joins room while mayhem is already ON:** snapshot includes `mayhem: true`, client spawns its avatar at a random edge, broadcasts `player_join`. Existing avatars become known via incoming `player_state` packets within 100 ms.
- **Player disconnects without sending `player_leave`:** server-side close handler (existing path) needs to be extended to broadcast `player_leave` for that ws's `_playerId` if set. Clients prune avatars that haven't sent `player_state` for >5 s as a fallback.
- **Vehicle spawned just before mode toggles OFF:** when receiving `mayhem_mode: false`, client clears all vehicles immediately even if mid-traversal.
- **Two flail wrists hit at the same instant:** only the first hit per (hitter, victim) within 200 ms registers; second is dropped client-side.
- **Avatar collides with placed Aufstellung figure:** no effect — Aufstellung figures are inert in mayhem mode. They don't appear in the avatar collision list.

## Testing

- **Unit (new — `brett/test/physics.test.js`):** capsule-capsule intersection, AABB-capsule intersection, ragdoll bone-gravity decay (single-frame correctness). Use node's built-in `node --test`. Brett currently has no test runner — `package.json` gets a `"test": "node --test test/"` script.
- **E2E:** deferred. Visual mechanics need eyes-on QA in the dev cluster (`dev.mentolder.de` Brett endpoint after deploy).
- **CI:** `task test:all` is unaffected (no manifest changes). Add a smoke test step that runs `cd brett && node --test test/` after the existing arena tests if time permits — otherwise tracked as follow-up.

## Out of scope (explicit follow-ups)

- Customizable avatar appearance (uses existing figure-pack faces/bodies — future ticket).
- Vehicle picker UI (4 vehicle types) — covered in approved option as future variant.
- Driveable vehicles — future ticket.
- Persistent leaderboard / hit counter — future ticket.
- Mobile/touch controls — future ticket.
- Server-side hit validation (anti-cheat) — future ticket; needed only if abuse appears.

## Risks

- **Frame-rate dependent collisions:** at low FPS, fast vehicle could tunnel through avatar. Mitigate by sub-stepping the vehicle integration (2 sub-steps per frame) and using a swept AABB for the collision pass.
- **Network jitter in player_state at 15 Hz** causes visible avatar stutter. Mitigate with 100 ms interpolation buffer (already in design).
- **Pointer-lock UX:** users may not realize Esc releases it. Banner explicitly mentions it.
- **Existing Aufstellung user accidentally toggles mayhem:** acceptable — banner is large, single button click reverts. No data lost (figures preserved).
