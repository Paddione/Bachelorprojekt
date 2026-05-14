# Brett Mannequin Focus — Design Spec

**Date:** 2026-05-14
**Branch:** feature/brett-mannequin-focus
**Status:** approved

## Overview

Strip the Systembrett of all settings panels and rebuild it around a single focus: 3D mannequins with keyboard-driven walking and a physics↔IK ragdoll system. All existing figure types (SVG symbols, constellation selector, art library) are removed. The result is a pure mannequin sandbox with real-time WebSocket sync.

---

## 1. UI Layout

### Slim Topbar (36px)

Single bar replacing the current toolbar + tool-rail + dock + minimap:

```
[Stand] [Kneel] [Prone] [Crawl] [Slump] [T-Pose]  |  🌡 PHYS ───●─── IK 🎯  |  ── + Figur  ● N online
```

- **Left**: Pose-Preset buttons (6 presets, see §4)
- **Center**: Physics↔IK slider (`stiffness` 0.0–1.0), red→yellow→green gradient
- **Right**: `+ Figur` button, sync indicator (`● N online`)

### Canvas

Full remaining viewport. No rail, no dock, no minimap.

- Floor plane: subtle grid, `y=0`
- Mannequins rendered with permanent contact-point spheres (colour-coded, see §3)
- Selected mannequin: gold dashed selection ellipse on base + direction arrow
- Unselected mannequins: dimmed (opacity ~0.6), contact spheres still visible

### Status Pill

Floating, bottom-center, context-sensitive:

| State | Text |
|---|---|
| No selection | `Klick = Figur wählen · Doppelklick Boden = neue Figur` |
| Selected, idle | `🚶 WALK · WASD / Klick Boden = Ziel · Tab = nächste` |
| Selected, walking | `→ Ziel … · Klick = neues Ziel · ESC = stop` |
| Selected, dragging contact | `● Drag … · Loslassen = resume` |
| stiffness < 0.3 | `zu schlaff zum Laufen — Slider nach rechts` |

---

## 2. Mannequin Model

Reuse the existing Three.js mannequin skeleton from `brett/public/index.html` (bones: head, hips, lShoulder/rShoulder, lElbow/rElbow, lWrist/rWrist, lHip/rHip, lKnee/rKnee, lAnkle/rAnkle). No changes to geometry.

**Contact-point spheres** — always rendered, colour by type:

| Contact point | Bone | Colour |
|---|---|---|
| Left hand | lWrist | gold `#ffd84a` |
| Right hand | rWrist | gold `#ffd84a` |
| Left foot | lAnkle | green `#6be0a0` |
| Right foot | rAnkle | green `#6be0a0` |
| Left knee | lKnee | blue `#4a9adf` |
| Right knee | rKnee | blue `#4a9adf` |
| Left elbow | lElbow | brass `#c8a96e` |
| Right elbow | rElbow | brass `#c8a96e` |
| Head | head | red-soft `#e09090` |

Spheres are raycaster-hittable for IK drag (same mechanism as existing `isBrassJoint` pickup, extended to all 9 contact points).

---

## 3. Physics↔IK System (Verlet Spring + CCD-IK)

### Core parameter

```js
let stiffness = 0.65; // slider value, synced globally per room
```

### Verlet Spring Simulation

Each bone stores: `targetRot` (from preset or IK), `currentRot`, `velocity`.

Per-tick update:
```
acceleration = (targetRot - currentRot) * stiffness * K_SPRING
              + gravityOffset(bone) * (1 - stiffness)
velocity     = velocity * DAMPING + acceleration * dt
currentRot  += velocity * dt
```

- `K_SPRING` ≈ 80 — spring constant
- `DAMPING` ≈ 0.85 — per-frame damping
- `gravityOffset(bone)` — per-bone rest offsets that simulate limpness (arms hang, head droops) at `stiffness=0`
- Floor clamp: foot/knee contact spheres cannot go below `y=0`

### CCD-IK (on drag)

When user drags a contact-point sphere:
1. Set `IK target position` for that end-effector
2. Run CCD iterations (max 8) on the chain: e.g. wrist → elbow → shoulder
3. Write resulting rotations into `boneOverrides[boneName]` — these override `targetRot` for that chain
4. On release: `boneOverrides` cleared for that chain; spring resumes from current position

### Slider interaction with presets

