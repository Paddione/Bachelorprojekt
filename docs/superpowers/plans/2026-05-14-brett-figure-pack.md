---
ticket_id: T000371
title: Brett Figure-Pack Editor Implementation Plan
domains: [brett, website]
status: active
pr_number: null
---

# Brett Figure-Pack Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder character editor (PR #746, since erased by PR #748) with a figure-pack editor driven by the user's `Systembrett Assets` design system — 12 face textures, 6 body proportion presets, 8 accessory PNGs, plus a random-assign button.

**Architecture:** Static PNG assets + `placement_spec.json` served from `brett/public/assets/figure-pack/`. Client reads spec once, applies face as head-sphere texture, accessories as `PlaneGeometry` parented to bones, body preset as authoritative seed for proportion sliders. Per-figure state shipped through existing WebSocket room protocol with one new `appearance` message type and an extended snapshot. Existing `/presets` REST endpoints in `server.js` migrate to the new shape.

**Tech Stack:** Three.js (vanilla, in-page `<script>`), Node.js + Express + ws (`brett/server.js`), no build step. CI guard via shell test. DOM built with `createElement`/`textContent` only — no `innerHTML` in production paths.

**Spec:** `docs/superpowers/specs/2026-05-14-brett-figure-pack-design.md`

---

## File Structure

| Path | What |
|---|---|
| `brett/public/assets/figure-pack/placement_spec.json` | Copied from `Systembrett Assets/assets/placement_spec.json` — single source of truth for placement math |
| `brett/public/assets/figure-pack/faces/*.png` | 12 face textures, 512×512 |
| `brett/public/assets/figure-pack/accessories/*.png` | 8 accessory textures, 256×256 |
| `brett/public/assets/figure-pack/colors_and_type.css` | Mentolder brand tokens (copied from asset bundle) |
| `brett/public/index.html` | + editor bubble HTML/CSS, + new client-side modules (face/accessory/body/random/WS) |
| `brett/server.js` | + `appearance` WS handler, snapshot extension, `/presets` schema migration + validation |
| `tests/figure-pack-assets.test.sh` | Shell-style guard: every file referenced in `placement_spec.json` exists on disk |
| `Taskfile.yml` | Wire the new test into `test:unit` |

The asset PNGs are static — committed once, never regenerated. CI guard catches drift between `placement_spec.json` and on-disk files. Source `.svg` files from the user's bundle are intentionally not copied.

---

## Task 1: Asset import

**Files:**
- Create: `brett/public/assets/figure-pack/placement_spec.json`
- Create: `brett/public/assets/figure-pack/faces/{neutral,observing,distant,overwhelmed,protective,yearning,resolved,withdrawn,present,mourning,curious,blocked}.png`
- Create: `brett/public/assets/figure-pack/accessories/{cap,satchel,cane,shawl,swaddle,blindfold,crown,veil}.png`
- Create: `brett/public/assets/figure-pack/colors_and_type.css`

- [ ] **Step 1: Copy assets from the user-provided bundle**

```bash
SRC="/mnt/c/Users/PatrickKorczewski/Downloads/Systembrett Assets"
DST="brett/public/assets/figure-pack"
mkdir -p "$DST/faces" "$DST/accessories"
cp "$SRC/assets/placement_spec.json" "$DST/placement_spec.json"
cp "$SRC/colors_and_type.css"        "$DST/colors_and_type.css"
for f in neutral observing distant overwhelmed protective yearning resolved withdrawn present mourning curious blocked; do
  cp "$SRC/assets/faces/$f.png" "$DST/faces/$f.png"
done
for a in cap satchel cane shawl swaddle blindfold crown veil; do
  cp "$SRC/assets/accessories/$a.png" "$DST/accessories/$a.png"
done
```

- [ ] **Step 2: Verify presence**

Run:
```bash
ls brett/public/assets/figure-pack/faces       | wc -l   # expect 12
ls brett/public/assets/figure-pack/accessories | wc -l   # expect 8
test -f brett/public/assets/figure-pack/placement_spec.json && echo OK
```
Expected: `12`, `8`, `OK`.

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/figure-pack
git commit -m "feat(brett): import Systembrett figure-pack assets (faces, accessories, placement_spec)"
```

---

## Task 2: Asset/spec consistency guard

**Files:**
- Create: `tests/figure-pack-assets.test.sh`
- Modify: `Taskfile.yml` (test:unit aggregator — add the new test to the unit list)

- [ ] **Step 1: Write the test**

`tests/figure-pack-assets.test.sh`:
```bash
#!/usr/bin/env bash
# Asserts every face/accessory referenced in placement_spec.json exists on disk.
set -euo pipefail
SPEC="brett/public/assets/figure-pack/placement_spec.json"
ROOT="brett/public/assets/figure-pack"

