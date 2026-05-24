---
title: Brett — AI Character Skins (Mayhem Mode) Implementation Plan
ticket_id: null
domains: []
status: active
pr_number: null
---

# Brett — AI Character Skins (Mayhem Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload Mixamo-rigged GLB character skins to Brett's Mayhem mode and let players pick a skin from the loadout modal. Selection persists in `localStorage`; the procedural mannequin remains the default fallback.

**Architecture:** A new client class `SkinController` loads a GLB via `THREE.GLTFLoader` (vendored r128 UMD), resolves Mixamo bones into Brett's 14-bone naming, and runs a `THREE.AnimationMixer` for `idle`/`walk`/`run`/`death` clips. `PlayerAvatar` adopts the skin at five integration points but keeps the procedural mannequin alive (hidden) so capsule/wrist/collision logic works unchanged. The Brett spring system continues to drive ragdoll/flail by writing to skin bones via `getBone()`. Server-side, three new Express routes (`GET /api/skins`, `POST /api/skins/upload`, `DELETE /api/skins/:id`) read/write `brett/public/assets/skins/<id>/` and are gated by the existing Keycloak admin session.

**Tech Stack:** Three.js r128 (vendored UMD) + GLTFLoader r128 (new vendor), Express 5 + Multer (new dep), Node `:test` for server/helper unit tests, vanilla JS for client UI.

**Spec:** `docs/superpowers/specs/2026-05-25-brett-ai-character-skins-design.md`

---

## File Structure

| Path | Purpose | Type |
|---|---|---|
| `brett/public/lib/GLTFLoader.js` | Vendored UMD GLTFLoader r128 (exposes `THREE.GLTFLoader`) | **New** |
| `brett/public/index.html` | Add `<script>` tag for GLTFLoader after `three.min.js` | Modify |
| `brett/public/assets/skins/.gitkeep` | Keep empty skin root in git | **New** |
| `brett/public/assets/skins/default/.gitkeep` | Sentinel — no GLB; presence triggers procedural mannequin | **New** |
| `brett/public/assets/mayhem/skin-controller.js` | New `SkinController` class (~180 lines) | **New** |
| `brett/public/assets/mayhem/player-avatar.js` | 5 integration points (constructor, update, _applyBoneRotation, setWeapon, remove) | Modify |
| `brett/public/assets/mayhem/mayhem.js` | Read `localStorage('brett.skinId')`, pass `skinId` into `PlayerAvatar` constructor for local player only | Modify |
| `brett/public/assets/loadout-modal.mjs` | Add "Character Skin" row + grid-overlay picker | Modify |
| `brett/public/assets/admin-panel.js` | Add "Character Skins" management section (list + upload + delete) | Modify |
| `brett/server.js` | `validateGlb()` helper + `listSkins()` helper + 3 routes + Multer setup + export new helpers | Modify |
| `brett/package.json` | Add `multer` dependency | Modify |
| `brett/test/skin-validator.test.js` | TDD tests for `validateGlb()` | **New** |
| `brett/test/skin-catalog.test.js` | TDD tests for `listSkins()` + slug helper | **New** |
| `brett/public/index.html` | (already listed above) Script tag addition | Modify |

---

## Bone Mapping (single source of truth, used by SkinController + tests)

```js
const SKIN_BONE_MAP = Object.freeze({
  hips:      'mixamorigHips',
  head:      'mixamorigHead',
  lShoulder: 'mixamorigLeftArm',
  rShoulder: 'mixamorigRightArm',
  lElbow:    'mixamorigLeftForeArm',
  rElbow:    'mixamorigRightForeArm',
  lWrist:    'mixamorigLeftHand',
  rWrist:    'mixamorigRightHand',
  lHip:      'mixamorigLeftUpLeg',
  rHip:      'mixamorigRightUpLeg',
  lKnee:     'mixamorigLeftLeg',
  rKnee:     'mixamorigRightLeg',
  lAnkle:    'mixamorigLeftFoot',
  rAnkle:    'mixamorigRightFoot',
});
```

---

## Task 1: Vendor GLTFLoader r128 and wire into index.html

**Files:**
- Create: `brett/public/lib/GLTFLoader.js`
- Modify: `brett/public/index.html` (one new `<script>` tag after `three.min.js`)

- [ ] **Step 1: Download the matching GLTFLoader r128 UMD build**

Run from repo root:
```bash
mkdir -p brett/public/lib
curl -fsSL https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js \
  -o brett/public/lib/GLTFLoader.js
```

Expected: file exists, size between 60 KB and 200 KB.

- [ ] **Step 2: Verify the file exposes `THREE.GLTFLoader`**

```bash
grep -c "THREE.GLTFLoader = " brett/public/lib/GLTFLoader.js
```

Expected: prints `1` (or higher). If `0`, the wrong file was downloaded — re-run Step 1 and confirm the path is `examples/js/loaders` not `examples/jsm/loaders`.

- [ ] **Step 3: Add the script tag to `brett/public/index.html`**

Find this line (around line 306):
```html
  <script src="three.min.js"></script>
```

Replace with:
```html
  <script src="three.min.js"></script>
  <script src="lib/GLTFLoader.js"></script>
```

- [ ] **Step 4: Smoke-check the file is served**

Start the server in a separate shell:
```bash
cd brett && MOCK_DB=true node server.js &
```

Then:
```bash
curl -sI http://localhost:3000/lib/GLTFLoader.js | head -1
```

Expected: `HTTP/1.1 200 OK`. Kill the server: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add brett/public/lib/GLTFLoader.js brett/public/index.html
git commit -m "feat(brett): vendor GLTFLoader r128 for Mayhem character skins"
```

---

## Task 2: Install Multer and scaffold the skins directory

**Files:**
- Modify: `brett/package.json`, `brett/package-lock.json` (auto)
- Create: `brett/public/assets/skins/.gitkeep`
- Create: `brett/public/assets/skins/default/.gitkeep`

- [ ] **Step 1: Install multer**

```bash
cd brett && npm install multer@1.4.5-lts.1
```

Expected: `package.json` now lists `"multer": "^1.4.5-lts.1"` in `dependencies`. Lockfile updated.

- [ ] **Step 2: Scaffold the skins directory with the `default` sentinel**

```bash
mkdir -p brett/public/assets/skins/default
touch brett/public/assets/skins/.gitkeep
touch brett/public/assets/skins/default/.gitkeep
```

The `default/` directory intentionally has no `meta.json` and no `skin.glb` — its presence is just a sentinel so the catalog listing can confirm the directory tree exists. The procedural mannequin is built in code, not loaded from disk.

- [ ] **Step 3: Verify the directory layout**

```bash
ls -la brett/public/assets/skins/
ls -la brett/public/assets/skins/default/
```

Expected: both directories exist; each contains a `.gitkeep`.

- [ ] **Step 4: Commit**

```bash
git add brett/package.json brett/package-lock.json brett/public/assets/skins/.gitkeep brett/public/assets/skins/default/.gitkeep
git commit -m "feat(brett): add multer dep and scaffold public/assets/skins/"
```

---

## Task 3: GLB validator helper (TDD)

**Files:**
- Create: `brett/test/skin-validator.test.js`
- Modify: `brett/server.js` (add `validateGlb` near the top, export it)

GLB format (we only care about the JSON chunk):
- bytes 0–3:  magic `glTF` = `0x46546C67` LE
- bytes 4–7:  version (uint32 LE), must be `2`
- bytes 8–11: total file length (uint32 LE)
- bytes 12–15: JSON chunk length (uint32 LE)
- bytes 16–19: JSON chunk type = `0x4E4F534A` ("JSON") LE
- bytes 20…:  JSON UTF-8

We accept the GLB if `nodes[].name` contains `"mixamorigHips"`. We also extract `animations[].name` for the response payload.

- [ ] **Step 1: Write the failing tests**

Create `brett/test/skin-validator.test.js`:

```js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');

