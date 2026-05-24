# Brett — AI Character Skins (Mayhem Mode)

**Date:** 2026-05-25  
**Scope:** Mayhem mode only  
**Status:** Approved

## Summary

Add support for AI-generated, Mixamo-rigged GLB character skins in Brett's Mayhem combat mode. Skins are independent of the hero ability system. A default set is committed to the repo; admins can upload additional skins via the Mayhem admin panel without redeploying. The procedural mannequin remains the default and is always the fallback.

---

## Decisions

| Question | Answer |
|---|---|
| Target mode | Mayhem only |
| Animation approach | Hybrid — Mixamo AnimationMixer for locomotion, Brett spring physics for ragdoll/flail |
| Skin ↔ hero relationship | Independent — any skin pairs with any hero |
| UX entry point | New "Character Skin" row in the loadout modal |
| Persistence | `localStorage` (`brett.skinId`) — per-device, no server round-trip |
| Admin workflow | Upload GLB via Mayhem admin panel → saved to `public/assets/skins/<id>/` |

---

## File Layout

```
brett/
├── server.js                          ← add /api/skins endpoints
└── public/assets/
    ├── skins/
    │   ├── default/                   ← sentinel; no GLB (procedural mannequin)
    │   └── <id>/
    │       ├── skin.glb               ← Mixamo-rigged GLB (max 20 MB)
    │       ├── thumb.png              ← 128×128 preview (optional)
    │       └── meta.json              ← { id, name, author, animations[] }
    └── mayhem/
        └── skin-controller.js         ← new class (~150 lines)
```

---

## Bone Mapping

Brett's 14-bone names → Mixamo bone names used to find nodes in the loaded SkinnedMesh:

| Brett | Mixamo |
|---|---|
| hips | mixamorigHips |
| head | mixamorigHead |
| lShoulder | mixamorigLeftArm |
| rShoulder | mixamorigRightArm |
| lElbow | mixamorigLeftForeArm |
| rElbow | mixamorigRightForeArm |
| lWrist | mixamorigLeftHand |
| rWrist | mixamorigRightHand |
| lHip | mixamorigLeftUpLeg |
| rHip | mixamorigRightUpLeg |
| lKnee | mixamorigLeftLeg |
| rKnee | mixamorigRightLeg |
| lAnkle | mixamorigLeftFoot |
| rAnkle | mixamorigRightFoot |

---

## SkinController

New file: `brett/public/assets/mayhem/skin-controller.js`

### Responsibilities

- Load a GLB via `GLTFLoader`, resolve Mixamo bone nodes via the mapping above
- Manage a `THREE.AnimationMixer` with named clips: `idle`, `walk`, `run`, `death`
- On each `update(dt, avatarState)` call, play the appropriate clip or hand off to Brett's spring system
- Expose `getBone(brettName)` so `PlayerAvatar._applyBoneRotation` can write to skin bones during ragdoll

### Animation State Machine

```
IDLE / RUNNING  ←→  RAGDOLL / FLAILING  →  DEAD
AnimationMixer       mixer.stopAllAction()   death clip once,
plays Mixamo clip    Brett spring writes     then freeze
                     bones directly
```

Crossfade durations: 200 ms for idle↔run, 0 ms on ragdoll hit (instant), 400 ms recovering→idle.

Clip fallbacks: missing `walk` → use `idle`. Missing `death` → freeze on kill. Ragdoll and flail require no clip.

### API

```js
// Static factory — async load
SkinController.load(skinId, scene) → Promise<SkinController>

// Per-frame update (called from PlayerAvatar.update)
skin.update(dt, avatarState)

// Bone lookup (returns THREE.Bone or null)
skin.getBone(brettName)

// Properties
skin.mesh    // THREE.Group — added to mannequin.root on load
skin.ready   // false while GLB loading; PlayerAvatar uses mannequin meanwhile

// Cleanup
skin.setVisible(bool)
skin.dispose(scene)
```

---

## PlayerAvatar Integration

Five integration points in `player-avatar.js`:

