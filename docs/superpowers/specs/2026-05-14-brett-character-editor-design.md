# Brett Character Editor — Design Spec

**Date:** 2026-05-14  
**Branch:** `feature/brett-character-editor`  
**Scope:** Character appearance editor for the 3D Systembrett mannequins — outfit slots, limb elongation, WebSocket sync, global preset persistence.

---

## 1. Context & Base

The character editor builds on top of the **`brett-mannequin-focus`** implementation (cherry-picked into this branch as the first implementation step). That code provides:

- `makeMannequin(id, position)` — Three.js bone hierarchy: `hips`, `head`, `lShoulder`, `rShoulder`, `lElbow`, `rElbow`, `lWrist`, `rWrist`, `lHip`, `rHip`, `lKnee`, `rKnee`, `lAnkle`, `rAnkle`
- Verlet spring physics + CCD-IK drag + stiffness slider
- Click/Tab/WASD walk system
- WebSocket sync via `/sync` endpoint

Default limb lengths (used as `1.0×` baseline for proportions):

| Segment | Length |
|---|---|
| Upper arm (`lShoulder`→`lElbow`) | 0.32 |
| Forearm (`lElbow`→`lWrist`) | 0.30 |
| Thigh (`lHip`→`lKnee`) | 0.42 |
| Shin (`lKnee`→`lAnkle`) | 0.40 |
| Torso (hips box height) | 0.70 |
| Head sphere radius | 0.16 |

---

## 2. Data Model

Each `fig` object is extended with two new fields:

```js
fig.outfit = {
  hat:   'top-hat' | 'cowboy-hat' | null,
  hair:  'long-blonde' | 'short-brown' | null,
  mask:  'mask' | null,          // null = bare face (no overlay)
  body:  'shirt' | 'dress' | null,
  shoes: 'sneakers' | 'boots' | null
}

fig.proportions = {
  upperArm: 1.0,   // scale factor, range 0.5–2.0
  forearm:  1.0,
  thigh:    1.0,
  shin:     1.0,
  torso:    1.0,
  head:     1.0
}

// No separate accessories group — each slot mesh is attached directly to its target bone
```

Default: all outfit slots `null`, all proportions `1.0`.

Accessory meshes are attached **directly to the bone `THREE.Group`** they belong to (hat → `bones.head`, body → `hips`, shoes → `bones.lAnkle` + `bones.rAnkle`). Three.js hierarchy handles transform tracking automatically. Each mesh gets `mesh.name = slot` so it can be found and removed with `bone.getObjectByName(slot)`.

---

## 3. Rendering — SVG Textures on 3D Geometry

### Philosophy

Each slot has a `makeSlotMesh(choice)` factory function returning a `THREE.Mesh` (or `THREE.Group` for paired items like shoes). The mesh uses procedural Three.js geometry with a solid-color `MeshLambertMaterial` as a **placeholder**. When SVG assets exist, the same function swaps in a `TextureLoader`-loaded material — no other code changes required.

### Slot Geometries

| Slot | THREE Geometry | Attachment | Placeholder color |
|---|---|---|---|
| `hat` | `CylinderGeometry` (crown) + `RingGeometry` (brim) | `head` group, `position.y = +headRadius + crownHeight/2` | `#c8a96e` |
| `hair` | cluster of 3–4 `SphereGeometry` / `CapsuleGeometry` | `head` group, positioned around skull | `#6B3A2A` (short-brown) / `#f5d060` (long-blonde) |
| `mask` | `PlaneGeometry(0.22, 0.16)` | `head` group, `position.z = +headRadius + 0.01` | `#e07060` |
| `body` | `BoxGeometry(0.54, 0.74, 0.28)` (slightly larger than torso) | `hips` group, same y-offset as torso mesh | `#3a5f7a` (shirt) / `#8B3A6A` (dress) |
| `shoes` | Two `BoxGeometry(0.12, 0.08, 0.20)` | `lAnkle` + `rAnkle` groups | `#4a4a4a` |

### Switching Slots

```js
const SLOT_BONE = { hat: 'head', hair: 'head', mask: 'head', body: 'hips', shoes: null };

function applyOutfitSlot(fig, slot, choice) {
  if (slot === 'shoes') {
    ['lAnkle', 'rAnkle'].forEach((b, i) => {
      const bone = fig.bones[b];
      const old = bone.getObjectByName(slot);
      if (old) bone.remove(old);
      if (choice !== null) {
        const mesh = makeSlotMesh(slot, choice, i === 0 ? 'l' : 'r');
        mesh.name = slot;
        bone.add(mesh);
      }
    });
    return;
  }
  const bone = fig.bones[SLOT_BONE[slot]];
  const old = bone.getObjectByName(slot);
  if (old) bone.remove(old);
  if (choice === null) return;
  const mesh = makeSlotMesh(slot, choice);
  mesh.name = slot;
  bone.add(mesh);
}
```