// Build a synthetic GLB buffer with a given JSON payload.
function makeGlb(jsonObj) {
  const json = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  // Pad JSON to 4-byte alignment with spaces (GLB spec requirement).
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonChunk.length;
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546C67, 0);  // 'glTF'
  buf.writeUInt32LE(2, 4);           // version
  buf.writeUInt32LE(totalLen, 8);
  buf.writeUInt32LE(jsonChunk.length, 12);
  buf.writeUInt32LE(0x4E4F534A, 16); // 'JSON'
  jsonChunk.copy(buf, 20);
  return buf;
}

const { validateGlb } = require('../server.js');

test('validateGlb: accepts a Mixamo-rigged GLB and extracts animation names', () => {
  const buf = makeGlb({
    nodes: [{ name: 'mixamorigHips' }, { name: 'mixamorigHead' }],
    animations: [{ name: 'idle' }, { name: 'walk' }, { name: 'run' }],
  });
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.animations.sort(), ['idle', 'run', 'walk']);
});

test('validateGlb: rejects buffer too small to be a GLB', () => {
  const r = validateGlb(Buffer.alloc(10));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /too small/i);
});

test('validateGlb: rejects bad magic bytes', () => {
  const buf = Buffer.alloc(40);
  buf.writeUInt32LE(0xDEADBEEF, 0);
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /magic|not.*glb/i);
});

test('validateGlb: rejects unsupported GLB version', () => {
  const buf = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  buf.writeUInt32LE(1, 4); // force version 1
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /version/i);
});

test('validateGlb: rejects when mixamorigHips bone is missing', () => {
  const buf = makeGlb({
    nodes: [{ name: 'Hips' }, { name: 'Head' }],
    animations: [],
  });
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /mixamorigHips/);
});

test('validateGlb: rejects when JSON chunk has invalid JSON', () => {
  const json = Buffer.from('{not valid json', 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonChunk.length;
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546C67, 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(totalLen, 8);
  buf.writeUInt32LE(jsonChunk.length, 12);
  buf.writeUInt32LE(0x4E4F534A, 16);
  jsonChunk.copy(buf, 20);
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /json/i);
});

test('validateGlb: animations field defaults to [] when GLB has none', () => {
  const buf = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.animations, []);
});
```

- [ ] **Step 2: Run the failing tests**

```bash
cd brett && npm test -- --test-name-pattern=validateGlb
```

Expected: all 7 tests FAIL with `validateGlb is not a function` or similar.

- [ ] **Step 3: Implement `validateGlb` and export it**

Open `brett/server.js`. After the `const { randomUUID } = require('crypto');` line (around line 7), add:

```js
// GLB validator — checks magic/version, parses JSON chunk, requires mixamorigHips.
// Returns { ok: true, animations: string[] } | { ok: false, error: string }.
function validateGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    return { ok: false, error: 'buffer too small to be a GLB' };
  }
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    return { ok: false, error: 'bad magic — not a GLB file' };
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    return { ok: false, error: `unsupported GLB version ${version} (need 2)` };
  }
  const jsonLen  = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4E4F534A) {
    return { ok: false, error: 'first chunk is not JSON' };
  }
  if (20 + jsonLen > buffer.length) {
    return { ok: false, error: 'JSON chunk overflows file' };
  }
  let gltf;
  try {
    gltf = JSON.parse(buffer.slice(20, 20 + jsonLen).toString('utf8'));
  } catch (err) {
    return { ok: false, error: 'invalid JSON in GLB: ' + err.message };
  }
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  if (!nodes.some(n => n && n.name === 'mixamorigHips')) {
    return { ok: false, error: 'mixamorigHips bone not found — GLB must be Mixamo-rigged' };
  }
  const animations = (Array.isArray(gltf.animations) ? gltf.animations : [])
    .map(a => (a && typeof a.name === 'string') ? a.name : null)
    .filter(Boolean);
  return { ok: true, animations };
}
```

Then in the `module.exports = { ... }` block near the bottom of `server.js` (around line 867), add `validateGlb`:

```js
module.exports = {
  app, server, pool, wss,
  applyMutation, buildStateFromMutations, figureMaps,
  handleDisconnect,
  RELAY_TYPES, TRANSIENT_TYPES, lmsAlive, handleLmsDeath,
  duelRooms, handleDuelDeath,
  pickupState, ensurePickups, spawnPickup,
  isAdminFromClaims,
  validateAppearance,
  validateGlb,
  buildConfig,
  // ... (preserve any trailing entries)
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd brett && npm test -- --test-name-pattern=validateGlb
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/skin-validator.test.js
git commit -m "feat(brett): validateGlb() helper rejects non-Mixamo GLBs"
```

---

## Task 4: listSkins + slugify helpers (TDD)

**Files:**
- Create: `brett/test/skin-catalog.test.js`
- Modify: `brett/server.js` (add `listSkins` + `slugifyForSkin`, export both)

`listSkins(skinsDir)` reads each subdirectory's `meta.json` and returns an array prepended with the `default` mannequin entry. Missing/invalid `meta.json` entries are skipped silently.

`slugifyForSkin(name)` produces a filesystem-safe id from a display name: lowercase, ASCII alphanumerics + `-`, max 32 chars, falls back to `'skin-' + 6 random hex chars` if the input collapses to empty.

- [ ] **Step 1: Write the failing tests**

Create `brett/test/skin-catalog.test.js`:

```js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const { listSkins, slugifyForSkin } = require('../server.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brett-skins-'));
}