if [[ ! -f "$SPEC" ]]; then
  echo "MISSING: $SPEC" >&2; exit 1
fi

fail=0
while IFS= read -r rel; do
  [[ -z "$rel" || "$rel" == "null" ]] && continue
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "MISSING: $ROOT/$rel (referenced in placement_spec.json)" >&2
    fail=1
  fi
done < <(jq -r '
  [ (.faces | to_entries[] | select(.key|startswith("_")|not) | .value.file),
    (.accessories | to_entries[] | select(.key|startswith("_")|not) | .value.file)
  ] | .[]
' "$SPEC")

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "OK: all figure-pack assets present"
```

- [ ] **Step 2: Make executable + add to unit suite**

```bash
chmod +x tests/figure-pack-assets.test.sh
```

In `Taskfile.yml`, find the `test:unit` task. Append at the end of its `cmds` list:
```yaml
      - bash tests/figure-pack-assets.test.sh
```

- [ ] **Step 3: Run it — expect PASS (Task 1 already shipped assets)**

Run: `bash tests/figure-pack-assets.test.sh`
Expected: `OK: all figure-pack assets present`.

- [ ] **Step 4: Run the full unit suite**

Run: `task test:unit`
Expected: green, including `figure-pack-assets.test.sh`.

- [ ] **Step 5: Commit**

```bash
git add tests/figure-pack-assets.test.sh Taskfile.yml
git commit -m "test(brett): guard figure-pack asset/spec consistency"
```

---

## Task 3: Server — `/presets` migration + validation

**Files:**
- Modify: `brett/server.js` (`/presets` block — currently ~134-170 per `grep -n '/presets'`)

- [ ] **Step 1: Read the current preset code**

```bash
sed -n '1,40p;130,200p' brett/server.js
```

- [ ] **Step 2: Add SPEC load on startup**

After the existing `path`/`fs` requires near the top of `brett/server.js`:

```js
const SPEC_PATH = path.join(__dirname, 'public', 'assets', 'figure-pack', 'placement_spec.json');
let SPEC = { faces: {}, accessories: {}, bodies: {} };
try {
  SPEC = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const fc = Object.keys(SPEC.faces).filter(k=>!k.startsWith('_')).length;
  const ac = Object.keys(SPEC.accessories).filter(k=>!k.startsWith('_')).length;
  const bc = Object.keys(SPEC.bodies).filter(k=>!k.startsWith('_')).length;
  console.log(`[figure-pack] loaded spec: ${fc} faces, ${ac} accessories, ${bc} bodies`);
} catch (err) {
  console.warn(`[figure-pack] no spec at ${SPEC_PATH} — appearance validation disabled`);
}

const FACE_NAMES = () => Object.keys(SPEC.faces).filter(k => !k.startsWith('_'));
const BODY_NAMES = () => Object.keys(SPEC.bodies).filter(k => !k.startsWith('_'));
const ACC_NAMES  = () => Object.keys(SPEC.accessories).filter(k => !k.startsWith('_'));
```

- [ ] **Step 3: Add validator**

```js
function validateAppearance(a) {
  if (!a || typeof a !== 'object') return 'appearance required';
  const faces = FACE_NAMES();
  const bodies = BODY_NAMES();
  const accs   = ACC_NAMES();
  if (faces.length && !faces.includes(a.face))                return `unknown face: ${a.face}`;
  if (bodies.length && !bodies.includes(a.bodyPreset))        return `unknown bodyPreset: ${a.bodyPreset}`;
  if (!Array.isArray(a.accessories))                          return 'accessories must be array';
  for (const acc of a.accessories) {
    if (accs.length && !accs.includes(acc))                   return `unknown accessory: ${acc}`;
  }
  if (a.proportions && typeof a.proportions !== 'object')     return 'proportions must be object';
  return null;
}
```

- [ ] **Step 4: Migrate `loadPresets` to drop legacy entries**

```js
function loadPresets() {
  if (!fs.existsSync(PRESETS_FILE)) return [];
  const raw = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
  const migrated = raw.filter(p => p.appearance && !p.outfit);
  if (migrated.length !== raw.length) {
    console.log(`[presets] dropped ${raw.length - migrated.length} legacy preset(s) with old outfit schema`);
    savePresets(migrated);
  }
  return migrated;
}
```

- [ ] **Step 5: Replace `POST /presets` handler**

```js
app.post('/presets', asyncHandler(async (req, res) => {
  const { name, appearance } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name required' });
  }
  const err = validateAppearance(appearance);
  if (err) return res.status(400).json({ error: err });

  const preset = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    appearance,
  };
  const presets = loadPresets();
  presets.push(preset);
  savePresets(presets);
  res.status(201).json(preset);
}));
```

If `crypto` isn't already required: `const crypto = require('crypto');` at the top.

- [ ] **Step 6: Smoke-test**

```bash
cd brett && node server.js &
SERVER_PID=$!
sleep 1
curl -sS -X POST http://localhost:3000/presets -H 'content-type: application/json' -d '{}' | jq .
curl -sS -X POST http://localhost:3000/presets -H 'content-type: application/json' \
  -d '{"name":"x","appearance":{"face":"bogus","bodyPreset":"adult-average","accessories":[]}}' | jq .
