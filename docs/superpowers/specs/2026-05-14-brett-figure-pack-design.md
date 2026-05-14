# Brett Figure-Pack Editor — Design Spec

**Date:** 2026-05-14
**Branch:** `feature/brett-figure-pack`
**Supersedes (in spirit):** `2026-05-14-brett-character-editor-design.md` — that spec's vocabulary (hat/hair/mask/body/shoes) is replaced here by the figure-pack design system (face / body-preset / accessory).

---

## 1. Context

PR #746 added a character editor with placeholder Three.js geometry. PR #748 (mannequin-focus) rewrote `brett/public/index.html` and dropped the editor UI in the process. `brett/server.js` still carries the `/presets` REST endpoints from #746 — those stay, schema is extended.

The user has supplied a coherent figure-pack design system (`Systembrett Assets`):

- **12 face PNGs** (512×512) — emotional/relational states applied as `head` sphere texture
- **6 body proportion presets** — `child / adolescent / adult-short / adult-average / adult-tall / elder`; each has a `scale` block in `placement_spec.json` that maps directly onto our six proportion sliders (`upperArm / forearm / thigh / shin / torso` + head)
- **8 accessories** (256×256 PNGs) — `cap / satchel / cane / shawl / swaddle / blindfold / crown / veil`; each has bone + anchor + size + offset + rotation + billboard rules in `placement_spec.json`
- `placement_spec.json` is the single source of truth for placement math
- `colors_and_type.css` ships the brand tokens (mentolder slate + brass + sage palette)

User decisions (locked):
1. **Replace entirely** — kill placeholder hat/hair/mask/body/shoes vocabulary
2. **Body preset auto-fills sliders** — single source of truth, sliders still editable for fine-tune
3. **Multi-select accessories** — grouped conflict rules (head/torso/hand)
4. **Random-assign button** — one click randomises face + body + accessories within rules

---

## 2. Asset Pipeline

Copy the user's asset bundle into `brett/public/assets/figure-pack/`:

```
brett/public/assets/figure-pack/
├── placement_spec.json             # served as-is; client fetches once
├── faces/
│   ├── neutral.png   observing.png  distant.png    overwhelmed.png
│   ├── protective.png yearning.png  resolved.png   withdrawn.png
│   ├── present.png   mourning.png   curious.png    blocked.png
├── bodies/
│   └── _reference_sheet.png        # ref only; not loaded at runtime
└── accessories/
    ├── cap.png       satchel.png   cane.png       shawl.png
    ├── swaddle.png   blindfold.png crown.png      veil.png
```

`.svg` source files in the user's bundle are not copied — runtime uses PNGs (`TextureLoader` → `MeshLambertMaterial` / `MeshBasicMaterial`).

The body silhouette PNGs (`adolescent.png` etc.) are reference renders only — the 3D mesh stays our existing rig. We use only the `scale` table from `placement_spec.json` for those.

Add a small node-test/lint that asserts every face/accessory listed in `placement_spec.json` exists on disk (CI guard against drift).

---

## 3. Data Model

Replaces `fig.outfit + fig.proportions` from the old spec:

```js
fig.appearance = {
  face:        'neutral',                       // one of 12, default 'neutral'
  bodyPreset:  'adult-average',                 // one of 6, default 'adult-average'
  accessories: ['cap'],                         // 0..N from 8, conflict-rules apply
  proportions: {                                // user-tweakable overrides on top of bodyPreset
    upperArm: 1.0, forearm: 1.0,
    thigh: 1.0,    shin: 1.0,
    torso: 1.0,    head: 1.0
  }
}
```