test('listSkins: empty dir returns just the default entry', () => {
  const dir = mkTmp();
  const out = listSkins(dir);
  assert.deepStrictEqual(out, [{ id: 'default', name: 'Mannequin', thumb: null, animations: [] }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: includes valid meta.json entries with thumb path', () => {
  const dir = mkTmp();
  const skinDir = path.join(dir, 'patrick-001');
  fs.mkdirSync(skinDir);
  fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify({
    id: 'patrick-001', name: 'Patrick', author: 'pk', animations: ['idle', 'walk', 'run'],
  }));
  fs.writeFileSync(path.join(skinDir, 'thumb.png'), '');
  const out = listSkins(dir);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0].id, 'default');
  assert.deepStrictEqual(out[1], {
    id: 'patrick-001',
    name: 'Patrick',
    thumb: '/assets/skins/patrick-001/thumb.png',
    animations: ['idle', 'walk', 'run'],
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: skin without thumb has thumb=null', () => {
  const dir = mkTmp();
  const skinDir = path.join(dir, 'no-thumb');
  fs.mkdirSync(skinDir);
  fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify({
    id: 'no-thumb', name: 'No Thumb', animations: [],
  }));
  const out = listSkins(dir);
  const found = out.find(s => s.id === 'no-thumb');
  assert.ok(found);
  assert.strictEqual(found.thumb, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: silently skips subdirs with broken meta.json', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, 'broken'));
  fs.writeFileSync(path.join(dir, 'broken', 'meta.json'), '{ this is not json');
  fs.mkdirSync(path.join(dir, 'no-meta')); // missing meta.json entirely
  const out = listSkins(dir);
  assert.deepStrictEqual(out.map(s => s.id), ['default']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: ignores the "default" subdir to avoid double-listing', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, 'default'));
  const out = listSkins(dir);
  assert.deepStrictEqual(out.map(s => s.id), ['default']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('slugifyForSkin: ascii name → kebab-case', () => {
  assert.strictEqual(slugifyForSkin('Patrick Korczewski'), 'patrick-korczewski');
});

test('slugifyForSkin: strips diacritics and punctuation', () => {
  assert.strictEqual(slugifyForSkin('Über-Möbel!!'), 'ber-mbel');
});

test('slugifyForSkin: caps length at 32 chars', () => {
  const long = 'a'.repeat(100);
  assert.ok(slugifyForSkin(long).length <= 32);
});

test('slugifyForSkin: empty / pure-symbol input gets a random fallback id', () => {
  const out = slugifyForSkin('!!!');
  assert.match(out, /^skin-[0-9a-f]{6}$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd brett && npm test -- --test-name-pattern="listSkins|slugifyForSkin"
```

Expected: all tests FAIL with `listSkins is not a function`.

- [ ] **Step 3: Implement helpers and export them**

In `brett/server.js`, immediately after the `validateGlb` block from Task 3, add:

```js
const SKINS_DIR_NAME = 'skins';
const SKINS_DIR = path.join(__dirname, 'public', 'assets', SKINS_DIR_NAME);

function listSkins(dir = SKINS_DIR) {
  const out = [{ id: 'default', name: 'Mannequin', thumb: null, animations: [] }];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'default') continue;
    const skinDir = path.join(dir, ent.name);
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(skinDir, 'meta.json'), 'utf8'));
    } catch { continue; }
    if (!meta || typeof meta.id !== 'string' || typeof meta.name !== 'string') continue;
    const hasThumb = fs.existsSync(path.join(skinDir, 'thumb.png'));
    out.push({
      id: meta.id,
      name: meta.name,
      thumb: hasThumb ? `/assets/${SKINS_DIR_NAME}/${ent.name}/thumb.png` : null,
      animations: Array.isArray(meta.animations) ? meta.animations : [],
    });
  }
  return out;
}

function slugifyForSkin(name) {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (cleaned) return cleaned;
  return 'skin-' + randomUUID().replace(/-/g, '').slice(0, 6);
}
```

Then add `SKINS_DIR`, `listSkins`, and `slugifyForSkin` to the `module.exports` block (alongside `validateGlb`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd brett && npm test -- --test-name-pattern="listSkins|slugifyForSkin"
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/skin-catalog.test.js
git commit -m "feat(brett): listSkins() + slugifyForSkin() helpers"
```

---

## Task 5: `GET /api/skins` route (public catalog)

**Files:**
- Modify: `brett/server.js` (one new route)
- Modify: `brett/test/skin-catalog.test.js` (add a route-level test using `app`)

- [ ] **Step 1: Write the failing route test**

Append to `brett/test/skin-catalog.test.js`:

```js
const { app } = require('../server.js');

// Minimal in-process HTTP request helper — avoids pulling in supertest.
function getJson(routePath) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const http = require('http');
      http.get({ host: '127.0.0.1', port, path: routePath }, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch (err) { reject(err); }
        });
      }).on('error', err => { server.close(); reject(err); });
    });
  });
}

test('GET /api/skins: returns at least the default entry', async () => {
  const r = await getJson('/api/skins');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(r.body.some(s => s.id === 'default'));
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd brett && npm test -- --test-name-pattern="GET /api/skins"
```

Expected: FAIL with 404 or `Cannot GET /api/skins`.

- [ ] **Step 3: Add the route**

In `brett/server.js`, immediately after the `app.get('/api/admin/rooms', ...)` block (around line 273), insert:

```js
// ─── Skins catalog (Mayhem character skins) ──────────────────────────────────
app.get('/api/skins', (_req, res) => {
  res.json(listSkins());
});
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd brett && npm test -- --test-name-pattern="GET /api/skins"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/skin-catalog.test.js
git commit -m "feat(brett): GET /api/skins returns skin catalog"
```

---

## Task 6: `POST /api/skins/upload` route (admin GLB upload)

**Files:**
- Modify: `brett/server.js` (Multer setup + route)
- Create: `brett/test/skin-upload.test.js`

The route lives behind `requireAdmin` (existing session-based middleware). Multer writes the GLB to a temp file, the handler reads it back, calls `validateGlb`, moves to its final destination on success, and replies with the new catalog entry. We reject if the GLB is over 20 MB *or* if the thumb is over 512 KB *or* if `mixamorigHips` is missing.

- [ ] **Step 1: Write the failing tests**

Create `brett/test/skin-upload.test.js`:

```js
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const http   = require('http');
const { app, validateGlb } = require('../server.js');

// Reuse the synthetic GLB helper from skin-validator.test.js (inlined here).
function makeGlb(jsonObj) {
  const json = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonChunk.length;
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546C67, 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(totalLen, 8);
  buf.writeUInt32LE(jsonChunk.length, 12);
  buf.writeUInt32LE(0x4E4F534A, 16);
  jsonChunk.copy(buf, 20);
  return buf;
}

// Build a multipart/form-data POST body. Returns { body: Buffer, boundary }.
function buildMultipart(fields) {
  const boundary = '----brett-test-' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (Buffer.isBuffer(value.data)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${value.filename}"\r\n` +
        `Content-Type: ${value.contentType}\r\n\r\n`
      ));
      parts.push(value.data);
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      ));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

function postMultipart(routePath, fields, { admin } = {}) {
  const { body, boundary } = buildMultipart(fields);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request({
        host: '127.0.0.1', port, path: routePath, method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': body.length,
          ...(admin ? { 'x-test-admin': '1' } : {}),
        },
      }, res => {
        let out = '';
        res.on('data', c => { out += c; });
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }); }
          catch { resolve({ status: res.statusCode, body: out }); }
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      req.write(body);
      req.end();
    });
  });
}

test('POST /api/skins/upload: rejects without admin session', async () => {
  const glb = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  const r = await postMultipart('/api/skins/upload', {
    name: 'Test',
    glb: { data: glb, filename: 'test.glb', contentType: 'model/gltf-binary' },
  });
  assert.strictEqual(r.status, 403);
});

test('POST /api/skins/upload: accepts a valid Mixamo GLB from admin', async () => {
  // We use the test-mode admin shortcut (added in Step 3 below).
  const glb = makeGlb({
    nodes: [{ name: 'mixamorigHips' }],
    animations: [{ name: 'idle' }],
  });
  const r = await postMultipart('/api/skins/upload', {
    name: 'Test Skin',
    glb: { data: glb, filename: 'test.glb', contentType: 'model/gltf-binary' },
  }, { admin: true });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.id, 'test-skin');
  assert.deepStrictEqual(r.body.animations, ['idle']);

  // Cleanup so the test is repeatable.
  const created = path.join(__dirname, '..', 'public', 'assets', 'skins', 'test-skin');
  fs.rmSync(created, { recursive: true, force: true });
});