curl -sS -X POST http://localhost:3000/presets -H 'content-type: application/json' \
  -d '{"name":"Test","appearance":{"face":"neutral","bodyPreset":"adult-average","accessories":["cap"]}}' | jq .
curl -sS http://localhost:3000/presets | jq '. | length'
kill "$SERVER_PID"
rm -f presets.json
cd ..
```
Expected: error error success, count ≥ 1.

- [ ] **Step 7: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): migrate /presets to appearance schema, drop legacy entries on load"
```

---

## Task 4: Server — `appearance` WS message + snapshot extension

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Locate the WS message switch**

```bash
grep -n "type === 'snapshot'\|type === 'walk'\|wss.on\|ws.on('message'" brett/server.js
```

- [ ] **Step 2: Add the `appearance` branch**

Inside the existing `ws.on('message', ...)` switch:

```js
} else if (msg.type === 'appearance') {
  const fig = room.figures.get(msg.id);
  if (!fig) return;
  const err = validateAppearance(msg.appearance);
  if (err) { console.warn(`[ws] rejected appearance for ${msg.id}: ${err}`); return; }
  fig.appearance = msg.appearance;
  broadcast(room, JSON.stringify({ type: 'appearance', id: msg.id, appearance: msg.appearance }), ws);
}
```

(Mirror whatever broadcast helper / room iteration the existing code already uses.)

- [ ] **Step 3: Extend the snapshot serializer**

Add `appearance: f.appearance ?? null` to each figure in the snapshot map:

```js
figures: Array.from(room.figures.values()).map(f => ({
  id: f.id, type: f.type, x: f.x, z: f.z,
  preset: f.preset ?? null,
  appearance: f.appearance ?? null,
}))
```

- [ ] **Step 4: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): appearance WS message + snapshot extension"
```

---

## Task 5: Client — load spec, cache textures, head-face application

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add loader/cache**

Near the top of the main `<script>`:

```js
let SPEC = { faces: {}, accessories: {}, bodies: {} };
const _texCache = new Map();
const _texLoader = new THREE.TextureLoader();

async function loadFigurePackSpec() {
  const res = await fetch('/assets/figure-pack/placement_spec.json');
  SPEC = await res.json();
}

function loadTex(relPath) {
  if (_texCache.has(relPath)) return _texCache.get(relPath);
  const p = new Promise((resolve, reject) => {
    _texLoader.load(`/assets/figure-pack/${relPath}`,
      t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; resolve(t); },
      undefined, reject);
  });
  _texCache.set(relPath, p);
  return p;
}
```

- [ ] **Step 2: Call `loadFigurePackSpec()` at bootstrap**

Wrap existing bootstrap in:

```js
(async () => {
  await loadFigurePackSpec();
  // ...existing bootstrap...
})();
```

- [ ] **Step 3: Tag headMesh in `makeMannequin`**

Find the `THREE.Mesh` added to `bones.head` and assign `fig.headMesh = headMesh;` at the end of `makeMannequin`.

- [ ] **Step 4: Add `applyFace`**

```js
async function applyFace(fig, name) {
  const spec = SPEC.faces?.[name];
  if (!spec) return;
  const tex = await loadTex(spec.file);
  const m = fig.headMesh.material;
  m.map = tex;
  m.transparent = true;
  m.alphaTest = 0.5;
  m.color.setHex(0xd9c89b);
  m.needsUpdate = true;
  fig.appearance = { ...(fig.appearance ?? {}), face: name };
}
```

- [ ] **Step 5: Manual verify (console)**

```js
await loadFigurePackSpec();
await applyFace(STATE.figures[0], 'curious');
```
Expected: face texture appears on the head sphere.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): client spec loader + applyFace head texturing"
```

---

## Task 6: Client — accessories with billboard, body preset + proportions

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add `applyAccessories`**