`bodyPreset` is authoritative when first applied (sliders snap to the preset's `scale` map → normalised against `adult-average` as 1.0× baseline). Subsequent slider edits live as **deltas** in `proportions`. WS sync ships both.

**Accessory conflict rules** (declared in `placement_spec.json` extension or hard-coded constants):

| Group | Members | Rule |
|---|---|---|
| `head-cover` | `cap`, `crown`, `veil`, `blindfold` | max 1 |
| `torso-wrap` | `shawl`, `swaddle` | max 1 |
| `strap` | `satchel` | independent |
| `hand` | `cane` | independent |

Picking a conflicting member kicks out the previous one. `swaddle` is auto-suggested but not forced for `child` body.

---

## 4. Rendering

### 4.1 Face texture

The `head` sphere already exists in `makeMannequin()`. On `applyFace(fig, name)`:

```js
const tex = await loader.loadAsync(`/assets/figure-pack/faces/${name}.png`);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 4;
tex.flipY = true;
fig.headMesh.material.map = tex;
fig.headMesh.material.transparent = true;
fig.headMesh.material.alphaTest = 0.5;
fig.headMesh.material.color.setHex(0xd9c89b); // skin token
fig.headMesh.material.needsUpdate = true;
```

UV defaults from spec (front of sphere = u=0.5, v=0.5) are correct for our existing `SphereGeometry(0.16, 16, 12)`.

### 4.2 Accessory plane

For each accessory name in `fig.appearance.accessories`, create a `THREE.Mesh(PlaneGeometry(size.x, size.y), MeshBasicMaterial(...))` and attach to its bone:

```js
function makeAccessoryMesh(name, spec) {
  const tex = textureCache.get(name); // lazy load
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.5,
    side: THREE.DoubleSide, depthWrite: false
  });
  const [w, h] = spec.sizeMeters;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(...spec.positionOffset);
  mesh.rotation.set(...spec.rotation);
  mesh.userData.billboard = spec.billboard;          // 'yAxis' | false
  mesh.userData.anchorPx  = spec.anchorPx;           // for future fine-tune
  mesh.name = `accessory:${name}`;
  return mesh;
}

function applyAccessories(fig, names) {
  // remove any old
  for (const bone of Object.values(fig.bones)) {
    bone.children
      .filter(c => c.name?.startsWith('accessory:'))
      .forEach(c => bone.remove(c));
  }
  for (const name of names) {
    const spec = SPEC.accessories[name];
    if (!spec) continue;
    const bone = fig.bones[spec.bone] ?? fig.bones.hips; // 'neck' fallback → hips
    bone.add(makeAccessoryMesh(name, spec));
  }
}
```

**`neck` bone:** `placement_spec.json` references `bone: "neck"` for `shawl`, but our rig only has `head` / `hips`. Map `neck → head` with a y-offset of `-0.18` (shoulder level) in a small lookup table.

**Billboard:** per-frame in the render loop, accessories with `userData.billboard === 'yAxis'` rotate to face the camera around the world-Y axis only (keeps the shawl etc. always readable at oblique angles).

```js
function updateBillboards(scene, camera) {
  scene.traverse(obj => {
    if (obj.userData.billboard === 'yAxis') {
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      const cp = camera.position;
      const angle = Math.atan2(cp.x - wp.x, cp.z - wp.z);
      obj.setRotationFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      // re-apply spec.rotation as a multiplier
    }
  });
}
```

### 4.3 Body proportions

Reuses `applyProportions(fig, props)` from the old spec (segment scaling + counter-scaled contact spheres). New: `applyBodyPreset(fig, name)` normalises the preset's `scale` block against `adult-average` and writes the resulting factors into `fig.appearance.proportions`, then calls `applyProportions`.

```js
const BASE = SPEC.bodies['adult-average'].scale;
function applyBodyPreset(fig, name) {
  const s = SPEC.bodies[name].scale;
  fig.appearance.proportions = {
    upperArm: s.upperArm / BASE.upperArm,
    forearm:  s.forearm  / BASE.forearm,
    thigh:    s.thigh    / BASE.thigh,
    shin:     s.shin     / BASE.shin,
    torso:    s.torsoH   / BASE.torsoH,
    head:     1.0   // head radius stays 0.16 (child-ratio is a *relative* read)
  };
  if (name === 'elder') fig.bones.head.rotation.x = 0.105; // 6° stoop
  else                  fig.bones.head.rotation.x = 0;
  applyProportions(fig, fig.appearance.proportions);
}
```

---

## 5. Editor UI

### 5.1 Trigger

- **Doppelklick** on a selected figure → enters Edit Mode
- **`E`** key when a figure is selected → same
- **Escape** or click outside bubble → exits, camera tweens back

### 5.2 Camera tween + floating bubble

Identical to PR #746's mechanism (see merged `2026-05-14-brett-character-editor-design.md` §5 for the projection math). Bubble is `position: fixed`, follows projected figure-root, clamped to viewport.

### 5.3 Bubble layout (mentolder slate + brass tokens from `colors_and_type.css`)

```
┌─────────────────────────────────────────────┐
│ ✦ Figur einrichten                    [✕]   │   Newsreader serif title
├─────────────────────────────────────────────│
│ Gesicht                                     │   small label, tracked uppercase
│ ┌────┬────┬────┬────┬────┬────┐             │
│ │ 😐 │ 👁 │ 🌫 │ 😯 │ 🛡 │ ✨ │  ← 12 face   │   round 40×40 thumbnails,
│ │ neu│ obs│ dst│ ovw│ prt│ yrn│    thumbs    │   brass ring on active
│ ├────┼────┼────┼────┼────┼────┤             │
│ │ ✓  │ 🙈 │ 👀 │ 💧 │ 🤨 │ 🚫 │             │
│ │ res│ wdr│ prs│ mrn│ cur│ blk│             │
│ └────┴────┴────┴────┴────┴────┘             │
├─────────────────────────────────────────────│
│ Körper                                      │
│ ( child · adolescent · short · avg ·        │   segmented control,
│   tall · elder )                            │   pill-shaped, brass on active
├─────────────────────────────────────────────│
│ Proportionen                  [↻ Reset]     │
│ Oberarm       ──●──────  1.10×              │   slider + live value (mono)
│ Unterarm      ────●────  0.95×              │
│ Oberschenkel  ──●──────  1.05×              │
│ Unterschenkel─●───────  0.90×               │
│ Torso         ──●──────  1.00×              │
│ Kopf          ──●──────  1.00×              │
├─────────────────────────────────────────────│
│ Zubehör                                     │
│ Kopf:  [ Kappe ] [ Krone ] [ Schleier ]     │   group-pills, max-1 per group
│        [ Augenbinde ]                       │
│ Torso: [ Schal ] [ Wickeltuch ]             │
│ Sonst: [ Tasche ] [ Stock ]                 │
├─────────────────────────────────────────────│
│ [🎲 Würfeln]   [💾 Speichern]  [Presets ▾]  │
└─────────────────────────────────────────────┘
```

### 5.4 Random-assign (new — user addendum)

`🎲 Würfeln` button →

```js
function randomiseAppearance(fig) {
  const FACES   = Object.keys(SPEC.faces);
  const BODIES  = Object.keys(SPEC.bodies);
  const HEAD    = ['cap','crown','veil','blindfold', null]; // null = bare head ~40%
  const TORSO   = ['shawl','swaddle', null, null];          // null biased
  const STRAP   = ['satchel', null];
  const HAND    = ['cane', null, null, null];               // cane is rare
  const acc = [HEAD, TORSO, STRAP, HAND]
    .map(pool => pool[Math.floor(Math.random() * pool.length)])
    .filter(Boolean);
  applyAppearance(fig, {
    face:        FACES[Math.floor(Math.random() * FACES.length)],
    bodyPreset:  BODIES[Math.floor(Math.random() * BODIES.length)],
    accessories: acc,
    proportions: null   // → re-derived from bodyPreset
  });
  broadcastAppearance(fig);
}
```

Random respects the same conflict rules and broadcasts a single `appearance` WS message.

---

## 6. WebSocket Protocol

**Client → server message:**
```js
{ type: 'appearance', id: figId, appearance: { face, bodyPreset, accessories, proportions } }
```

Server stores `fig.appearance` in room state, fans out to all room clients (including sender, so the sender can confirm).

**Snapshot:** each figure in `snapshot.figures[]` carries `appearance` (or `null` → client falls back to defaults).

Server already has WS room logic from #748 — extend the message type set and the snapshot payload.

---

## 7. Preset Persistence

Existing `/presets` (added in #746, still in `server.js`) — schema migrates from `{ outfit, proportions }` to `{ appearance }`:

```js
// Old preset on disk:
{ id, name, createdAt, outfit: {...}, proportions: {...} }

// New preset on disk:
{ id, name, createdAt, appearance: { face, bodyPreset, accessories, proportions } }
```

`server.js` migration: on load, if a preset has `outfit && !appearance`, drop it (no production users yet — `presets.json` will not exist on either prod cluster's PV). Log one line and continue.

`POST /presets` body validates `appearance` shape; rejects unknown face/body/accessory names against `placement_spec.json`.

---

## 8. Implementation Order

1. Copy assets into `brett/public/assets/figure-pack/` (PNGs + `placement_spec.json` only)
2. Server: load `placement_spec.json` at startup → in-memory `SPEC`; expose `GET /spec` (or inline in client bundle via build) — **decision: serve as static file**, client `fetch('/assets/figure-pack/placement_spec.json')` once
3. Server: migrate `/presets` schema (drop legacy entries; validate new shape against SPEC)
4. Server: add `appearance` WS message handler + extend snapshot
5. Client: `applyFace`, `applyAccessories`, `applyBodyPreset`, `applyAppearance` (composite)
6. Client: billboard updater in render loop
7. Client: editor bubble HTML/CSS — using `colors_and_type.css` tokens (copy the file into `brett/public/assets/figure-pack/` and `<link>` it)
8. Client: bubble wiring — face thumbs, body segments, sliders, accessory pills, random button, save/load
9. Server preset endpoints: extend validation
10. CI guard: tiny BATS or shell test asserting all face/accessory PNGs referenced in `placement_spec.json` exist
11. Manual verify on `brett.localhost` + `brett.mentolder.de`

---

## 9. Out of scope (defer)

- Saved presets visible in a side gallery (current flow is dropdown only — fine for v1)
- Per-figure rotation of head texture (uvOffset/uvRepeat — the spec shows defaults, no UI for it)
- Body silhouette PNGs as ghost-overlays during proportion editing
- Migration of any in-memory `fig.outfit / fig.proportions` from a hot WS session (no production data; cold-restart acceptable)