test('POST /api/skins/upload: rejects non-Mixamo GLB with 400', async () => {
  const glb = makeGlb({ nodes: [{ name: 'Hips' }] });
  const r = await postMultipart('/api/skins/upload', {
    name: 'Bad Rig',
    glb: { data: glb, filename: 'bad.glb', contentType: 'model/gltf-binary' },
  }, { admin: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /mixamorigHips/);
});

test('POST /api/skins/upload: rejects missing name field', async () => {
  const glb = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  const r = await postMultipart('/api/skins/upload', {
    glb: { data: glb, filename: 'x.glb', contentType: 'model/gltf-binary' },
  }, { admin: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /name/);
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
cd brett && npm test -- --test-name-pattern="POST /api/skins/upload"
```

Expected: tests FAIL because the route doesn't exist yet.

- [ ] **Step 3: Add Multer + route + test-admin shortcut**

In `brett/server.js`, near the top (after the existing `require` block), add:

```js
const multer = require('multer');
const skinUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
}).fields([
  { name: 'glb',   maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);
```

Modify the `requireAdmin` middleware (around line 188) to honor a test shortcut so the upload tests don't need a full Keycloak round-trip:

```js
function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  if (process.env.MOCK_DB === 'true' && req.header('x-test-admin') === '1') return next();
  return res.status(403).json({ error: 'forbidden' });
}
```

Add the upload route, right after the `GET /api/skins` route from Task 5:

```js
app.post('/api/skins/upload', requireAdmin, (req, res) => {
  skinUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file too large (max 20 MB)' });
      return res.status(400).json({ error: 'upload error: ' + err.message });
    }
    const name = String((req.body && req.body.name) || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ error: 'name required (≤100 chars)' });
    const glbFile = req.files?.glb?.[0];
    if (!glbFile) return res.status(400).json({ error: 'glb file required' });
    const thumbFile = req.files?.thumb?.[0] || null;
    if (thumbFile && thumbFile.size > 512 * 1024) {
      return res.status(413).json({ error: 'thumb too large (max 512 KB)' });
    }
    const val = validateGlb(glbFile.buffer);
    if (!val.ok) return res.status(400).json({ error: val.error });

    // Generate a unique id (re-roll if it collides with an existing skin or 'default').
    let id = slugifyForSkin(name);
    let attempt = 0;
    while (id === 'default' || fs.existsSync(path.join(SKINS_DIR, id))) {
      attempt++;
      if (attempt > 16) return res.status(500).json({ error: 'could not allocate skin id' });
      id = slugifyForSkin(name + '-' + attempt);
    }
    const skinDir = path.join(SKINS_DIR, id);
    fs.mkdirSync(skinDir, { recursive: true });
    fs.writeFileSync(path.join(skinDir, 'skin.glb'), glbFile.buffer);
    if (thumbFile) fs.writeFileSync(path.join(skinDir, 'thumb.png'), thumbFile.buffer);
    const meta = { id, name, animations: val.animations, uploadedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify(meta, null, 2));

    res.status(201).json({
      id,
      name,
      thumb: thumbFile ? `/assets/skins/${id}/thumb.png` : null,
      animations: val.animations,
    });
  });
});
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
cd brett && npm test -- --test-name-pattern="POST /api/skins/upload"
```

Expected: all 4 upload tests PASS.

- [ ] **Step 5: Run the full test suite to check nothing else broke**

```bash
cd brett && npm test
```

Expected: every test passes (existing tests must not have regressed because of the `requireAdmin` change).

- [ ] **Step 6: Commit**

```bash
git add brett/server.js brett/test/skin-upload.test.js
git commit -m "feat(brett): POST /api/skins/upload validates GLB and stores skin"
```

---

## Task 7: `DELETE /api/skins/:id` route

**Files:**
- Modify: `brett/server.js`
- Modify: `brett/test/skin-upload.test.js` (append delete tests)

- [ ] **Step 1: Write the failing tests**

Append to `brett/test/skin-upload.test.js`:

```js
function del(routePath, { admin } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request({
        host: '127.0.0.1', port, path: routePath, method: 'DELETE',
        headers: admin ? { 'x-test-admin': '1' } : {},
      }, res => {
        let out = '';
        res.on('data', c => { out += c; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      req.end();
    });
  });
}

test('DELETE /api/skins/:id: rejects without admin', async () => {
  const r = await del('/api/skins/anything');
  assert.strictEqual(r.status, 403);
});

test('DELETE /api/skins/default: returns 400', async () => {
  const r = await del('/api/skins/default', { admin: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /default/);
});

test('DELETE /api/skins/:id: removes existing skin directory', async () => {
  const skinDir = path.join(__dirname, '..', 'public', 'assets', 'skins', 'to-delete');
  fs.mkdirSync(skinDir, { recursive: true });
  fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify({ id: 'to-delete', name: 'X' }));
  const r = await del('/api/skins/to-delete', { admin: true });
  assert.strictEqual(r.status, 204);
  assert.strictEqual(fs.existsSync(skinDir), false);
});

test('DELETE /api/skins/:id: returns 404 if skin does not exist', async () => {
  const r = await del('/api/skins/does-not-exist', { admin: true });
  assert.strictEqual(r.status, 404);
});