---

## 4. Limb Proportions

Scaling is applied to the bone `THREE.Group` directly:

```js
function applyProportions(fig, proportions) {
  const { bones, baseLengths } = fig;
  // Per bone-group: scale y, correct child offset
  scaleSegment(bones.lShoulder, bones.lElbow, baseLengths.upperArm, proportions.upperArm);
  scaleSegment(bones.rShoulder, bones.rElbow, baseLengths.upperArm, proportions.upperArm);
  scaleSegment(bones.lElbow,    bones.lWrist, baseLengths.forearm,  proportions.forearm);
  scaleSegment(bones.rElbow,    bones.rWrist, baseLengths.forearm,  proportions.forearm);
  scaleSegment(bones.lHip,      bones.lKnee,  baseLengths.thigh,    proportions.thigh);
  scaleSegment(bones.rHip,      bones.rKnee,  baseLengths.thigh,    proportions.thigh);
  scaleSegment(bones.lKnee,     bones.lAnkle, baseLengths.shin,     proportions.shin);
  scaleSegment(bones.rKnee,     bones.rAnkle, baseLengths.shin,     proportions.shin);
  // Torso: scale the mesh + adjust shoulder/hip y positions
  scaleTorso(fig, proportions.torso);
  // Head: scale the head group
  bones.head.scale.setScalar(proportions.head);
}

function scaleSegment(parentBone, childBone, baseLength, factor) {
  parentBone.scale.y = factor;
  childBone.position.y = -baseLength * factor;
  // Counter-scale contact sphere so it stays unit-size
  const sphere = parentBone.children.find(c => c.userData.isContact);
  if (sphere) sphere.scale.y = 1 / factor;
}
```

`fig.baseLengths` is stored during `makeMannequin()` so the original lengths are never lost.

---

## 5. Editor UI

### Trigger

- **Doppelklick** on a selected figure → enters Outfit Mode
- **`E` key** when a figure is selected → same
- **Escape** or click outside bubble → exits Outfit Mode, camera tweens back

### Camera Tween

On entering Outfit Mode the camera animates over ~24 render frames (≈ 0.4s at 60fps):

1. Target: figure positioned at ~30% from left edge, `camera.zoom *= 1.3`
2. Uses `THREE.Vector3.lerp(target, 0.12)` per frame (exponential ease-out)
3. Saves `{ position, target, zoom }` snapshot → restored on exit

### Floating Bubble

Pure HTML/CSS `div` with `position: fixed`. Screen-space position computed each frame from `fig.root` world position projected through camera:

```js
const projected = fig.root.position.clone().project(camera);
bubble.style.left = ((projected.x + 1) / 2 * window.innerWidth + 80) + 'px';
bubble.style.top  = ((1 - projected.y) / 2 * window.innerHeight - bubbleHeight/2) + 'px';
```

Clamped to viewport edges so it never scrolls off-screen.

**Layout:**
```
┌──────────────────────────────────┐
│ ✦ Figur bearbeiten          [✕]  │
├─────────────────────────────────-│
│ HUT    [🎩] [👒]  HAAR [🟫] [🟡] │
│ MASKE  [😷] [—]   SCHUHE[👟][👞] │
│ KÖRPER [👔] [👗]                  │
├──────────────────────────────────│
│ Oberarm      ──●──────  1.0×     │
│ Unterarm     ────●────  1.0×     │
│ Oberschenkel ──●──────  1.0×     │
│ Unterschenkel─●───────  1.0×     │
│ Torso        ──●──────  1.0×     │
│ Kopf         ──●──────  1.0×     │
├──────────────────────────────────│
│ [💾 Speichern]    [Presets ▾]    │
└──────────────────────────────────┘
```

- Active slot choice: highlighted border (`border: 1px solid #c8a96e`)
- Slider: `<input type="range" min="0.5" max="2.0" step="0.05">` + live value display
- Slider `input` event: immediate `applyProportions` + debounced 200ms WS broadcast

---

## 6. WebSocket Protocol Extension

**New message type** (client → server → all room clients):
```js
{ type: 'appearance', id: figId, outfit: {...}, proportions: {...} }
```