```js
const NECK_FALLBACK = { bone: 'head', y: -0.18 };

async function applyAccessories(fig, names) {
  for (const bone of Object.values(fig.bones)) {
    [...bone.children]
      .filter(c => c.name?.startsWith('accessory:'))
      .forEach(c => bone.remove(c));
  }
  for (const name of names) {
    const spec = SPEC.accessories?.[name];
    if (!spec) continue;
    const tex = await loadTex(spec.file);
    const [w, h] = spec.sizeMeters;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.5,
      side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    let boneKey = spec.bone;
    let extraY  = 0;
    if (!fig.bones[boneKey]) { boneKey = NECK_FALLBACK.bone; extraY = NECK_FALLBACK.y; }
    const [ox, oy, oz] = spec.positionOffset;
    mesh.position.set(ox, oy + extraY, oz);
    const [rx, ry, rz] = spec.rotation;
    mesh.userData.baseRot = { x: rx, y: ry, z: rz };
    mesh.rotation.set(rx, ry, rz);
    mesh.userData.billboard = spec.billboard || false;
    mesh.name = `accessory:${name}`;
    fig.bones[boneKey].add(mesh);
  }
  fig.appearance = { ...(fig.appearance ?? {}), accessories: names.slice() };
}
```

- [ ] **Step 2: Add billboard updater + render-loop hook**

```js
const _tmpV = new THREE.Vector3();
function updateBillboards(scene, camera) {
  scene.traverse(obj => {
    if (obj.userData?.billboard !== 'yAxis') return;
    obj.getWorldPosition(_tmpV);
    const angle = Math.atan2(camera.position.x - _tmpV.x, camera.position.z - _tmpV.z);
    obj.rotation.set(obj.userData.baseRot.x, angle, obj.userData.baseRot.z);
  });
}
```

Add `updateBillboards(scene, camera);` immediately before the existing `renderer.render(scene, camera);` call.

- [ ] **Step 3: Add body-preset + proportions**

```js
function applyBodyPreset(fig, name) {
  const preset = SPEC.bodies?.[name];
  if (!preset) return;
  const base = SPEC.bodies['adult-average'].scale;
  const s = preset.scale;
  const proportions = {
    upperArm: s.upperArm / base.upperArm,
    forearm:  s.forearm  / base.forearm,
    thigh:    s.thigh    / base.thigh,
    shin:     s.shin     / base.shin,
    torso:    s.torsoH   / base.torsoH,
    head:     1.0,
  };
  fig.bones.head.rotation.x = (name === 'elder') ? 0.105 : 0;
  applyProportions(fig, proportions);
  fig.appearance = { ...(fig.appearance ?? {}), bodyPreset: name, proportions };
}

function applyProportions(fig, props) {
  const B = fig.baseLengths;
  scaleSegment(fig.bones.lShoulder, fig.bones.lElbow, B.upperArm, props.upperArm);
  scaleSegment(fig.bones.rShoulder, fig.bones.rElbow, B.upperArm, props.upperArm);
  scaleSegment(fig.bones.lElbow,    fig.bones.lWrist, B.forearm,  props.forearm);
  scaleSegment(fig.bones.rElbow,    fig.bones.rWrist, B.forearm,  props.forearm);
  scaleSegment(fig.bones.lHip,      fig.bones.lKnee,  B.thigh,    props.thigh);
  scaleSegment(fig.bones.rHip,      fig.bones.rKnee,  B.thigh,    props.thigh);
  scaleSegment(fig.bones.lKnee,     fig.bones.lAnkle, B.shin,     props.shin);
  scaleSegment(fig.bones.rKnee,     fig.bones.rAnkle, B.shin,     props.shin);
  fig.bones.head.scale.setScalar(props.head);
}

function scaleSegment(parent, child, baseLen, factor) {
  parent.scale.y = factor;
  child.position.y = -baseLen * factor;
  const sphere = parent.children.find(c => c.userData?.isContact);
  if (sphere) sphere.scale.y = 1 / factor;
}
```

- [ ] **Step 4: Record baseLengths in `makeMannequin`**

```js
fig.baseLengths = { upperArm: 0.32, forearm: 0.30, thigh: 0.42, shin: 0.40, torso: 0.70 };
```

And tag every contact-sphere child with `sphere.userData.isContact = true;` at the place where bones are decorated.

- [ ] **Step 5: Composite `applyAppearance`**

```js
async function applyAppearance(fig, a) {
  if (!a) return;
  if (a.face)              await applyFace(fig, a.face);
  if (a.bodyPreset)        applyBodyPreset(fig, a.bodyPreset);
  if (a.proportions)       applyProportions(fig, a.proportions);
  if (Array.isArray(a.accessories)) await applyAccessories(fig, a.accessories);
  fig.appearance = { face: a.face, bodyPreset: a.bodyPreset, proportions: a.proportions, accessories: a.accessories };
}
```

- [ ] **Step 6: Manual verify in browser console**