test('DELETE /api/skins/:id: rejects path-traversal id', async () => {
  const r = await del('/api/skins/..%2F..%2Fetc', { admin: true });
  assert.ok(r.status === 400 || r.status === 404);
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
cd brett && npm test -- --test-name-pattern="DELETE /api/skins"
```

Expected: tests FAIL because the route does not exist.

- [ ] **Step 3: Add the route**

In `brett/server.js`, immediately after the `POST /api/skins/upload` block from Task 6, insert:

```js
app.delete('/api/skins/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) return res.status(400).json({ error: 'invalid id' });
  if (id === 'default') return res.status(400).json({ error: 'cannot delete default skin' });
  const skinDir = path.join(SKINS_DIR, id);
  if (!fs.existsSync(skinDir)) return res.status(404).json({ error: 'skin not found' });
  fs.rmSync(skinDir, { recursive: true, force: true });
  res.status(204).end();
});
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
cd brett && npm test -- --test-name-pattern="DELETE /api/skins"
```

Expected: all 5 delete tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd brett && npm test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add brett/server.js brett/test/skin-upload.test.js
git commit -m "feat(brett): DELETE /api/skins/:id with default-protect"
```

---

## Task 8: `SkinController` client class

**Files:**
- Create: `brett/public/assets/mayhem/skin-controller.js`

The class is browser-only (depends on `window.THREE` and `THREE.GLTFLoader`). We don't add unit tests here — coverage comes from the manual smoke test in Task 12.

- [ ] **Step 1: Create the file with the full class body**

```js
// brett/public/assets/mayhem/skin-controller.js
(function () {
'use strict';

const SKIN_BONE_MAP = Object.freeze({
  hips:      'mixamorigHips',
  head:      'mixamorigHead',
  lShoulder: 'mixamorigLeftArm',
  rShoulder: 'mixamorigRightArm',
  lElbow:    'mixamorigLeftForeArm',
  rElbow:    'mixamorigRightForeArm',
  lWrist:    'mixamorigLeftHand',
  rWrist:    'mixamorigRightHand',
  lHip:      'mixamorigLeftUpLeg',
  rHip:      'mixamorigRightUpLeg',
  lKnee:     'mixamorigLeftLeg',
  rKnee:     'mixamorigRightLeg',
  lAnkle:    'mixamorigLeftFoot',
  rAnkle:    'mixamorigRightFoot',
});

const CROSSFADE_IDLE_RUN_S  = 0.2;
const CROSSFADE_RECOVER_S   = 0.4;

class SkinController {
  constructor(skinId, gltfRoot, animations, mannequin) {
    this.skinId = skinId;
    this.mesh = gltfRoot;                       // THREE.Group — added to mannequin.root by caller
    this.mannequin = mannequin;
    this.ready = true;
    this._boneNodes = {};
    this._currentAction = null;
    this._currentClipName = null;
    this._disposed = false;

    const THREE = window.THREE;
    this.mixer = new THREE.AnimationMixer(gltfRoot);

    // Index named clips for state-machine lookup; missing clips are fine, we fall back.
    this._clips = {};
    for (const clip of (animations || [])) {
      if (clip && typeof clip.name === 'string') this._clips[clip.name] = clip;
    }

    // Resolve Mixamo bone nodes against Brett's 14-bone naming.
    gltfRoot.traverse(node => {
      if (!node || !node.isBone) return;
      for (const [brettName, mixamoName] of Object.entries(SKIN_BONE_MAP)) {
        if (node.name === mixamoName) this._boneNodes[brettName] = node;
      }
    });

    // Snap to idle on creation if available.
    this._play('idle', 0);
  }

  // Static factory — async load of <skinId>/skin.glb.
  static load(skinId, mannequin) {
    return new Promise((resolve, reject) => {
      const THREE = window.THREE;
      if (!THREE || !THREE.GLTFLoader) {
        return reject(new Error('THREE.GLTFLoader not loaded'));
      }
      const url = `/assets/skins/${encodeURIComponent(skinId)}/skin.glb`;
      const loader = new THREE.GLTFLoader();
      loader.load(
        url,
        gltf => {
          try {
            const ctrl = new SkinController(skinId, gltf.scene, gltf.animations, mannequin);
            resolve(ctrl);
          } catch (err) { reject(err); }
        },
        undefined,
        err => reject(err),
      );
    });
  }

  getBone(brettName) {
    return this._boneNodes[brettName] || null;
  }

  setVisible(v) { if (this.mesh) this.mesh.visible = !!v; }

  // Per-frame tick. avatarState may be a plain string or { state, sprint }.
  update(dt, avatarState) {
    if (this._disposed || !this.ready) return;
    this.mixer.update(dt);
    const state  = (typeof avatarState === 'string') ? avatarState : (avatarState && avatarState.state);
    const sprint = !!(avatarState && avatarState.sprint);

    // RAGDOLL / FLAILING → hand off to Brett spring system; freeze the mixer-driven clip.
    if (state === 'ragdoll' || state === 'flailing') {
      if (this._currentAction) {
        this._currentAction.fadeOut(0);
        this._currentAction = null;
        this._currentClipName = null;
      }
      return;
    }
    if (state === 'dead') { this._play('death', 0, false); return; }
    if (state === 'running') {
      const target = sprint && this._clips.run ? 'run' : (this._clips.walk ? 'walk' : 'idle');
      this._play(target, CROSSFADE_IDLE_RUN_S);
      return;
    }
    if (state === 'recovering') {
      this._play('idle', CROSSFADE_RECOVER_S);
      return;
    }
    // default — idle
    this._play('idle', CROSSFADE_IDLE_RUN_S);
  }

  _play(clipName, fadeSeconds, loop = true) {
    const THREE = window.THREE;
    if (this._currentClipName === clipName) return;
    let clip = this._clips[clipName];
    if (!clip && clipName === 'walk') clip = this._clips.idle;
    if (!clip) return; // missing death → freeze; missing idle → no-op
    const nextAction = this.mixer.clipAction(clip);
    nextAction.reset();
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    if (this._currentAction) {
      nextAction.crossFadeFrom(this._currentAction, fadeSeconds, false);
    }
    nextAction.play();
    this._currentAction   = nextAction;
    this._currentClipName = clipName;
  }

  dispose(scene) {
    if (this._disposed) return;
    this._disposed = true;
    if (this.mixer) this.mixer.stopAllAction();
    if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (this.mesh) {
      this.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
        if (obj.skeleton && obj.skeleton.dispose) obj.skeleton.dispose();
      });
    }
    this.mesh = null;
    this._boneNodes = {};
    this._clips = {};
    void scene; // unused — included for API symmetry with PlayerAvatar.remove(scene)
  }
}

SkinController.BONE_MAP = SKIN_BONE_MAP;
if (typeof window !== 'undefined') window.MayhemSkinController = SkinController;
})();
```

- [ ] **Step 2: Add `<script>` tag to index.html**

In `brett/public/index.html`, find the existing block that loads the mayhem scripts (search for `player-avatar.js`). Add the skin-controller script *before* `player-avatar.js`. If there isn't yet a script tag for the mayhem assets, add it after `lib/GLTFLoader.js`:

```html
  <script src="assets/mayhem/skin-controller.js"></script>
```

Verify load order by running:
```bash
grep -nE "skin-controller|player-avatar|GLTFLoader" brett/public/index.html
```

Expected: line numbers ordered `GLTFLoader` → `skin-controller` → `player-avatar`. If `player-avatar.js` isn't loaded via index.html (it might be lazy-imported by `mayhem.js`), just make sure `skin-controller.js` appears after `lib/GLTFLoader.js`.

- [ ] **Step 3: Quick syntax sanity check**

```bash
node --check brett/public/assets/mayhem/skin-controller.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/mayhem/skin-controller.js brett/public/index.html
git commit -m "feat(brett): SkinController class for Mixamo GLB skins"
```

---

## Task 9: `PlayerAvatar` integration (5 hook points)

**Files:**
- Modify: `brett/public/assets/mayhem/player-avatar.js`

- [ ] **Step 1: Extend the constructor to accept `skinId` and kick off async load**

In `brett/public/assets/mayhem/player-avatar.js`, replace the constructor body (lines 17–40) with:

```js
  constructor({ id, mannequin, local, color, skinId }) {
    this.id = id;
    this.mannequin = mannequin;
    this.local = !!local;
    this.color = color;
    this.skinId = skinId || 'default';
    this.skin = null;            // set when SkinController.load() resolves
    this._pendingWeaponDef = null; // re-applied once skin loads
    this.state = STATE.IDLE;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facingY = 0;
    this.flailing = false;
    this.ragdollUntil = 0;
    this.recoverUntil = 0;
    this.lastHits = new Map();
    this.netTarget = null;
    this._t = 0;
    this.hp = 100;
    this.burnInterval = null;
    this._weaponMesh = null;
    this.heroId          = null;
    this.heroColor       = null;
    this.speedMultiplier = 1.0;
    this.shielded        = false;
    this._slowTimer      = null;
    this._applyColor();

    if (this.skinId !== 'default' && window.MayhemSkinController) {
      window.MayhemSkinController.load(this.skinId, mannequin)
        .then(ctrl => this._adoptSkin(ctrl))
        .catch(err => {
          console.warn(`[brett] skin "${this.skinId}" failed to load, falling back to mannequin:`, err.message);
          this.skinId = 'default';
        });
    }
  }
```

- [ ] **Step 2: Add `_adoptSkin` method**

Add this method right after the constructor (before `_applyColor`):

```js
  _adoptSkin(ctrl) {
    if (!ctrl) return;
    this.skin = ctrl;
    // Hide all mannequin meshes (keep bones for capsule/wrist math).
    this.mannequin.root.traverse(obj => {
      if (obj.isMesh) obj.visible = false;
    });
    // Attach skin mesh under mannequin.root so it inherits root position/rotation.
    this.mannequin.root.add(ctrl.mesh);
    // Re-attach weapon to the skin's right wrist if we had one queued.
    if (this._pendingWeaponDef) this.setWeapon(this._pendingWeaponDef);
  }
```

- [ ] **Step 3: Pipe skin updates through `update(dt, camYaw)`**

Find `update(dt, camYaw)` (line 148). After the body completes — i.e. immediately before the closing `}` of `update` — add:

```js
    if (this.skin) {
      this.skin.update(dt, { state: this.state, sprint: !!(this._input && this._input.sprint) });
    }
```

So the full method becomes:

```js
  update(dt, camYaw) {
    const now = performance.now();
    this._t += dt;
    if (this.state === STATE.RAGDOLL) { this._updateRagdoll(dt, now); }
    else if (this.state === STATE.RECOVERING) { this._updateRecover(dt, now); }
    else {
      if (this.local) this._updateLocal(dt, camYaw, now);
      else this._updateRemote(dt);
      this._animate(dt);
    }
    if (this.skin) {
      this.skin.update(dt, { state: this.state, sprint: !!(this._input && this._input.sprint) });
    }
  }
```

Note: the early `return` statements inside the branches in the original code prevented the post-update step from running. The rewrite turns them into if/else-if so the skin update always fires.

- [ ] **Step 4: Mirror bone writes to the skin in `_applyBoneRotation`**

Replace the `_applyBoneRotation(name)` method (lines 295–301) with:

```js
  _applyBoneRotation(name) {
    const node = this.mannequin.bones[name];
    if (!node) return;
    const r = this.mannequin.bone[name].currentRot;
    node.rotation.x = r.x;
    node.rotation.z = r.z;
    if (this.skin) {
      const skinBone = this.skin.getBone(name);
      if (skinBone) {
        skinBone.rotation.x = r.x;
        skinBone.rotation.z = r.z;
      }
    }
  }
```

- [ ] **Step 5: Attach weapons to the skin's wrist when present**

Replace `setWeapon(weaponDef)` (lines 336–343) with:

```js
  setWeapon(weaponDef) {
    this._pendingWeaponDef = weaponDef || null;
    const attach = (this.skin && this.skin.getBone('rWrist')) || this.mannequin.bones.rWrist;
    if (!attach) return;
    if (this._weaponMesh) {
      if (this._weaponMesh.parent) this._weaponMesh.parent.remove(this._weaponMesh);
      this._weaponMesh = null;
    }
    if (!weaponDef) return;
    this._weaponMesh = PlayerAvatar._mkWeaponMesh(weaponDef.key, window.THREE);
    if (this._weaponMesh) attach.add(this._weaponMesh);
  }
```

- [ ] **Step 6: Dispose the skin on `remove(scene)`**

Find `remove(scene)` (line 321). Add `this.skin?.dispose(scene); this.skin = null;` as the first lines of the method body:

```js
  remove(scene) {
    if (this.skin) { this.skin.dispose(scene); this.skin = null; }
    scene.remove(this.mannequin.root);
    if (this._vehicle) {
      if (typeof window !== 'undefined' && window.MayhemVehicle && window.MayhemVehicle.despawn) {
        window.MayhemVehicle.despawn(this._vehicle, scene);
      }
      this._vehicle = null;
    }
    if (this._remoteVehicleMesh) {
      this.mannequin.root.remove(this._remoteVehicleMesh);
      this._remoteVehicleMesh = null;
    }
    this._remoteVehicleType = null;
  }
```

- [ ] **Step 7: Syntax sanity check**

```bash
node --check brett/public/assets/mayhem/player-avatar.js
```

Expected: no output, exit code 0.

- [ ] **Step 8: Run the full test suite**

```bash
cd brett && npm test
```

Expected: every test passes. Existing `damage.test.mjs` and `appearance.test.mjs` exercise PlayerAvatar — they must still pass.

- [ ] **Step 9: Commit**

```bash
git add brett/public/assets/mayhem/player-avatar.js
git commit -m "feat(brett): PlayerAvatar adopts SkinController, mirrors bones, re-attaches weapon"
```

---

## Task 10: `mayhem.js` reads `localStorage('brett.skinId')` and passes to local PlayerAvatar

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js`

The spec says skins are local-player only. Bots and remote avatars stay on the mannequin, so we change only the local construction site.

- [ ] **Step 1: Locate the local PlayerAvatar construction**

Find the line (currently line 337):
```js
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color });
```

- [ ] **Step 2: Read the skin id from localStorage and pass it in**

Replace that single line with:

```js
    const skinId = (() => {
      try { return window.localStorage.getItem('brett.skinId') || 'default'; }
      catch { return 'default'; }
    })();
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color, skinId });
```

- [ ] **Step 3: Syntax sanity check**

```bash
node --check brett/public/assets/mayhem/mayhem.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): mayhem.js loads skinId from localStorage for local player"
```

---

## Task 11: Loadout modal — add "Character Skin" row + picker overlay

**Files:**
- Modify: `brett/public/assets/loadout-modal.mjs`
- Modify: `brett/public/assets/style.css` (a few rules for the picker grid)

- [ ] **Step 1: Replace `loadout-modal.mjs` with the skin-aware version**

```js
// brett/public/assets/loadout-modal.mjs
const MELEE = ['club', 'katana'];
const RANGED = ['handgun'];
const SKIN_STORAGE_KEY = 'brett.skinId';