1. Preset click → writes `targetRot` for all bones from a lookup table
2. Spring accelerates toward target at speed ∝ `stiffness`
3. Drag during preset → CCD overrides individual chains; rest of body keeps springing to preset
4. At `stiffness=0`: spring force is near zero — body slowly collapses under gravity offsets regardless of preset

---

## 4. Pose Presets

Six presets, stored as bone rotation tables (radians):

| Preset | Description |
|---|---|
| **Stand** | Upright, arms at sides, legs straight |
| **Kneel** | Both knees at `y=0`, torso upright, arms slightly out |
| **Prone** | Full horizontal, face down, arms forward |
| **Crawl** | Hands + knees at `y=0`, torso parallel to floor |
| **Slump** | Seated/slumped, spine curved forward, arms limp |
| **T-Pose** | Arms horizontal at 90°, legs together (also reset) |

Each preset is a plain JS object `{ boneName: { x, z } }`. No keyframes, no animation clips — just target rotations fed to the spring system.

---

## 5. Walk System

### State machine per mannequin

```
IDLE → WALKING (click-to-walk or WASD pressed)
WALKING → IDLE (arrived at target || ESC || WASD released)
WALKING → DRAG_PAUSED (contact drag starts)
DRAG_PAUSED → WALKING (drag released, target still set)
```

Walk disabled when `stiffness < 0.3` (body too limp).

### Click-to-Walk

- Raycast from click against floor plane (`y=0`)
- Set `fig.walkTarget = {x, z}`
- Each tick: rotate figure smoothly toward target, advance position at walk speed (~2 units/s)
- On arrival (distance < 0.3): clear target, stop animation, return to IDLE
- Second click mid-walk: update `walkTarget` immediately

### WASD (camera-relative)

- Read camera azimuth angle `θ`
- `W`: move in direction `(-sin θ, 0, -cos θ)`
- `S`: opposite
- `A/D`: strafe left/right in camera-perpendicular direction
- Figure smoothly rotates to face movement direction (slerp, rate ~8 rad/s)
- Any WASD input clears `walkTarget`

### Walk animation

Reuse existing `tickMannequinWalk()` bone animation. Fires whenever state is `WALKING`. Bone overrides from IK drag take precedence over walk animation offsets for the affected chain only.

### Tab — figure cycling

`Tab` key advances selection to next figure in `figures[]` array (wraps). Walk target and `boneOverrides` are per-figure and persist across selection changes.

---

## 6. Figure Management

- **Add**: `+ Figur` button or double-click on floor → spawn mannequin at clicked position (or canvas center if button)
- **Select**: single click on mannequin mesh
- **Deselect**: ESC or click empty floor
- **Delete**: `Del`/`Backspace` key while selected, or context menu (right-click)
- **Label**: double-click on mannequin → label modal (existing implementation reused)
- **Max figures**: no hard cap, but warn in status pill above 8

---

## 7. WebSocket Sync

Reuse existing `server.js` (Express + ws, room-based). Extend synced message types:

### New / changed fields

**Room-wide state** (broadcast on change):
```js
{ type: 'stiffness', value: 0.65 }
```

**Figure state** (existing `update` message, new fields):
```js
{
  type: 'update', id: '...',
  changes: {
    walkTarget: { x, z } | null,
    boneOverrides: { lWrist: { x, z }, ... } | {},
    walking: true | false      // existing field, keep
  }
}
```

### Removed from sync

- `constellationType`
- `scale`
- `color` (mannequins keep colour but it's less central; keep in sync for now)
- Art-library figure types (non-mannequin `type` values ignored/dropped)

### Conflict policy

Last-write-wins per field. No operational transform needed — sessions are small (≤8 users typical).

---

## 8. Files Changed

| File | Action |
|---|---|
| `brett/public/index.html` | Full rewrite (~3900 → ~1200 lines target) |
| `brett/public/three.min.js` | Unchanged |
| `brett/public/art-library/` | Removed from serving (or kept but unused) |
| `brett/server.js` | Minor: add `stiffness` broadcast, drop art-library file-serve if unused |
| `brett/package.json` | Unchanged (no new dependencies) |

---

## 9. Out of Scope

- No physics engine (Cannon.js / Rapier / Ammo.js)
- No screenshot / video recording
- No bookmarks / camera presets
- No save/load to server DB (room state is ephemeral, in-memory)
- No split-view / POV mode
- No minimap
- No mobile / touch support (deferred)