```js
await applyBodyPreset(STATE.figures[0], 'elder');
await applyAccessories(STATE.figures[0], ['cane', 'shawl', 'cap']);
```
Expected: stooped smaller figure, cane on right wrist, shawl draped at neck level, cap above head. Camera orbit keeps billboard items facing camera.

- [ ] **Step 7: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): client applyAccessories + applyBodyPreset + billboarding"
```

---

## Task 7: Client — WS appearance broadcast + snapshot consumption

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Debounced broadcaster**

```js
let _appearanceBroadcast = null;
function broadcastAppearance(fig) {
  clearTimeout(_appearanceBroadcast);
  _appearanceBroadcast = setTimeout(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'appearance', id: fig.id, appearance: fig.appearance }));
    }
  }, 100);
}
```

- [ ] **Step 2: Inbound handler**

In the existing `ws.onmessage` dispatcher:

```js
} else if (msg.type === 'appearance') {
  const fig = STATE.figures.find(f => f.id === msg.id);
  if (fig) applyAppearance(fig, msg.appearance);
}
```

- [ ] **Step 3: Apply from snapshot**

In the snapshot handler, after each figure is located/created:

```js
if (f.appearance) applyAppearance(fig, f.appearance);
```

- [ ] **Step 4: Manual verify two-tab sync**

Open two windows on the same room. Change face/body in tab 1 via the bubble (after Task 9), tab 2 reflects within ~200ms.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): WS appearance broadcast + snapshot consumption"
```

---

## Task 8: Client — editor bubble HTML + CSS (mentolder tokens)

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Link the brand stylesheet in `<head>`**

```html
<link rel="stylesheet" href="/assets/figure-pack/colors_and_type.css">
```

- [ ] **Step 2: Insert the bubble markup at end of `<body>`**

```html
<div id="edit-bubble" hidden>
  <div class="bubble-head">
    <span class="bubble-title">✦ Figur einrichten</span>
    <button id="edit-close" class="icon-btn" aria-label="Schließen">✕</button>
  </div>

  <section class="bubble-section">
    <span class="bubble-label">Gesicht</span>
    <div id="face-grid" class="face-grid"></div>
  </section>

  <section class="bubble-section">
    <span class="bubble-label">Körper</span>
    <div id="body-row" class="seg-row"></div>
  </section>

  <section class="bubble-section">
    <span class="bubble-label">Proportionen <button id="prop-reset" class="link-btn">↻ Reset</button></span>
    <div id="prop-sliders"></div>
  </section>

  <section class="bubble-section">
    <span class="bubble-label">Zubehör</span>
    <div id="acc-head"  class="acc-group" data-group="head"></div>
    <div id="acc-torso" class="acc-group" data-group="torso"></div>
    <div id="acc-other" class="acc-group" data-group="other"></div>
  </section>

  <div class="bubble-actions">
    <button id="acc-random" class="action-btn">🎲 Würfeln</button>
    <button id="acc-save"   class="action-btn">💾 Speichern</button>
    <select id="acc-presets" class="action-btn"></select>
  </div>
</div>
```

- [ ] **Step 3: Add CSS (inside the existing `<style>`)**

```css
#edit-bubble {
  position: fixed; z-index: 50;
  width: 320px; padding: 16px;
  background: var(--slate-1, #161922);
  border: 1px solid var(--slate-3, #2a3040);
  border-radius: 14px;
  box-shadow: var(--shadow-2, 0 10px 30px rgba(0,0,0,0.4));
  color: var(--parchment, #e7ead0);
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
}
#edit-bubble[hidden] { display: none; }
.bubble-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.bubble-title { font-family: 'Newsreader', serif; font-size: 16px; }
.bubble-section { margin-bottom: 14px; }
.bubble-label { display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--parchment-3, #7c8071); margin-bottom: 6px; }
.face-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.face-grid button { width: 40px; height: 40px; padding: 0; border-radius: 50%; border: 1px solid transparent;
  background-size: cover; cursor: pointer; }
.face-grid button.active { border-color: var(--brass, #c8a96e); box-shadow: 0 0 0 2px var(--brass, #c8a96e); }
.seg-row { display: flex; gap: 4px; flex-wrap: wrap; }
.seg-row button { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--slate-3, #2a3040);
  background: transparent; color: inherit; cursor: pointer; font-size: 11px; }
.seg-row button.active { background: var(--brass, #c8a96e); color: var(--slate-0, #0e1014); border-color: var(--brass, #c8a96e); }
.acc-group { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.acc-group button { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--slate-3, #2a3040);
  background: transparent; color: inherit; cursor: pointer; font-size: 11px; }
.acc-group button.active { background: var(--brass, #c8a96e); color: var(--slate-0, #0e1014); border-color: var(--brass, #c8a96e); }
.prop-row { display: grid; grid-template-columns: 90px 1fr 50px; gap: 8px; align-items: center; margin-bottom: 4px; }
.prop-row .val { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 11px; text-align: right; }
.prop-row input[type=range] { accent-color: var(--brass, #c8a96e); }
.bubble-actions { display: flex; gap: 6px; margin-top: 10px; }
.action-btn { flex: 1; padding: 6px 10px; border: 1px solid var(--slate-3, #2a3040); border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer; font: inherit; }
.action-btn:hover { background: var(--slate-2, #1f2330); }
.link-btn { background: transparent; border: none; color: var(--brass, #c8a96e); cursor: pointer;
  font: inherit; padding: 0 4px; float: right; }
.icon-btn { background: transparent; color: inherit; border: 1px solid var(--slate-3, #2a3040);
  border-radius: 4px; padding: 2px 8px; cursor: pointer; font: inherit; }
```

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): editor bubble markup + mentolder tokens CSS"
```

---

## Task 9: Client — bubble wiring (uses `createElement` + `textContent`, never `innerHTML`)

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Constants + helpers**

```js
const ACC_GROUPS = {
  head:  ['cap', 'crown', 'veil', 'blindfold'],   // max 1
  torso: ['shawl', 'swaddle'],                    // max 1
  other: ['satchel', 'cane'],                     // free combo
};
const BODY_LABEL = {
  child: 'child', adolescent: 'adolescent',
  'adult-short': 'short', 'adult-average': 'avg', 'adult-tall': 'tall',
  elder: 'elder',
};
const PROP_LABEL = {
  upperArm:'Oberarm', forearm:'Unterarm',
  thigh:'Oberschenkel', shin:'Unterschenkel',
  torso:'Torso', head:'Kopf',
};