function readSkinId() {
  try { return window.localStorage.getItem(SKIN_STORAGE_KEY) || 'default'; }
  catch { return 'default'; }
}
function writeSkinId(id) {
  try { window.localStorage.setItem(SKIN_STORAGE_KEY, id); }
  catch { /* private mode etc. */ }
}

async function fetchSkins() {
  try {
    const r = await fetch('/api/skins', { credentials: 'same-origin' });
    if (!r.ok) return [{ id: 'default', name: 'Mannequin', thumb: null }];
    return await r.json();
  } catch {
    return [{ id: 'default', name: 'Mannequin', thumb: null }];
  }
}

function renderSkinPicker(skins, currentId, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'mode-select-overlay skin-picker-overlay';
  overlay.innerHTML = `
    <div class="mode-select-card skin-picker-card">
      <h2>Charakter-Skin wählen</h2>
      <div class="skin-grid">
        ${skins.map(s => `
          <button class="skin-tile ${s.id === currentId ? 'active' : ''}" data-skin-id="${s.id}">
            <div class="skin-thumb">${s.thumb ? `<img src="${s.thumb}" alt="${s.name}">` : '<span>👤</span>'}</div>
            <span class="skin-name">${s.name}</span>
          </button>
        `).join('')}
      </div>
      <button class="confirm skin-cancel">Schließen</button>
    </div>
  `;
  overlay.addEventListener('click', e => {
    const tile = e.target.closest('.skin-tile');
    if (tile) {
      const id = tile.dataset.skinId;
      onPick(id, skins.find(s => s.id === id));
      overlay.remove();
      return;
    }
    if (e.target.classList.contains('skin-cancel')) overlay.remove();
  });
  document.body.appendChild(overlay);
}

