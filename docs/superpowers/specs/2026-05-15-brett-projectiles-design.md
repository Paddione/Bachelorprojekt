# Brett Projectiles & Combat System — Design Spec

Date: 2026-05-15  
Branch: feature/brett-projectiles  
Status: approved

## Overview

Extends the Systembrett Mayhem mode with a full combat system: five weapons (three ranged, two melee), blood and fire FX, a victim-authoritative HP system, cover obstacles, and three game modes (Warmup, Deathmatch, Last Man Standing).

---

## Architecture

### New Files

| File | Responsibility |
|---|---|
| `brett/public/assets/mayhem/weapons.js` | Weapon definitions, fire logic, cooldown tracking, keybindings 1–5 |
| `brett/public/assets/mayhem/projectiles.js` | Projectile movement, hit-detection vs. players and obstacles, despawn |
| `brett/public/assets/mayhem/effects.js` | Blood splat decals, fire particles, katana swoosh, floating HP bars, HUD |
| `brett/public/assets/mayhem/obstacles.js` | Obstacle layout generation, AABB collision for projectiles and player movement |
| `brett/public/assets/mayhem/game-mode.js` | Mode state machine (warmup/deathmatch/lms), respawn logic, kill counter, LMS win condition |

### Modified Files

| File | Change |
|---|---|
| `mayhem.js` | Init/tick/message-route for all new modules |
| `player-avatar.js` | Add `hp`, `applyDamage()`, `isDead`, Death state; fix leg anim speed |
| `physics.js` | Add missing `integrateRagdollRoot` + `integrateRagdollBone` (latent bug) |
| `server.js` | Relay new message types; add LMS alive-tracking per room |
| `index.html` | 5 new `<script>` tags, HUD `<div>`, weapon display, mode toggle button |

### Script Load Order (index.html)

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

---

## Weapons

### Ranged Weapons

| # | Weapon | Damage | Cooldown | Projectile Speed | Special |
|---|---|---|---|---|---|
| 1 | Handgun | 35 HP | 600 ms | 18 u/s | Single shot |
| 2 | Rifle | 20 HP × 3 | 120 ms between shots, 900 ms after burst | 22 u/s | 3 sequential projectiles |
| 3 | Fireball | 15 HP impact + 5 HP/s × 4 s | 1200 ms | 10 u/s | Sets target on fire 4 s; slight gravity arc (`vy -= 2.0 * dt`) |

### Melee Weapons

| # | Weapon | Damage | Swing | Range | Special |
|---|---|---|---|---|---|
| 4 | Club (Keule) | 55 HP | 500 ms windup, single wide arc | 1.5 m | Large knockback impulse (like vehicle) |
| 5 | Katana | 25 HP | 150 ms fast slash | 2.0 m | 2 rapid slashes possible; slash-swoosh FX |

### Controls

- Keys `1`–`5`: select weapon (replaces flail-as-fire; flail stays on `F`)
- Left mouse click: fire/swing active weapon
- Active weapon shown in HUD (icon + name, all 5 slots visible)

### Projectile Simulation

- Runs only on shooter's client (no `shoot` broadcast — only `hit` is sent)
- Each tick: advance position by `dir * speed * dt`, check capsule overlap for all players and AABB for obstacles
- Despawn after 30 m travel or on hit
- Fireball: `vy -= 2.0 * dt` gravity

---

## FX System (`effects.js`)

### Blood Splat

- On any hit: spawn a `THREE.Mesh` with `blood-splat.png` as a flat decal dropped onto the ground plane
- Random rotation from 4 variants; 6 s lifetime with CSS-style fade-out via `material.opacity`
- Max 40 simultaneous decals (oldest removed first)

### Fire Effect

- On Fireball hit: attach 8–12 `THREE.Sprite` particles (from `fire-sprite.png`) to victim's root
- Particles follow victim position for 4 s burn duration
- `fire-loop.ogg` plays as spatial loop and stops when burn ends
- Burn tick: `applyDamage(5)` every 1 s for 4 s via counter in `tick()`

### Katana Swoosh

- 150 ms Billboard mesh with `slash-arc.png`, oriented in player facing direction
- Fades out linearly over 150 ms

### Muzzle Flash (optional)

- 80 ms sprite at weapon barrel position if `muzzle-flash.png` asset is present; skipped otherwise

### Floating HP Bars

- `THREE.Sprite` above each mannequin head (y + 2.2)
- Canvas-rendered texture: 60 × 8 px bar, green → yellow → red based on HP
- Updated whenever `hp_update` received or own HP changes
- Hidden for dead players

### HUD

- Fixed `<div>` bottom-left, always visible during Mayhem
- Own HP bar (full width, color-coded)
- 5 weapon slot icons in a row, active slot highlighted
- Deathmatch kill counter top-right
- LMS alive count top-right

---

## HP System

### Data Flow (Victim-Authoritative)

```
Shooter detects hit (projectile or melee arc)
  → send { type: 'hit', victimId, damage, weaponType, impulse }
  → server relays to all clients

Victim's client receives 'hit'
  → avatar.applyDamage(damage)
  → send { type: 'hp_update', playerId, hp }
  → if hp <= 0: send { type: 'player_death', playerId, killerId }

All clients receive 'hp_update'
  → update floating HP bar for that player
```

### PlayerAvatar Changes

