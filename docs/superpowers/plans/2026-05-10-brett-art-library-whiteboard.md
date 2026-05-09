# Brett Art Library + Whiteboard Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 Kore-styled SVG figurines to the Brett 3D board via a dynamic art library, and embed the 6 kore-assets as Excalidraw library items in `systembrett.whiteboard`.

**Architecture:** Brett reads `brett/public/art-library/manifest.json` at startup (already wired via `bootArtLibrary()`), loads SVG sprites as Three.js billboard textures, and now dynamically generates toolbar buttons from the manifest instead of using 4 hard-coded HTML buttons. The whiteboard file is standard Excalidraw JSON — library items are added by embedding base64-encoded assets into `files` and `libraryItems`.

**Tech Stack:** Plain SVG, vanilla JS DOM APIs, Three.js sprites (existing), Python 3 for whiteboard patching, Excalidraw JSON format.

---

## File Map

```
brett/public/art-library/          ← new directory (static, served by express.static)
  manifest.json                    ← asset registry
  person.svg                       ← adult stick figure, #C8F76A, 240×400
  kind.svg                         ← child figure (smaller, lower), #5BD4D0, 240×400
  gruppe.svg                       ← pair of figures, #C8F76A, 240×400
  tier.svg                         ← animal profile, #D7B06A, 240×400
  system.svg                       ← server rack shape, #9B7DFF, 240×400
  objekt.svg                       ← isometric block, #8A93A0, 240×400
brett/public/index.html            ← remove 4 hard-coded buttons; add #figure-buttons div;
                                      replace slot-injection loop with dynamic button creation
website/public/systembrett/systembrett.whiteboard
                                   ← add 6 libraryItems + 6 file entries (base64 SVG/JPG)
```

---

### Task 1: Create the 6 SVG figurines

All files use `viewBox="0 0 240 400"` — the canvas size `bootArtLibrary()` renders them into. Transparent background (no `<rect>`). Stroke-based line art with `stroke-linecap="round"`.

**Files:** Create `brett/public/art-library/person.svg`, `kind.svg`, `gruppe.svg`, `tier.svg`, `system.svg`, `objekt.svg`

- [ ] **Step 1: Create `brett/public/art-library/person.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="110" x2="120" y2="242" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="54" y2="208" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="152" x2="186" y2="208" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="76" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
  <line x1="120" y1="242" x2="164" y2="366" stroke="#C8F76A" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Create `brett/public/art-library/kind.svg`**

Child figure drawn in the lower ~75% of the canvas so it appears shorter as a 3D sprite (same sprite scale as adults, but drawing occupies less vertical space).

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="120" cy="148" r="30" fill="none" stroke="#5BD4D0" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="178" x2="120" y2="278" stroke="#5BD4D0" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="210" x2="72" y2="252" stroke="#5BD4D0" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="210" x2="168" y2="252" stroke="#5BD4D0" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="278" x2="88" y2="370" stroke="#5BD4D0" stroke-width="5" stroke-linecap="round"/>
  <line x1="120" y1="278" x2="152" y2="370" stroke="#5BD4D0" stroke-width="5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Create `brett/public/art-library/gruppe.svg`**

Two figures side by side. Dashed lines between inner arms suggest connection.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <circle cx="76" cy="72" r="30" fill="none" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="76" y1="102" x2="76" y2="210" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="76" y1="142" x2="36" y2="182" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="76" y1="142" x2="114" y2="174" stroke="#C8F76A" stroke-width="4" stroke-linecap="round" stroke-dasharray="5,4"/>
  <line x1="76" y1="210" x2="50" y2="320" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="76" y1="210" x2="102" y2="320" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="164" cy="72" r="30" fill="none" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="164" y1="102" x2="164" y2="210" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="164" y1="142" x2="126" y2="174" stroke="#C8F76A" stroke-width="4" stroke-linecap="round" stroke-dasharray="5,4"/>
  <line x1="164" y1="142" x2="204" y2="182" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="164" y1="210" x2="138" y2="320" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="164" y1="210" x2="190" y2="320" stroke="#C8F76A" stroke-width="4.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Create `brett/public/art-library/tier.svg`**

Animal in side-profile: elliptical body, head, ear, 4 legs, tail.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <ellipse cx="120" cy="200" rx="74" ry="46" fill="none" stroke="#D7B06A" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="196" cy="158" rx="30" ry="26" fill="none" stroke="#D7B06A" stroke-width="5" stroke-linecap="round"/>
  <path d="M 180 136 L 188 112 L 204 132" fill="none" stroke="#D7B06A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="158" y1="242" x2="150" y2="340" stroke="#D7B06A" stroke-width="5" stroke-linecap="round"/>
  <line x1="174" y1="244" x2="168" y2="340" stroke="#D7B06A" stroke-width="5" stroke-linecap="round"/>
  <line x1="68" y1="242" x2="60" y2="340" stroke="#D7B06A" stroke-width="5" stroke-linecap="round"/>
  <line x1="82" y1="244" x2="76" y2="340" stroke="#D7B06A" stroke-width="5" stroke-linecap="round"/>
  <path d="M 47 188 Q 24 138 44 96" fill="none" stroke="#D7B06A" stroke-width="4.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: Create `brett/public/art-library/system.svg`**

Server rack: outer rectangle, divider lines, status LEDs, rack unit bars, base mount.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <rect x="58" y="68" width="124" height="248" rx="10" fill="none" stroke="#9B7DFF" stroke-width="5"/>
  <line x1="58" y1="112" x2="182" y2="112" stroke="#9B7DFF" stroke-width="2.5"/>
  <line x1="58" y1="196" x2="182" y2="196" stroke="#9B7DFF" stroke-width="2.5"/>
  <line x1="58" y1="268" x2="182" y2="268" stroke="#9B7DFF" stroke-width="2.5"/>
  <circle cx="80" cy="89" r="6" fill="#9B7DFF"/>
  <circle cx="98" cy="89" r="6" fill="#9B7DFF"/>
  <circle cx="116" cy="89" r="6" fill="#9B7DFF"/>
  <rect x="70" y="124" width="100" height="20" rx="3" fill="#9B7DFF" fill-opacity="0.5"/>
  <rect x="70" y="154" width="72" height="12" rx="3" fill="#9B7DFF" fill-opacity="0.3"/>
  <rect x="70" y="208" width="100" height="20" rx="3" fill="#9B7DFF" fill-opacity="0.5"/>
  <rect x="70" y="240" width="58" height="12" rx="3" fill="#9B7DFF" fill-opacity="0.3"/>
  <rect x="78" y="316" width="84" height="10" rx="3" fill="none" stroke="#9B7DFF" stroke-width="3"/>
</svg>
```