1. **Constructor** — if `skinId !== 'default'`, call `SkinController.load(skinId)`. On load: hide mannequin geometry, add `skin.mesh` to `mannequin.root`.
2. **`update(dt, camYaw)`** — after existing logic, call `this.skin?.update(dt, this.state)`.
3. **`_applyBoneRotation(name)`** — after writing to `mannequin.bones[name].rotation`, also write to `this.skin?.getBone(name)` if present. Keeps ragdoll physics mirrored to skin bones.
4. **`setWeapon(weaponDef)`** — use `skin.getBone('rWrist')` as attachment point when skin is loaded, otherwise `mannequin.bones.rWrist`.
5. **`remove(scene)`** — call `this.skin?.dispose(scene)`.

The mannequin geometry stays hidden-but-present so `getCapsule()`, `getWristWorldPositions()`, and collision detection continue working unchanged.

---

## Arena-Server API

Three new routes in `server.js`:

### `GET /api/skins` — public

Reads `public/assets/skins/*/meta.json`, prepends the built-in `default` entry, returns catalog array. Fetched lazily by the loadout modal on open.

```json
[
  { "id": "default", "name": "Mannequin", "thumb": null },
  { "id": "patrick-001", "name": "Patrick", "thumb": "/assets/skins/patrick-001/thumb.png", "animations": ["idle","walk","run"] }
]
```

### `POST /api/skins/upload` — admin JWT required

`multipart/form-data` fields: `glb` (file, max 20 MB), `thumb` (file, optional, max 512 KB), `name` (string).

Validation: parse GLB binary header, walk node tree for `mixamorigHips` — reject if missing. Generate slug ID from name. Write files to `skins/<id>/`. Returns new catalog entry.

Uses same Keycloak bearer token check already present for existing `/admin` routes.

### `DELETE /api/skins/:id` — admin JWT required

Removes `skins/<id>/` directory. Returns 400 for `id === 'default'`. Players using a deleted skin fall back to default via SkinController's 404 path.

**Dependency:** `multer` (multipart upload). Check if already in `package.json`; if not, `npm i multer`.

---

## Loadout Modal UI

`loadout-modal.mjs` gets a new "Character Skin" row below the weapon selector:

- Displays current skin thumbnail + name
- Clicking opens a full-screen overlay (grid of available skins, 3 per row)
- Overlay fetches `/api/skins` on first open
- Selection saved to `localStorage.setItem('brett.skinId', id)`
- Skin changes take effect on next respawn (no mid-game hot-swap)

---

## Admin Panel Extension

`admin-panel.js` gets a new "Character Skins" section:

- Lists existing skins with thumbnail, name, animation tags, and delete button
- Upload form: name text field + GLB file input + optional thumb file input
- Client-side validation feedback: shows "✓ mixamorigHips found" after successful upload
- Cannot delete `default`

---

## Required Mixamo Animation Clips

Each uploaded GLB must include at minimum:

| Clip name | Usage | Loop |
|---|---|---|
| `idle` | Standing still | yes |
| `walk` | Walking | yes |
| `run` | Sprinting | yes |
| `death` | Kill reaction | no — optional |

Clip names are matched by exact string in `AnimationClip.name`. The Mixamo "In Place" export option should be used for walk/run so Three.js root motion doesn't conflict with Brett's position system.

---

## Files Changed

| File | Change |
|---|---|
| `brett/public/assets/mayhem/skin-controller.js` | **New** (~150 lines) |
| `brett/public/assets/mayhem/player-avatar.js` | 5 small integration points |
| `brett/public/assets/loadout-modal.mjs` | Add skin row + picker overlay |
| `brett/public/assets/mayhem/mayhem.js` | Read `localStorage('brett.skinId')`, pass to `PlayerAvatar` constructor |
| `brett/public/assets/mayhem/admin-panel.js` | Add Skins management section |
| `brett/server.js` | 3 API routes + GLB validator helper (~80 lines) |
| `brett/public/assets/skins/` | **New directory** — default sentinel + committed skins |

---

## Out of Scope

- Cross-device skin sync (no DB changes)
- Per-hero default skins
- Skin preview animation in the picker overlay
- Bot/remote player skin support (bots always use default mannequin)
- Systembrett mode (constellation board figures unchanged)