function applyAccGroupRule(current, picked) {
  const groupOf = name => {
    for (const [g, members] of Object.entries(ACC_GROUPS)) if (members.includes(name)) return g;
    return null;
  };
  const g = groupOf(picked);
  if (!g) return current;
  let next = current.slice();
  if (g === 'head' || g === 'torso') {
    const wasActive = current.includes(picked);
    next = next.filter(n => !ACC_GROUPS[g].includes(n));
    if (!wasActive) next.push(picked);
  } else {
    next = current.includes(picked) ? current.filter(n => n !== picked) : [...current, picked];
  }
  return next;
}

function clearNode(el) { while (el.firstChild) el.removeChild(el.firstChild); }
```

- [ ] **Step 2: Open/close + render-loop follow**

```js
const bubble = document.getElementById('edit-bubble');
let editFig = null;

function openEditor(fig) {
  if (!fig) return;
  editFig = fig;
  bubble.hidden = false;
  populateBubble(fig);
}
function closeEditor() {
  editFig = null;
  bubble.hidden = true;
}
document.getElementById('edit-close').addEventListener('click', closeEditor);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEditor();
  if (e.key.toLowerCase() === 'e' && STATE.selectedId) {
    openEditor(STATE.figures.find(f => f.id === STATE.selectedId));
  }
});
renderer.domElement.addEventListener('dblclick', () => {
  if (STATE.selectedId) openEditor(STATE.figures.find(f => f.id === STATE.selectedId));
});