```js
this.hp = 100;

applyDamage(amount) {
  if (this.isDead) return;
  this.hp = Math.max(0, this.hp - amount);
}

get isDead() { return this.hp <= 0; }
```

- `applyHit()` (existing) remains for ragdoll physics; `applyDamage()` is separate
- `hp` reset to 100 on respawn

---

## Obstacles (`obstacles.js`)

### Layout Generation

- First player to join a room generates layout using `roomToken` as PRNG seed (deterministic)
- Broadcasts `obstacle_layout` — latecomers receive it and replicate exactly
- All clients build identical obstacle sets

### Obstacle Types and Count

| Type | Count | Size (w×h×d) | Asset |
|---|---|---|---|
| Pillar | 4–6 | 0.6 × 2.0 × 0.6 | `pillar.glb` / CylinderGeometry fallback |
| L-Wall | 2 | 2.0 × 1.5 × 0.4 | `wall-l.glb` / two BoxGeometry fallback |
| Crate | 4–5 | 0.9 × 0.9 × 0.9 | `crate.glb` / BoxGeometry fallback |
| Barrel | 2–3 | 0.5 × 1.0 × 0.5 | `barrel.glb` / CylinderGeometry fallback |

- Placed within 8 × 8 m play area with minimum 1.5 m clearance between objects and from spawn edges
- Fallback geometry used when `.glb` not present (same AABB, placeholder color)

### Collision

- **Projectiles**: AABB check in `projectiles.js` per tick; hit obstacle → despawn projectile (no damage to obstacle)
- **Player movement**: push-out if player capsule overlaps obstacle AABB (applied in `obstacles.js` after position update)

---

## Game Modes (`game-mode.js`)

### Mode Selection

- Button next to Mayhem button in UI: cycles Warmup → Deathmatch → LMS
- Broadcasts `game_mode_change` — all clients switch simultaneously

### Warmup (default)

- Death → ragdoll → banner: **"[R] Respawn"**
- Player presses R → `player_respawn` sent → respawn at random edge, hp = 100
- No score tracking

### Deathmatch

- Death → 3 s ragdoll → auto-respawn at random edge, hp = 100
- Kill counter per player shown in HUD (top-right)
- No win condition (free-play)

### Last Man Standing (LMS)

- Death → eliminated; no respawn
- Server tracks `lms_alive` Set per room (added to `server.js` room state)
- On `player_death`: server removes victim from `lms_alive`, checks count
  - If 1 remaining: broadcast `lms_winner { playerId }`
  - If 0 remaining (simultaneous deaths): broadcast `lms_draw`
- Eliminated players: camera switches to follow a random surviving player (spectator cam)
- Winner sees full-screen banner; new round starts when mode is toggled off/on

---

## New Message Types

All messages relay through server unchanged, except LMS logic.

| Type | Sender | Fields |
|---|---|---|
| `hit` (extended) | Shooter | `victimId, damage, weaponType, impulse, killerId?` |
| `hp_update` | Victim | `playerId, hp` |
| `player_death` | Victim | `playerId, killerId` |
| `player_respawn` | Respawning player | `playerId, x, z` |
| `obstacle_layout` | First player in room | `obstacles: [{kind, x, z, rotY, scaleX?, scaleZ?}]` |
| `game_mode_change` | Any player | `mode: 'warmup' \| 'deathmatch' \| 'lms'` |
| `lms_winner` | Server | `playerId` |
| `lms_draw` | Server | — |

---

## Leg Animation Fix

`player-avatar.js` line: `const phase = this._t * 8;`  
→ Change to: `const phase = this._t * (this._input?.sprint ? 14 : 10);`

---

## Asset Requirements

### 3D Models (`.glb`)

`handgun.glb`, `rifle.glb`, `fireball-orb.glb` (optional), `club.glb`, `katana.glb`, `crate.glb`, `barrel.glb`, `pillar.glb`, `wall-l.glb`

### Textures / Sprites (`.png` with alpha)

`blood-splat.png` (3–4 variants), `fire-sprite.png` (spritesheet 4–8 frames), `smoke-puff.png`, `slash-arc.png`, `muzzle-flash.png` (optional)

### Audio (`.ogg` + `.mp3` fallback)

`gun-shot.ogg`, `rifle-burst.ogg`, `fireball-launch.ogg`, `fireball-impact.ogg`, `fire-loop.ogg`, `club-swing.ogg`, `club-impact.ogg`, `katana-slash.ogg`, `katana-impact.ogg`, `hit-pain.ogg`, `death.ogg`, `respawn.ogg`

### HUD Icons (`.png`, ~64×64 px)

`icon-handgun.png`, `icon-rifle.png`, `icon-fireball.png`, `icon-club.png`, `icon-katana.png`

All assets placed in `brett/public/assets/mayhem/sounds/` and `brett/public/assets/mayhem/textures/`. Fallback behavior: audio silently skipped if file missing; 3D models replaced by procedural geometry; sprites replaced by colored `MeshBasicMaterial`.

---

## Testing

- `brett/test/server-mayhem.test.js`: add relay tests for new message types + LMS server logic
- `brett/test/physics.test.js`: add tests for `integrateRagdollRoot`, `integrateRagdollBone`
- Manual: open two browser tabs, verify HP sync, death/respawn per mode, obstacle collision, all 5 weapons