- [ ] **Step 6: Create `brett/public/art-library/objekt.svg`**

Isometric box: top face, left face, right face — three polygon outlines.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 400">
  <polygon points="120,88 196,164 120,240 44,164" fill="none" stroke="#8A93A0" stroke-width="5" stroke-linejoin="round"/>
  <polygon points="44,164 120,240 120,362 44,286" fill="none" stroke="#8A93A0" stroke-width="5" stroke-linejoin="round"/>
  <polygon points="196,164 120,240 120,362 196,286" fill="none" stroke="#8A93A0" stroke-width="5" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 7: Verify all SVGs are valid XML**

```bash
cd /home/patrick/Bachelorprojekt
for f in brett/public/art-library/*.svg; do
  python3 -c "import xml.etree.ElementTree as ET; ET.parse('$f'); print('OK:', '$f')"
done
```

Expected: `OK: brett/public/art-library/gruppe.svg` × 6 (one line per file)

- [ ] **Step 8: Commit**

```bash
git add brett/public/art-library/
git commit -m "feat(brett): add 6 kore-styled SVG figurines for art library"
```

---

### Task 2: Create manifest.json

**File:** Create `brett/public/art-library/manifest.json`

- [ ] **Step 1: Create the manifest**

```json
{
  "version": "1",
  "assets": [
    { "id": "person",  "kind": "character", "label": "Person",  "files": { "figurine": "person.svg"  } },
    { "id": "kind",    "kind": "character", "label": "Kind",    "files": { "figurine": "kind.svg"    } },
    { "id": "gruppe",  "kind": "character", "label": "Gruppe",  "files": { "figurine": "gruppe.svg"  } },
    { "id": "tier",    "kind": "character", "label": "Tier",    "files": { "figurine": "tier.svg"    } },
    { "id": "system",  "kind": "character", "label": "System",  "files": { "figurine": "system.svg"  } },
    { "id": "objekt",  "kind": "character", "label": "Objekt",  "files": { "figurine": "objekt.svg"  } }
  ]
}
```

- [ ] **Step 2: Verify manifest is valid and complete**

```bash
cd /home/patrick/Bachelorprojekt
node -e "
const m = require('./brett/public/art-library/manifest.json');
const expected = ['person','kind','gruppe','tier','system','objekt'];
console.assert(m.assets.length === 6, 'wrong count');
expected.forEach(id => {
  const a = m.assets.find(x => x.id === id);
  console.assert(a, 'missing: ' + id);
  console.assert(a.kind === 'character', 'wrong kind: ' + id);
  console.assert(a.files && a.files.figurine, 'missing figurine: ' + id);
});
console.log('manifest OK — 6 assets');
"
```

Expected: `manifest OK — 6 assets`

- [ ] **Step 3: Commit**

```bash
git add brett/public/art-library/manifest.json
git commit -m "feat(brett): add art library manifest (6 kore figurines)"
```