**Snapshot extension** — server adds `outfit` + `proportions` to each figure in the snapshot array:
```js
{ type: 'snapshot', figures: [{ id, type, x, z, boneOverrides, outfit, proportions }], stiffness, optik }
```

Server stores `fig.outfit` and `fig.proportions` in room state alongside existing fields. New clients joining see the current appearance immediately.

---

## 7. Global Preset System

### Storage

`brett/presets.json` — read on server startup, written on every save/delete. If file doesn't exist, server initialises with `[]`.

### REST Endpoints (added to `server.js`)

```
GET    /presets          → 200 JSON Array of all presets
POST   /presets          → body: { name, outfit, proportions } → 201 { id, name, outfit, proportions, createdAt }
DELETE /presets/:id      → 204 No Content
```

### Preset Schema

```js
{
  id:          "uuid-v4",
  name:        "Langer Zauberer",
  createdAt:   "2026-05-14T12:00:00Z",
  outfit:      { hat, hair, mask, body, shoes },
  proportions: { upperArm, forearm, thigh, shin, torso, head }
}
```

### Client Flow

1. On bubble open: `GET /presets` → render preset cards in collapsible section
2. "Speichern" button: `prompt("Name?")` → `POST /presets` → refresh list
3. Preset card × button: `DELETE /presets/:id` → refresh list
4. Preset card click: apply outfit + proportions to selected figure, broadcast `appearance`

---

## 8. Asset Spec for SVG Generation

When replacing placeholder geometry with real artwork, create the following SVG files in `brett/public/assets/outfit/`:

| File | Size | View | Anchor Point | Key Measurements |
|---|---|---|---|---|
| `hat-top.svg` | 256×128px | Top-down | Center-bottom (head center) | Brim = full width 256px; crown = ~100px wide oval; brim thickness ≈ 20px |
| `hat-cowboy.svg` | 256×128px | Top-down | Center-bottom | Brim upturned on sides; crown = flattened oval ~80px |
| `hair-long-blonde.svg` | 128×320px | Front | Center-top (hairline) | Shoulder-width span = 80px at y=240px; color #f5d060; bottom open |
| `hair-short-brown.svg` | 128×160px | Front | Center-top (hairline) | Chin-length = 120px; color #6B3A2A |
| `mask-red.svg` | 128×96px | Front | Center-top (nose bridge, y≈35%) | Eye cutouts transparent; face-width = 100px; chin at y=90px |
| `shirt-blue.svg` | 192×256px | Front | Center-top (shoulder line) | Shoulder-width = 160px; torso-length = 220px; sleeve-ends at y=80px; sides open at bottom |
| `dress-red.svg` | 192×320px | Front | Center-top (shoulder line) | Shoulder-width = 160px; skirt flares from y=160px; bottom open (legs visible) |
| `shoes-sneaker-l.svg` | 128×64px | Left-side | Top-right (ankle joint) | Sole length = 100px; height = 40px; toe points left |
| `shoes-sneaker-r.svg` | 128×64px | Right-side | Top-left (ankle joint) | Mirror of left |
| `shoes-boot-l.svg` | 128×96px | Left-side | Top-right (ankle joint) | Shaft height = 70px; sole = 100px |
| `shoes-boot-r.svg` | 128×96px | Right-side | Top-left (ankle joint) | Mirror of left |

**Rules for all SVGs:**
- `viewBox` = pixel dimensions (1:1 mapping)
- Background transparent
- Minimum stroke width 2px (thinner strokes disappear as textures)
- Shoe pairs always come as L+R (mirrored) — they attach to separate ankle bones
- Color fills preferred over gradients (Lambert material, no specular)

---

## 9. Implementation Order

1. Cherry-pick all `mannequin-focus` commits into `brett-character-editor`
2. Add `fig.outfit`, `fig.proportions`, `fig.accessories`, `fig.baseLengths` to `makeMannequin()`
3. Implement `makeSlotMesh(slot, choice)` for all 5 slots (placeholder geometry)
4. Implement `applyOutfitSlot()` + `applyProportions()` + `scaleTorso()`
5. Verify accessories move with bones (automatic via Three.js hierarchy — no render-loop tracking needed)
6. Add REST endpoints + `presets.json` persistence to `server.js`
7. Extend WS snapshot + add `appearance` message handler to server + client
8. Build floating bubble HTML/CSS + inject into `index.html`
9. Camera tween (enter/exit Outfit Mode)
10. Wire bubble slots → `applyOutfitSlot` + broadcast
11. Wire sliders → `applyProportions` + debounced broadcast
12. Wire preset save/load/delete
13. Manual verify all flows; commit