function updateBubblePosition() {
  if (!editFig || bubble.hidden) return;
  const p = new THREE.Vector3();
  editFig.root.getWorldPosition(p);
  p.project(camera);
  const x = (p.x + 1) / 2 * window.innerWidth + 80;
  const y = (1 - p.y) / 2 * window.innerHeight - bubble.offsetHeight / 2;
  bubble.style.left = Math.max(8, Math.min(window.innerWidth - 8 - bubble.offsetWidth, x)) + 'px';
  bubble.style.top  = Math.max(8, Math.min(window.innerHeight - 8 - bubble.offsetHeight, y)) + 'px';
}
```

Add `updateBubblePosition()` next to `updateBillboards(scene, camera);` in the render loop.

- [ ] **Step 3: Populate (safe DOM construction — no innerHTML)**

```js
function makeButton(text, onClick, opts = {}) {
  const b = document.createElement('button');
  if (text !== undefined) b.textContent = text;
  if (opts.title) b.title = opts.title;
  if (opts.bg)    b.style.backgroundImage = `url(${opts.bg})`;
  if (opts.active) b.classList.add('active');
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function populateBubble(fig) {
  const a = fig.appearance ?? {
    face: 'neutral', bodyPreset: 'adult-average',
    accessories: [], proportions: null,
  };

  // ---- Faces ----
  const faceGrid = document.getElementById('face-grid');
  clearNode(faceGrid);
  for (const name of Object.keys(SPEC.faces).filter(k => !k.startsWith('_'))) {
    faceGrid.appendChild(makeButton(undefined, async () => {
      await applyFace(fig, name);
      broadcastAppearance(fig);
      populateBubble(fig);
    }, {
      title: name,
      bg: `/assets/figure-pack/faces/${name}.png`,
      active: a.face === name,
    }));
  }

  // ---- Bodies ----
  const bodyRow = document.getElementById('body-row');
  clearNode(bodyRow);
  for (const name of Object.keys(SPEC.bodies).filter(k => !k.startsWith('_'))) {
    bodyRow.appendChild(makeButton(BODY_LABEL[name] ?? name, () => {
      applyBodyPreset(fig, name);
      broadcastAppearance(fig);
      populateBubble(fig);
    }, { active: a.bodyPreset === name }));
  }

  // ---- Proportions ----
  const props = document.getElementById('prop-sliders');
  clearNode(props);
  const current = { ...(fig.appearance?.proportions ?? { upperArm:1, forearm:1, thigh:1, shin:1, torso:1, head:1 }) };
  for (const k of ['upperArm','forearm','thigh','shin','torso','head']) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lab = document.createElement('span');
    lab.textContent = PROP_LABEL[k];

    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = '0.5'; inp.max = '2.0'; inp.step = '0.05';
    inp.value = String(current[k]);

    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = current[k].toFixed(2) + '×';

    inp.addEventListener('input', () => {
      current[k] = parseFloat(inp.value);
      val.textContent = current[k].toFixed(2) + '×';
      fig.appearance = { ...(fig.appearance ?? {}), proportions: { ...current } };
      applyProportions(fig, current);
      broadcastAppearance(fig);
    });

    row.append(lab, inp, val);
    props.appendChild(row);
  }
  document.getElementById('prop-reset').onclick = () => {
    applyBodyPreset(fig, a.bodyPreset ?? 'adult-average');
    broadcastAppearance(fig);
    populateBubble(fig);
  };

  // ---- Accessories ----
  for (const [group, members] of Object.entries(ACC_GROUPS)) {
    const root = document.getElementById('acc-' + group);
    clearNode(root);
    for (const name of members) {
      root.appendChild(makeButton(name, async () => {
        const next = applyAccGroupRule(a.accessories ?? [], name);
        await applyAccessories(fig, next);
        broadcastAppearance(fig);
        populateBubble(fig);
      }, { active: (a.accessories ?? []).includes(name) }));
    }
  }

  // ---- Actions ----
  document.getElementById('acc-random').onclick = () => randomiseAppearance(fig);
  document.getElementById('acc-save').onclick   = () => savePresetPrompt(fig);
  refreshPresetList(fig);
}
```

- [ ] **Step 4: Random + save + preset list (safe DOM)**

```js
function randomiseAppearance(fig) {
  const faces  = Object.keys(SPEC.faces).filter(k => !k.startsWith('_'));
  const bodies = Object.keys(SPEC.bodies).filter(k => !k.startsWith('_'));
  const pickFrom = arr => arr[Math.floor(Math.random() * arr.length)];
  const head  = pickFrom([...ACC_GROUPS.head,  null, null]);  // ~33% bare
  const torso = pickFrom([...ACC_GROUPS.torso, null, null]);
  const acc = [
    head, torso,
    Math.random() < 0.3  ? 'satchel' : null,
    Math.random() < 0.15 ? 'cane'    : null,
  ].filter(Boolean);
  (async () => {
    await applyAppearance(fig, {
      face: pickFrom(faces),
      bodyPreset: pickFrom(bodies),
      accessories: acc,
      proportions: null,
    });
    broadcastAppearance(fig);
    populateBubble(fig);
  })();
}

async function savePresetPrompt(fig) {
  const name = prompt('Preset-Name?');
  if (!name) return;
  await fetch('/presets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, appearance: fig.appearance }),
  });
  refreshPresetList(fig);
}

async function refreshPresetList(fig) {
  const sel = document.getElementById('acc-presets');
  clearNode(sel);
  const placeholder = document.createElement('option');
  placeholder.textContent = 'Presets…';
  placeholder.value = '';
  sel.appendChild(placeholder);

  const list = await fetch('/presets').then(r => r.json()).catch(() => []);
  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;   // textContent: HTML in name renders literally, no XSS
    sel.appendChild(opt);
  }
  sel.onchange = async () => {
    const p = list.find(x => x.id === sel.value);
    if (!p) return;
    await applyAppearance(fig, p.appearance);
    broadcastAppearance(fig);
    populateBubble(fig);
    sel.value = '';
  };
}
```

- [ ] **Step 5: Manual verify (local)**

```bash
cd brett && node server.js &
SERVER_PID=$!
sleep 1
# open http://localhost:3000 in browser
```
Click figure → `E` → bubble opens, follows. Try each control. `kill $SERVER_PID` when done.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): editor bubble wiring (face/body/proportions/accessories/random/presets)"
```