---

### Task 3: Update brett/public/index.html — dynamic toolbar

**File:** Modify `brett/public/index.html`

Two changes: (A) replace the 4 hard-coded buttons with an empty container, (B) replace the slot-injection loop in `bootArtLibrary()` with dynamic button creation.

- [ ] **Step 1: Replace the 4 hard-coded figure buttons with an empty container**

In the `<div id="toolbar">` section, find and replace:

```html
  <button class="figure-btn" data-type="figure-01" aria-label="Figur I" title="Figur I">
    <span class="figure-art" data-art-slot="figure-01"></span>
  </button>
  <button class="figure-btn" data-type="figure-02" aria-label="Figur II" title="Figur II">
    <span class="figure-art" data-art-slot="figure-02"></span>
  </button>
  <button class="figure-btn" data-type="figure-03" aria-label="Figur III" title="Figur III">
    <span class="figure-art" data-art-slot="figure-03"></span>
  </button>
  <button class="figure-btn" data-type="figure-04" aria-label="Figur IV" title="Figur IV">
    <span class="figure-art" data-art-slot="figure-04"></span>
  </button>
```

Replace with:

```html
  <div id="figure-buttons" style="display:flex;gap:6px;"></div>
```

- [ ] **Step 2: Replace the slot-injection loop in `bootArtLibrary()` with dynamic button generation**

Inside `bootArtLibrary()`, find and replace the slot-injection loop (the second `for` loop, after the `console.log`):

```js
    for (const id of characterIds) {
      const slot = document.querySelector(`.figure-art[data-art-slot="${id}"]`);
      if (!slot) continue;
      const meta = ART_MANIFEST.assets.find(a => a.id === id);
      const svgText = await fetch('/art-library/' + meta.files.figurine).then(r => r.text());
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svgNode = doc.documentElement;
      while (slot.firstChild) slot.removeChild(slot.firstChild);
      slot.appendChild(document.importNode(svgNode, true));
    }
```

Replace with:

```js
    const container = document.getElementById('figure-buttons');
    for (const a of ART_MANIFEST.assets) {
      if (!characterIds.has(a.id)) continue;
      const btn = document.createElement('button');
      btn.className = 'figure-btn';
      btn.dataset.type = a.id;
      btn.title = a.label || a.id;
      btn.setAttribute('aria-label', a.label || a.id);
      const artSpan = document.createElement('span');
      artSpan.className = 'figure-art';
      btn.appendChild(artSpan);
      const svgText = await fetch('/art-library/' + a.files.figurine).then(r => r.text());
      const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      artSpan.appendChild(document.importNode(parsed.documentElement, true));
      btn.addEventListener('click', () => {
        const x = (Math.random()-0.5)*(BW-4);
        const z = (Math.random()-0.5)*(BD-4);
        const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
        send({ type: 'add', fig: figToJSON(fig) });
        selectFigure(fig);
        openLabelModal(fig);
      });
      container.appendChild(btn);
    }
```

- [ ] **Step 3: Verify the HTML is syntactically valid**

```bash
python3 -c "
from html.parser import HTMLParser
class V(HTMLParser): pass
V().feed(open('brett/public/index.html').read())
print('HTML parse OK')
"
```

Expected: `HTML parse OK`

- [ ] **Step 4: Verify `#figure-buttons` container is present and old buttons are gone**

```bash
python3 -c "
content = open('brett/public/index.html').read()
assert 'id=\"figure-buttons\"' in content, 'missing #figure-buttons'
assert 'data-type=\"figure-01\"' not in content, 'old button still present'
assert 'data-type=\"figure-02\"' not in content, 'old button still present'
print('toolbar OK')
"
```

Expected: `toolbar OK`

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): dynamic toolbar from art-library manifest"
```

---

### Task 4: Embed kore-assets as Excalidraw library items

**File:** Modify `website/public/systembrett/systembrett.whiteboard`

The whiteboard is standard Excalidraw JSON. We add 6 entries to `libraryItems` and 6 entries to `files` (base64-encoded assets).

- [ ] **Step 1: Write the embedding script**

Create a temporary helper script `scripts/add-whiteboard-library.py`:

```python
#!/usr/bin/env python3
import json, base64, uuid, time, os, sys

WHITEBOARD = 'website/public/systembrett/systembrett.whiteboard'
ASSETS_DIR = 'website/public/brand/korczewski/kore-assets'

ASSETS = [
    ('logo-mark.svg',             'Kore Logo Mark',        128,  128, 'image/svg+xml'),
    ('portrait-placeholder.svg',  'Portrait Platzhalter',  200,  250, 'image/svg+xml'),
    ('k8s-wheel.svg',             'K8s Wheel',              64,   64, 'image/svg+xml'),
    ('topology-3node.svg',        'Topology 3-Node',       320,  200, 'image/svg+xml'),
    ('topology-12node.svg',       'Topology 12-Node',      640,  410, 'image/svg+xml'),
    ('portrait.jpg',              'Portrait Foto',         200,  250, 'image/jpeg'),
]