export function showLoadoutModal(modeState) {
  const current = modeState.loadout();
  let currentSkinId = readSkinId();
  let currentSkinName = 'Mannequin';

  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';

    function renderSkinRow() {
      return `
        <div class="loadout-skin-row">
          <span class="loadout-skin-label">Charakter-Skin</span>
          <button class="loadout-skin-current" data-action="open-skin-picker">
            <span class="skin-thumb-small">👤</span>
            <span class="skin-name-small">${currentSkinName}</span>
            <span class="skin-change">Ändern</span>
          </button>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deine Startausrüstung</h2>
        <div class="loadout-cols">
          <div>
            <h3>Nahkampf</h3>
            ${MELEE.map(w => `<button class="weapon-pick ${current.melee===w?'active':''}" data-slot="melee" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="${w}">
              <span>${w}</span>
            </button>`).join('')}
          </div>
          <div>
            <h3>Fernkampf</h3>
            ${RANGED.map(w => `<button class="weapon-pick ${current.ranged===w?'active':''}" data-slot="ranged" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="${w}">
              <span>${w}</span>
            </button>`).join('')}
          </div>
        </div>
        ${renderSkinRow()}
        <button class="confirm">Spielen</button>
      </div>
    `;
    document.body.appendChild(el);

    // Fire the catalog fetch in the background so the row updates when it lands.
    fetchSkins().then(skins => {
      const match = skins.find(s => s.id === currentSkinId);
      currentSkinName = match ? match.name : 'Mannequin';
      const row = el.querySelector('.loadout-skin-row');
      if (row) row.outerHTML = renderSkinRow();
      // Re-bind the action delegated below.
    });

    const sel = { ...current };
    el.addEventListener('click', async e => {
      const w = e.target.closest('.weapon-pick');
      if (w) {
        sel[w.dataset.slot] = w.dataset.w;
        el.querySelectorAll(`[data-slot="${w.dataset.slot}"]`).forEach(b => b.classList.toggle('active', b === w));
        return;
      }
      const skinBtn = e.target.closest('[data-action="open-skin-picker"]');
      if (skinBtn) {
        const skins = await fetchSkins();
        renderSkinPicker(skins, currentSkinId, (id, def) => {
          currentSkinId = id;
          currentSkinName = def ? def.name : 'Mannequin';
          writeSkinId(id);
          const row = el.querySelector('.loadout-skin-row');
          if (row) row.outerHTML = renderSkinRow();
        });
        return;
      }
      if (e.target.classList.contains('confirm')) {
        modeState.setLoadout(sel);
        el.remove();
        resolve({ ...sel, skinId: currentSkinId });
      }
    });
  });
}
```

- [ ] **Step 2: Add CSS for the skin row and picker**

Append to `brett/public/assets/style.css`:

```css
.loadout-skin-row {
  display: flex; align-items: center; justify-content: space-between;
  margin: 12px 0; padding: 8px 12px;
  background: rgba(255,255,255,0.04); border-radius: 6px;
}
.loadout-skin-label { color: var(--brass); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.loadout-skin-current {
  display: flex; align-items: center; gap: 8px;
  background: transparent; color: #e5e7eb; border: 1px solid #374151; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; font-size: 12px;
}
.loadout-skin-current:hover { background: #1f2937; }
.skin-thumb-small { font-size: 16px; }
.skin-change { color: var(--brass); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }

.skin-picker-overlay .skin-picker-card { max-width: 520px; }
.skin-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0;
}
.skin-tile {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px; background: rgba(255,255,255,0.04); border: 1px solid #374151;
  border-radius: 6px; cursor: pointer; color: #e5e7eb;
}
.skin-tile:hover { background: rgba(255,255,255,0.08); }
.skin-tile.active { border-color: var(--brass); background: rgba(200,169,110,0.15); }
.skin-thumb {
  width: 96px; height: 96px; display: flex; align-items: center; justify-content: center;
  background: #0e1014; border-radius: 4px; overflow: hidden; font-size: 36px;
}
.skin-thumb img { width: 100%; height: 100%; object-fit: cover; }
.skin-name { font-size: 12px; }
```

- [ ] **Step 3: Syntax sanity check**

```bash
node --check brett/public/assets/loadout-modal.mjs
```

Expected: no output, exit code 0. (Node 20+ understands ESM with `--check`; if it errors with "import outside module", skip — the file is a browser ESM module and the syntax has already been validated by your editor.)

- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/loadout-modal.mjs brett/public/assets/style.css
git commit -m "feat(brett): loadout modal — Character Skin row + grid picker"
```

---

## Task 12: Admin panel — "Character Skins" management section

**Files:**
- Modify: `brett/public/assets/admin-panel.js`

We add a third button to the admin panel that opens a full-screen "Character Skins" management overlay. It lists existing skins (with thumb, name, animations) and a small upload form. Delete buttons hit `DELETE /api/skins/:id`; the upload form posts to `/api/skins/upload`. Both rely on the existing session cookie set by `/auth/login`.

- [ ] **Step 1: Add the management overlay HTML/CSS to `admin-panel.js`**

In `brett/public/assets/admin-panel.js`, append the following CSS rules inside the `CSS` template literal (around line 5):

```css
.ap-skins-overlay {
  position: fixed; inset: 0; background: rgba(10,13,18,0.95); z-index: 9000;
  display: flex; flex-direction: column; padding: 32px; overflow-y: auto;
  font-family: ui-sans-serif, system-ui, sans-serif; color: #e5e7eb;
}
.ap-skins-overlay h2 { color: #f59e0b; margin: 0 0 16px 0; }
.ap-skins-close {
  align-self: flex-end; background: #1f2937; color: #e5e7eb;
  border: 1px solid #374151; border-radius: 4px; padding: 6px 12px;
  font-size: 11px; cursor: pointer; margin-bottom: 16px;
}
.ap-skins-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.ap-skin-card {
  background: #1f2937; border: 1px solid #374151; border-radius: 6px; padding: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.ap-skin-card img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; background: #0e1014; }
.ap-skin-anim { color: #9ca3af; font-size: 10px; }
.ap-skin-delete { background: #dc2626; color: white; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 11px; }
.ap-skin-delete:disabled { background: #4b5563; cursor: not-allowed; }
.ap-skin-upload {
  margin-top: 24px; padding: 16px; background: #1f2937; border-radius: 6px;
  display: flex; flex-direction: column; gap: 8px; max-width: 480px;
}
.ap-skin-upload input, .ap-skin-upload button {
  padding: 6px 10px; background: #0e1014; color: #e5e7eb; border: 1px solid #374151; border-radius: 4px;
}
.ap-skin-upload button { cursor: pointer; }
.ap-skin-status { color: #10b981; font-size: 11px; }
.ap-skin-status.err { color: #f87171; }
```

- [ ] **Step 2: Add a "Skins" button in `renderPanel`**

Inside `renderPanel()` (around line 121), change the closing two action buttons block from:

```html
      <hr class="ap-sep" style="margin-top:auto">
      <button class="ap-action" data-action="reset">↩ Runde neu starten</button>
      <button class="ap-action blue" data-action="broadcast">🔗 Link senden</button>
```

to:

```html
      <hr class="ap-sep" style="margin-top:auto">
      <button class="ap-action" data-action="reset">↩ Runde neu starten</button>
      <button class="ap-action blue" data-action="broadcast">🔗 Link senden</button>
      <button class="ap-action" data-action="skins">👤 Charakter-Skins</button>
```

- [ ] **Step 3: Wire the new action**

Inside the `onAction` switch (around line 138), append a new case before the closing brace:

```js
      case 'skins': openSkinsOverlay(); break;
```

- [ ] **Step 4: Implement `openSkinsOverlay`**

Add this function inside the IIFE, anywhere after `escAttr` and before `return { mount, onMessage, toggle };`:

```js
  async function openSkinsOverlay() {
    let overlay = document.getElementById('ap-skins-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'ap-skins-overlay';
    overlay.className = 'ap-skins-overlay';
    overlay.innerHTML = `
      <button class="ap-skins-close" data-action="skins-close">Schließen</button>
      <h2>Charakter-Skins</h2>
      <div class="ap-skins-list" id="ap-skins-list">Lade…</div>
      <form class="ap-skin-upload" id="ap-skin-upload-form">
        <h3 style="margin:0;color:#f59e0b;">Neuen Skin hochladen</h3>
        <input type="text" name="name" placeholder="Anzeigename (z.B. Patrick)" maxlength="100" required>
        <label>GLB (max 20 MB):
          <input type="file" name="glb" accept=".glb,model/gltf-binary" required>
        </label>
        <label>Thumbnail (optional, PNG, max 512 KB):
          <input type="file" name="thumb" accept="image/png">
        </label>
        <button type="submit">Hochladen</button>
        <div class="ap-skin-status" id="ap-skin-status"></div>
      </form>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('[data-action="skins-close"]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#ap-skin-upload-form').addEventListener('submit', onUploadSubmit);
    await refreshSkinList(overlay);
  }

  async function refreshSkinList(overlay) {
    const list = overlay.querySelector('#ap-skins-list');
    list.textContent = 'Lade…';
    const r = await fetch('/api/skins', { credentials: 'same-origin' });
    const skins = r.ok ? await r.json() : [];
    if (!skins.length) { list.textContent = 'Keine Skins.'; return; }
    list.innerHTML = skins.map(s => `
      <div class="ap-skin-card">
        ${s.thumb ? `<img src="${escAttr(s.thumb)}" alt="${escHtml(s.name)}">` : '<div style="height:120px;background:#0e1014;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:36px;">👤</div>'}
        <strong>${escHtml(s.name)}</strong>
        <span class="ap-skin-anim">Animationen: ${(s.animations && s.animations.length) ? s.animations.join(', ') : '—'}</span>
        <button class="ap-skin-delete" data-skin-id="${escAttr(s.id)}" ${s.id === 'default' ? 'disabled' : ''}>Löschen</button>
      </div>
    `).join('');
    list.querySelectorAll('.ap-skin-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        if (!confirm(`Skin "${btn.dataset.skinId}" wirklich löschen?`)) return;
        const r = await fetch(`/api/skins/${encodeURIComponent(btn.dataset.skinId)}`, {
          method: 'DELETE', credentials: 'same-origin',
        });
        if (r.ok) refreshSkinList(overlay);
        else alert('Löschen fehlgeschlagen: ' + r.status);
      });
    });
  }

  async function onUploadSubmit(evt) {
    evt.preventDefault();
    const form   = evt.currentTarget;
    const status = form.querySelector('#ap-skin-status');
    status.classList.remove('err'); status.textContent = 'Lade hoch…';
    const fd = new FormData(form);
    try {
      const r = await fetch('/api/skins/upload', {
        method: 'POST', body: fd, credentials: 'same-origin',
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        status.classList.add('err');
        status.textContent = 'Fehler: ' + (out.error || r.status);
        return;
      }
      status.textContent = `✓ "${out.name}" hochgeladen (${(out.animations || []).length} Animationen)`;
      form.reset();
      await refreshSkinList(document.getElementById('ap-skins-overlay'));
    } catch (err) {
      status.classList.add('err');
      status.textContent = 'Netzwerkfehler: ' + err.message;
    }
  }
```

- [ ] **Step 5: Syntax sanity check**

```bash
node --check brett/public/assets/admin-panel.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Manual browser smoke test**

Start the dev server:
```bash
cd brett && ./dev-start.sh
```

Then in a browser at `http://brett.localhost` (or the URL printed by the script):
1. Log in as an admin (Keycloak).
2. Open the admin tab → click "👤 Charakter-Skins" → upload a real Mixamo-rigged GLB. Confirm it appears in the grid with the thumbnail and animation list.
3. Open the loadout modal (or navigate to the Mayhem mode entry that invokes it once wired up). Confirm the "Charakter-Skin" row shows "Mannequin" by default. Click "Ändern" → grid renders → pick your skin → `localStorage.brett.skinId` is set.
4. Reload, enter Mayhem mode. The local player should appear with the uploaded skin (after the GLB loads, ~1–3 s) and the procedural mannequin should be hidden.
5. Trigger ragdoll (take a hit). Confirm the skin flails with the spring system instead of playing the Mixamo clip.
6. Delete the skin from the admin overlay. Confirm the directory is gone (`ls brett/public/assets/skins/`).

Expected: all six steps work without console errors. If the skin loads but bones don't move, double-check Step 2 of Task 9 (the `_adoptSkin` mesh attachment).

- [ ] **Step 7: Run the full test suite once more**

```bash
cd brett && npm test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add brett/public/assets/admin-panel.js
git commit -m "feat(brett): admin panel — Character Skins upload/list/delete UI"
```

---

## Verification Checklist

After Task 12 lands, before opening the PR, confirm:

- [ ] `cd brett && npm test` is green (12+ new tests, no regressions).
- [ ] `node --check` succeeds on every modified `.js` / `.mjs` file.
- [ ] `brett/public/assets/skins/default/.gitkeep` is tracked (no GLB needed).
- [ ] `brett/public/lib/GLTFLoader.js` is tracked (vendored r128 build, NOT a CDN-link script).
- [ ] `multer` appears in `brett/package.json` and `brett/package-lock.json`.
- [ ] Manual smoke test from Task 12 Step 6 passes end-to-end with at least one real Mixamo skin.
- [ ] Selecting "Mannequin" in the picker reverts the local player to the procedural rig after respawn.
- [ ] Bots and remote players still use the procedural mannequin (no skin loading attempts in the network tab for non-local avatars).

---

## Out-of-Scope Confirmation (matches spec)

- Cross-device skin sync — none (localStorage only).
- Per-hero default skins — none (any skin pairs with any hero).
- Skin preview animation in the picker — static thumb only.
- Bot/remote-player skin support — bots and remote players are mannequin-only.
- Systembrett mode constellation figures — unchanged.