---

## Task 10: Camera tween in + out of edit mode

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Save + restore camera state**

```js
let _camSnapshot = null;
function tweenCameraTo(targetPos, targetLook, frames = 24) {
  if (!_camSnapshot) _camSnapshot = {
    pos: camera.position.clone(),
    target: (controls?.target ?? new THREE.Vector3(0, 1, 0)).clone(),
  };
  let f = 0;
  function step() {
    f++;
    const t = Math.min(1, f / frames);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    camera.position.lerp(targetPos, ease);
    if (controls?.target) controls.target.lerp(targetLook, ease);
    else camera.lookAt(targetLook);
    if (f < frames) requestAnimationFrame(step);
  }
  step();
}

function restoreCamera() {
  if (!_camSnapshot) return;
  const { pos, target } = _camSnapshot;
  _camSnapshot = null;
  tweenCameraTo(pos, target);
}
```

- [ ] **Step 2: Hook into openEditor / closeEditor**

In `openEditor` (after `populateBubble`):

```js
const figPos = new THREE.Vector3();
fig.root.getWorldPosition(figPos);
const target = figPos.clone().add(new THREE.Vector3(2, 1.5, 2));
tweenCameraTo(target, figPos);
```

In `closeEditor` (before setting `bubble.hidden = true`):

```js
restoreCamera();
```

- [ ] **Step 3: Manual verify**

Open editor → camera glides ~0.4s toward figure. Close → glides back.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): camera tween in/out of edit mode"
```

---

## Task 11: Full verification

**Files:** (no edits)

- [ ] **Step 1: Full offline suite**

```bash
task test:all
```
Expected: green, including `figure-pack-assets.test.sh`.

- [ ] **Step 2: Validate manifests**

```bash
task workspace:validate
```

- [ ] **Step 3: Local end-to-end**

```bash
cd brett && node server.js &
SERVER_PID=$!
sleep 1
xdg-open http://localhost:3000 || open http://localhost:3000
```

Run through this checklist while clicking:
- [ ] Add a figure → defaults: face `neutral`, body `adult-average`
- [ ] Press `E` (or doppelklick) → bubble opens, follows on camera move
- [ ] All 12 faces apply
- [ ] All 6 body presets update sliders + proportions
- [ ] Head-cover group: picking `crown` while `cap` is active removes `cap`
- [ ] Torso group: picking `swaddle` while `shawl` is active removes `shawl`
- [ ] `cane` + `satchel` combine freely
- [ ] `🎲 Würfeln` 10× — varied output, no conflicts
- [ ] `💾 Speichern` round-trips via `Presets…`
- [ ] Two browser tabs sync within 200ms
- [ ] `[✕]` + Escape both close bubble
- [ ] Camera returns to original framing on close

```bash
kill "$SERVER_PID"
```

- [ ] **Step 4: Commit any small follow-up fixes (if needed)**

---

## Task 12: Open PR

**Files:** (no source edits)

- [ ] **Step 1: Push**

```bash
git push -u origin feature/brett-figure-pack
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(brett): figure-pack editor — faces, body presets, accessories, random" \
  --body "$(cat <<'EOF'
## Summary
- Replace the placeholder character editor (PR #746, erased by #748) with a figure-pack editor driven by the Systembrett Assets design system: 12 face textures, 6 body proportion presets, 8 accessories.
- Server: `/presets` schema migrates to `{ appearance: { face, bodyPreset, accessories, proportions } }`; legacy entries dropped on load; WS gets new `appearance` message + extended snapshot.
- Client: editor bubble in mentolder brand tokens, multi-select accessories with head/torso conflict groups, body preset auto-fills proportion sliders, `🎲 Würfeln` random-assign button.

Spec: `docs/superpowers/specs/2026-05-14-brett-figure-pack-design.md`
Plan: `docs/superpowers/plans/2026-05-14-brett-figure-pack.md`

## Test plan
- [x] `task test:all` green (incl. new `figure-pack-assets.test.sh`)
- [x] `task workspace:validate` green
- [x] Local end-to-end: 12 faces, 6 bodies, all accessory groups, conflict rules, random, save/load preset, two-tab sync, camera tween
- [ ] Post-merge: `task feature:brett` + smoke `https://brett.mentolder.de`, `https://brett.korczewski.de`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Enable auto-merge once CI is green**

```bash
PR=$(gh pr view --json number -q .number)
gh pr merge "$PR" --squash --auto
```

---

## Post-merge deploy (handled by dev-flow-execute)

```bash
task feature:brett
# smoke
curl -sSI https://brett.mentolder.de | head -3
curl -sSI https://brett.korczewski.de | head -3
```