with open(WHITEBOARD) as f:
    data = json.load(f)

ts = 1746921600000  # fixed timestamp for deterministic output

for filename, name, w, h, mime in ASSETS:
    path = os.path.join(ASSETS_DIR, filename)
    with open(path, 'rb') as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()
    data_url = f'data:{mime};base64,{b64}'

    # deterministic IDs based on filename (idempotent re-runs)
    seed = int.from_bytes(filename.encode(), 'little') % (2**31)
    file_id  = f'{seed:016x}'[:16]
    elem_id  = f'{seed+1:016x}'[:16]
    item_id  = f'{seed+2:016x}'[:16]

    # skip if already present
    if any(it.get('name') == name for it in data.get('libraryItems', [])):
        print(f'skip (already present): {name}')
        continue

    data.setdefault('files', {})[file_id] = {
        'mimeType': mime,
        'id': file_id,
        'dataURL': data_url,
        'created': ts,
    }

    data.setdefault('libraryItems', []).append({
        'id': item_id,
        'status': 'published',
        'name': name,
        'elements': [{
            'type': 'image',
            'id': elem_id,
            'x': 0, 'y': 0,
            'width': w, 'height': h,
            'fileId': file_id,
            'status': 'saved',
            'angle': 0,
            'strokeColor': 'transparent',
            'backgroundColor': 'transparent',
            'fillStyle': 'solid',
            'strokeWidth': 1,
            'strokeStyle': 'solid',
            'roughness': 0,
            'opacity': 100,
            'groupIds': [],
            'frameId': None,
            'roundness': None,
            'seed': seed,
            'version': 1,
            'versionNonce': seed + 1,
            'updated': ts,
            'locked': False,
            'link': None,
            'customData': None,
            'isDeleted': False,
            'scale': [1, 1],
        }],
    })
    print(f'added: {name}')

with open(WHITEBOARD, 'w') as f:
    json.dump(data, f, separators=(',', ':'))

print('done')
```

- [ ] **Step 2: Run the script**

```bash
cd /home/patrick/Bachelorprojekt
python3 scripts/add-whiteboard-library.py
```

Expected output:
```
added: Kore Logo Mark
added: Portrait Platzhalter
added: K8s Wheel
added: Topology 3-Node
added: Topology 12-Node
added: Portrait Foto
done
```

- [ ] **Step 3: Verify the whiteboard file**

```bash
python3 -c "
import json
with open('website/public/systembrett/systembrett.whiteboard') as f:
    d = json.load(f)
items = d.get('libraryItems', [])
files = d.get('files', {})
assert len(items) == 6, f'expected 6 items, got {len(items)}'
assert len(files) == 6, f'expected 6 files, got {len(files)}'
for it in items:
    assert it['status'] == 'published'
    assert len(it['elements']) == 1
    el = it['elements'][0]
    assert el['type'] == 'image'
    assert el['fileId'] in files
    assert files[el['fileId']]['dataURL'].startswith('data:')
    print(f'  OK: {it[\"name\"]}')
print('whiteboard OK')
"
```

Expected:
```
  OK: Kore Logo Mark
  OK: Portrait Platzhalter
  OK: K8s Wheel
  OK: Topology 3-Node
  OK: Topology 12-Node
  OK: Portrait Foto
whiteboard OK
```

- [ ] **Step 4: Commit**

```bash
git add website/public/systembrett/systembrett.whiteboard scripts/add-whiteboard-library.py
git commit -m "feat(whiteboard): embed kore-assets as Excalidraw library items"
```

---

## Self-Review

**Spec coverage check:**
- ✅ 6 SVG figurines (person, kind, gruppe, tier, system, objekt) — Task 1
- ✅ manifest.json with correct structure — Task 2
- ✅ Dynamic toolbar replacing 4 hard-coded buttons — Task 3
- ✅ Legacy types (pawn/triangle/square/diamond) kept in `buildFigure()`, not in toolbar — no change needed (existing code untouched)
- ✅ 6 whiteboard library items — Task 4
- ✅ 6 files entries in whiteboard — Task 4

**Placeholder scan:** No TBDs. All code steps are complete.

**Type consistency:** `btn.dataset.type` → `addFigure(btn.dataset.type, ...)` → `buildFigure(type, ...)` — `type` flows through consistently. `a.files.figurine` matches manifest schema `"files": { "figurine": "..." }`.

**No Kustomize/CI changes needed** — `express.static('public')` already serves the `art-library/` subdirectory. The whiteboard file is static content, no rebuild required.
