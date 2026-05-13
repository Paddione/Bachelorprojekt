---
title: Brett Controls Redesign Implementation Plan
domains: [website, test]
status: active
pr_number: null
---

# Brett Controls Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Brett's overloaded toolbar + mouse-button mapping with a Figma-style tool-mode system (Tool-Rail left, figure-only Top-Toolbar, Side-Dock right), a four-mode camera state machine (Orbit/POV/Auto-Orbit/Free-Fly) with unified animation pipeline, six view presets, bookmarks, recording, and full touch parity for Android.

**Architecture:** All changes land in a single file (`brett/public/index.html`) using clearly-namespaced JS sections (`Cam`, `Tools`, `Bars`, `Modes`, `Bookmarks`, `Recorder`). The legacy `orbit` state object is replaced by a single `camera` object with `mode`/`theta`/`phi`/`radius`/`target` plus mode-specific fields and an `anim` slot. Every preset/POV/bookmark transition goes through one `easeCamera(to, duration, easing)` function; direct gestures cancel any animation. Layout is CSS Grid with three breakpoints (≥1024 / 640-1023 / <640 px). Toolbar collapse state persists in `localStorage`.

**Tech Stack:** Vanilla JS + Three.js (existing), no new libraries. Express server (`brett/server.js`) is unchanged. Tests via Playwright E2E (`tests/e2e/specs/brett-controls.spec.ts`). Deploy via `task feature:brett` (fans out to mentolder + korczewski).

**Spec reference:** `docs/superpowers/specs/2026-05-14-brett-controls-redesign-design.md`

**Branch:** `feature/brett-controls-redesign-2026-05-14`

**Security note:** All user-controlled strings (bookmark names, figure labels) must be inserted into the DOM via `textContent` / `createTextNode` / `document.createElement`, **never** via `innerHTML` template literals. The plan uses safe DOM-construction patterns throughout.

---

## Pre-flight

- [ ] **Worktree:** create per `superpowers:using-git-worktrees` skill
- [ ] **Branch:** `feature/brett-controls-redesign-2026-05-14`
- [ ] **Read context:** the spec file linked above (13 sections, 462 lines)
- [ ] **Local dev server:** `cd brett && npm install && node server.js` runs on `:3000`; needs `DATABASE_URL` env (point at dev shared-db via `task workspace:port-forward ENV=dev` if needed, else stub: `DATABASE_URL=postgres://nobody:nopass@127.0.0.1:1/none` — server starts but DB-backed endpoints fail. Static UI works for visual testing.)
- [ ] **Browser smoke baseline:** before any changes, open `http://localhost:3000?room=test` and verify current behavior (drag figures, RMB orbit, MMB pan, wheel zoom). Take a screenshot for visual diff baseline.

---

## Task 1 — Page Layout Grid + CSS Foundation

**Goal:** Convert page from `flex`-toolbar + canvas to a 3-bar grid layout (Top-Toolbar / Tool-Rail / Canvas / Side-Dock). Add CSS variables. No behavior change yet — Tool-Rail and Side-Dock are visible but empty skeletons.

**Files:**
- Modify: `brett/public/index.html` (CSS block ~lines 5-307; body ~lines 309-409)

- [ ] **Step 1: Inspect current layout**

```bash
grep -n "id=\"toolbar\"\|id=\"canvas-container\"\|#canvas-container\|body {" brett/public/index.html | head -10
```

Note the line numbers of `#toolbar`, `#canvas-container`, and the body grid (if any).

- [ ] **Step 2: Add CSS variables and grid shell**

Inside the existing `<style>` block, near the top (after the existing `:root` or `body` rules), add:

```css
  :root {
    --bc-panel: #16213e;
    --bc-bg: #1a1a2e;
    --bc-border: #0f3460;
    --bc-text: #e0e0e0;
    --bc-muted: #aab5cf;
    --bc-dim:   #5d6a8a;
    --bc-brass: #c8a96e;
    --bc-sage:  #6be0a0;
    --bc-danger: #e09090;
    --bc-rail-w: 42px;
    --bc-dock-w: 220px;
    --bc-top-h: 44px;
    --bc-anim: 200ms;
  }

  body {
    margin: 0;
    background: var(--bc-bg);
    color: var(--bc-text);
    overflow: hidden;
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: var(--bc-rail-w) 1fr var(--bc-dock-w);
    grid-template-areas:
      "top top top"
      "rail canvas dock";
  }

  body.bc-rail-collapsed { grid-template-columns: 14px 1fr var(--bc-dock-w); }
  body.bc-dock-collapsed { grid-template-columns: var(--bc-rail-w) 1fr 18px; }
  body.bc-rail-collapsed.bc-dock-collapsed { grid-template-columns: 14px 1fr 18px; }
  body.bc-top-collapsed { grid-template-rows: 32px 1fr; }

  @media (max-width: 1023px) and (min-width: 640px) {
    body { grid-template-columns: var(--bc-rail-w) 1fr 18px; }
    body.bc-dock-open { grid-template-columns: var(--bc-rail-w) 1fr var(--bc-dock-w); }
  }

  @media (max-width: 639px) {
    body { grid-template-columns: 0 1fr 0; grid-template-rows: var(--bc-top-h) 1fr; }
  }

  #toolbar { grid-area: top; }
  #bc-rail { grid-area: rail; background: #0f1a30; border-right: 1px solid var(--bc-border); display: flex; flex-direction: column; align-items: center; padding: 8px 0; gap: 6px; }
  #canvas-container { grid-area: canvas; position: relative; }
  #bc-dock { grid-area: dock; background: var(--bc-panel); border-left: 1px solid var(--bc-border); overflow-y: auto; padding: 8px 10px; font-size: 12px; }

  body.bc-rail-collapsed #bc-rail { padding: 0; }
  body.bc-rail-collapsed #bc-rail > * { display: none; }
  body.bc-rail-collapsed #bc-rail::before { content: '▶'; color: var(--bc-brass); font-size: 10px; padding: 8px 0; cursor: pointer; display: block; }

  body.bc-dock-collapsed #bc-dock { padding: 0; writing-mode: vertical-rl; text-align: center; color: var(--bc-brass); font-family: monospace; font-size: 11px; letter-spacing: 0.08em; cursor: pointer; }
  body.bc-dock-collapsed #bc-dock > * { display: none; }
  body.bc-dock-collapsed #bc-dock::before { content: '◀ ANSICHT'; display: block; padding: 14px 0; }
```

- [ ] **Step 3: Add Tool-Rail and Side-Dock skeleton inside `<body>`**

Locate `<div id="canvas-container">` (around line 403). Insert these siblings *before* and *after* it (the Top-Toolbar `#toolbar` already exists; we keep it):

Before `<div id="canvas-container">`:

```html
<aside id="bc-rail" aria-label="Werkzeug-Leiste">
  <!-- Tool buttons added in Task 4 -->
</aside>
```

After `</div>` of `#canvas-container`:

```html
<aside id="bc-dock" aria-label="Ansichten und Modi">
  <!-- Sections added in Task 3, 7, 9, 10, 11, 12, 13, 14 -->
</aside>
```

- [ ] **Step 4: Remove the old `flex` layout from `#toolbar` if present and any `position: absolute` body rules**

Search and remove any leftover `body { display: flex; flex-direction: column; }` or absolute-positioning that conflicts with the new grid. The `#toolbar` keeps its internal flex for child layout.

- [ ] **Step 5: Local smoke test**

```bash
cd brett && node server.js
# Open http://localhost:3000?room=test-grid in browser
```

Expected: Top-Toolbar visible at top, empty Tool-Rail (42px brass stripe) on the left, empty Side-Dock (220px panel) on the right, Canvas fills the remaining area. Three.js scene renders inside canvas; figures can still be placed/dragged (legacy behavior intact).

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): introduce 3-bar grid layout (Tool-Rail + Side-Dock skeleton)"
```

---

## Task 2 — Camera State Object + Animation Pipeline

**Goal:** Replace the legacy `orbit` object with a new `camera` state, add `easeCamera(to, dur, easing)` animation function, and re-route `updateCamera()` to read from it. Preserves all current behavior (RMB orbit, MMB pan, wheel zoom still work — they just write to `camera.theta/phi/radius/target` now).

**Files:**
- Modify: `brett/public/index.html` (JS section ~lines 615-625 and all event handlers ~lines 1527-1645)

- [ ] **Step 1: Locate current orbit declaration**

```bash
grep -n "const orbit" brett/public/index.html
```

Should find around line 616: `const orbit = { theta: 0, phi: 0.95, radius: 44, panX: 0, panZ: 0 };`

- [ ] **Step 2: Replace orbit with camera state**

Replace the `const orbit = …;` line and the following `function updateCamera() {…}` block with:

```javascript
// ── Camera state ──────────────────────────────────────────────
const camera_obj = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const camera = {
  mode: 'orbit',
  theta: 0, phi: 0.95, radius: 44,
  target: { x: 0, y: 0, z: 0 },

  povFigureId: null,
  povYaw: 0, povPitch: -0.087,
  fov: 45,

  flyPos: { x: 0, y: 8, z: 30 },
  flyYaw: 0, flyPitch: 0,
  flySpeed: 5,

  autoSpeed: 0.15,
  autoPausedUntil: 0,

  anim: null,
};

const easings = {
  linear: t => t,
  'ease-out-cubic': t => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
};

function snapshot() {
  return {
    mode: camera.mode,
    theta: camera.theta, phi: camera.phi, radius: camera.radius,
    target: { ...camera.target },
    povYaw: camera.povYaw, povPitch: camera.povPitch, fov: camera.fov,
    flyPos: { ...camera.flyPos }, flyYaw: camera.flyYaw, flyPitch: camera.flyPitch,
  };
}

function easeCamera(to, dur = 400, easing = 'ease-out-cubic', onDone = null) {
  // Honor prefers-reduced-motion → instant snap
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) dur = 0;
  if (dur <= 0) { applySnapshot({ ...snapshot(), ...to }); onDone && onDone(); return; }
  camera.anim = { from: snapshot(), to: { ...snapshot(), ...to }, t0: performance.now(), dur, easing, onDone };
}

function applySnapshot(s) {
  if (s.mode !== undefined) camera.mode = s.mode;
  if (s.theta !== undefined) camera.theta = s.theta;
  if (s.phi !== undefined)   camera.phi = s.phi;
  if (s.radius !== undefined) camera.radius = s.radius;
  if (s.target) camera.target = { ...s.target };
  if (s.povYaw !== undefined) camera.povYaw = s.povYaw;
  if (s.povPitch !== undefined) camera.povPitch = s.povPitch;
  if (s.fov !== undefined) camera.fov = s.fov;
  if (s.flyPos) camera.flyPos = { ...s.flyPos };
  if (s.flyYaw !== undefined) camera.flyYaw = s.flyYaw;
  if (s.flyPitch !== undefined) camera.flyPitch = s.flyPitch;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpVec3(a, b, t) { return { x: lerp(a.x,b.x,t), y: lerp(a.y,b.y,t), z: lerp(a.z,b.z,t) }; }

function tickAnim() {
  if (!camera.anim) return;
  const { from, to, t0, dur, easing, onDone } = camera.anim;
  const now = performance.now();
  const u = Math.min(1, (now - t0) / dur);
  const e = easings[easing](u);
  camera.theta  = lerp(from.theta,  to.theta,  e);
  camera.phi    = lerp(from.phi,    to.phi,    e);
  camera.radius = lerp(from.radius, to.radius, e);
  camera.target = lerpVec3(from.target, to.target, e);
  camera.fov    = lerp(from.fov,    to.fov,    e);
  if (u >= 1) {
    if (to.mode !== from.mode) camera.mode = to.mode;
    camera.anim = null;
    onDone && onDone();
  }
}

function updateCamera() {
  tickAnim();
  if (camera.mode === 'pov') {
    // Filled in Task 9
    return updateCameraOrbit();
  }
  if (camera.mode === 'freefly') {
    // Filled in Task 11
    return updateCameraOrbit();
  }
  return updateCameraOrbit();
}

function updateCameraOrbit() {
  camera_obj.fov = camera.fov;
  camera_obj.updateProjectionMatrix();
  camera_obj.position.set(
    camera.target.x + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta),
    camera.target.y + camera.radius * Math.cos(camera.phi),
    camera.target.z + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta)
  );
  camera_obj.lookAt(camera.target.x, camera.target.y, camera.target.z);
}

updateCamera();
```

- [ ] **Step 3: Rename old `camera` variable references**

The Three.js camera was the `const camera = new THREE.PerspectiveCamera…` from line ~615. In Step 2 it became `camera_obj`. Search and update **all** references in the file (raycaster, shadow camera, animate loop):

```bash
grep -n "\bcamera\." brett/public/index.html
```

Update every `camera.position`, `camera.lookAt`, `raycaster.setFromCamera(ndc, camera)`, `sun.shadow.camera` etc. to `camera_obj.position`, `camera_obj.lookAt`, `raycaster.setFromCamera(ndc, camera_obj)`, `sun.shadow.camera` (this last one is on `sun.shadow`, not our `camera` — leave it).

Then verify zero remaining bare `camera.` (Three.js refs):

```bash
grep -n "\bcamera\b\." brett/public/index.html | grep -v "camera_obj" | grep -v "camera\.\(mode\|theta\|phi\|radius\|target\|pov\|fly\|fov\|auto\|anim\)"
```

Expected: only matches to our new state `camera.mode`, `camera.theta`, etc.

- [ ] **Step 4: Migrate orbit-write call sites**

The legacy mouse handlers wrote `orbit.theta -= dx * 0.008` etc. Replace all `orbit.<field>` writes with `camera.<field>`. The pan handler writes `orbit.panX/panZ` — those become `camera.target.x/z`:

```javascript
// Old: orbit.panX += dx * f * Math.cos(orbit.theta) ...
// New:
camera.target.x += dx * f * Math.cos(camera.theta) + dy * f * Math.sin(camera.theta);
camera.target.z += dx * f * (-Math.sin(camera.theta)) + dy * f * Math.cos(camera.theta);
```

Replace `orbit.startX/startY` reads with module-level `let dragStart = { x: 0, y: 0 };` (used by handlers).

Adjust phi clamp on user orbit drag to match spec: `camera.phi = Math.max(0.05, Math.min(Math.PI/2.05, camera.phi + dy*0.008));`. The `setZoom()` helper still works — point it at `camera.radius`.

A direct user gesture must cancel any in-flight animation. At the top of `mousedown`, `wheel`, and `touchstart` handlers add: `camera.anim = null;`.

- [ ] **Step 5: Smoke test**

```bash
cd brett && node server.js
# Browser: http://localhost:3000?room=test-cam
```

Drag with RMB on board → camera orbits. Drag with MMB → pans (target moves). Wheel → zoom. Drag a figure → moves figure. Behavior should be identical to baseline.

- [ ] **Step 6: Write a smoke E2E test**

Create `tests/e2e/specs/brett-controls.spec.ts` (new file):

```typescript
import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('Brett Controls — Task 2 camera state', () => {
  test('camera state object exists and renders', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-cam-${Date.now()}`);
    await page.waitForFunction(() => typeof window.camera === 'object' && window.camera.mode === 'orbit', { timeout: 5000 });
    const state = await page.evaluate(() => ({ mode: window.camera.mode, theta: window.camera.theta, phi: window.camera.phi, radius: window.camera.radius }));
    expect(state.mode).toBe('orbit');
    expect(state.radius).toBeCloseTo(44, 1);
  });
});
```

For this to work, **expose `camera` on `window`** (one-line addition at the bottom of the script):

```javascript
window.camera = camera;
window.easeCamera = easeCamera;
```

- [ ] **Step 7: Run the test**

```bash
cd brett && DATABASE_URL=postgres://nobody:nopass@127.0.0.1:1/none node server.js &
SERVER_PID=$!
sleep 2
cd .. && BRETT_URL=http://localhost:3000 npx playwright test tests/e2e/specs/brett-controls.spec.ts
kill $SERVER_PID
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
git commit -m "feat(brett): camera state object + easeCamera animation pipeline"
```

---

## Task 3 — Six Presets + Home + Fit + Compass

**Goal:** Add `goToPreset(n)`, `goHome()`, `goFit()` functions; implement `computeFit()` using board + figures bounding sphere; wire `1-6`/`H`/`0`/`F` keyboard shortcuts; render the Compass widget that auto-updates from `camera.theta/phi`; render the "Ansichten" + "Presets" + "Zoom" sections of the Side-Dock with click handlers.

**Files:**
- Modify: `brett/public/index.html` (add JS functions, dock HTML, compass HTML, key handler, CSS for compass)

- [ ] **Step 1: Add preset definitions and helpers**

Below the `easeCamera` block from Task 2, add:

```javascript
// ── Presets ──────────────────────────────────────────────
const PRESETS = {
  1: { name: 'Top-Down', theta: 0,             phi: 0.05,       radius: 'fit' },
  2: { name: 'Frontal',  theta: 0,             phi: Math.PI/2.05, radius: 'fit' },
  3: { name: 'Links',    theta: -Math.PI/2,    phi: Math.PI/2.05, radius: 'fit' },
  4: { name: 'Rechts',   theta:  Math.PI/2,    phi: Math.PI/2.05, radius: 'fit' },
  5: { name: 'Iso',      theta: Math.PI/4,     phi: 0.95,       radius: 44 },
  6: { name: '3/4',      theta: Math.PI/6,     phi: 0.70,       radius: 50 },
};

function computeFit() {
  // Bounding sphere of board + figures
  const positions = [
    { x: -BW/2, z: -BD/2 }, { x: BW/2, z: BD/2 },
    ...figures.map(f => ({ x: f.mesh.position.x, z: f.mesh.position.z })),
  ];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  positions.forEach(p => { minX = Math.min(minX,p.x); maxX = Math.max(maxX,p.x); minZ = Math.min(minZ,p.z); maxZ = Math.max(maxZ,p.z); });
  const dx = maxX - minX, dz = maxZ - minZ;
  // 10% padding; radius scaled to fit half-diagonal into FOV
  const halfDiag = 0.5 * Math.sqrt(dx*dx + dz*dz);
  const vFov = camera_obj.fov * Math.PI / 180;
  const r = (halfDiag * 1.10) / Math.tan(vFov / 2);
  return Math.max(12, Math.min(75, r));
}

function goToPreset(n) {
  const p = PRESETS[n];
  if (!p) return;
  const radius = p.radius === 'fit' ? computeFit() : p.radius;
  easeCamera({ mode: 'orbit', theta: p.theta, phi: p.phi, radius, target: { x:0, y:0, z:0 } }, 400, 'ease-out-cubic');
  announceLive(`Ansicht: ${p.name}`);
}

function goHome() {
  easeCamera({ mode: 'orbit', ...PRESETS[5], radius: 44, target: { x:0, y:0, z:0 } }, 500, 'ease-in-out-cubic');
  announceLive('Home');
}

function goFit() {
  easeCamera({ radius: computeFit(), target: { x:0, y:0, z:0 } }, 350, 'ease-out-cubic');
  announceLive('Eingerahmt');
}

function activePresetName() {
  for (const [n, p] of Object.entries(PRESETS)) {
    const r = p.radius === 'fit' ? computeFit() : p.radius;
    if (Math.abs(camera.theta - p.theta) < 0.05 &&
        Math.abs(camera.phi - p.phi) < 0.05 &&
        Math.abs(camera.radius - r) < 1.0 &&
        Math.abs(camera.target.x) < 0.5 && Math.abs(camera.target.z) < 0.5) return p.name;
  }
  return null;
}

// aria-live announcer
const liveRegion = document.createElement('div');
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
document.body.appendChild(liveRegion);
function announceLive(text) { liveRegion.textContent = ''; setTimeout(() => liveRegion.textContent = text, 50); }

window.goToPreset = goToPreset; window.goHome = goHome; window.goFit = goFit;
```

- [ ] **Step 2: Add Side-Dock content for Ansichten/Presets/Zoom**

Inside `<aside id="bc-dock">` (currently empty), add static markup. Note the markup contains **no** user-controlled strings — only literal labels — so it's safe to write directly:

```html
<section class="bc-section">
  <h4>Ansichten</h4>
  <button class="bc-row" id="bc-home"><span>⌂ Home</span><kbd>H</kbd></button>
  <button class="bc-row" id="bc-fit"><span>⊕ Fit</span><kbd>F</kbd></button>
  <button class="bc-row" id="bc-help"><span>? Hilfe</span><kbd>?</kbd></button>
</section>

<section class="bc-section">
  <h4>Presets</h4>
  <button class="bc-row" data-preset="1"><span>▦ Top-Down</span><kbd>1</kbd></button>
  <button class="bc-row" data-preset="2"><span>▣ Frontal</span><kbd>2</kbd></button>
  <button class="bc-row" data-preset="3"><span>◀ Links</span><kbd>3</kbd></button>
  <button class="bc-row" data-preset="4"><span>▶ Rechts</span><kbd>4</kbd></button>
  <button class="bc-row" data-preset="5"><span>⬢ Iso</span><kbd>5</kbd></button>
  <button class="bc-row" data-preset="6"><span>▤ 3/4</span><kbd>6</kbd></button>
</section>

<section class="bc-section">
  <h4>Zoom</h4>
  <div class="bc-zoomrow">
    <button class="bc-mini" id="bc-zoom-out">−</button>
    <input type="range" id="bc-zoom-slider" min="12" max="75" step="0.5" value="44">
    <button class="bc-mini" id="bc-zoom-in">+</button>
  </div>
  <div style="text-align:center;color:var(--bc-dim);font-size:11px;font-family:monospace;"><span id="bc-zoom-val">44</span></div>
</section>
```

- [ ] **Step 3: Add CSS for dock rows + compass**

Inside `<style>`:

```css
  .bc-section { margin-bottom: 14px; }
  .bc-section h4 { color: var(--bc-brass); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; margin: 4px 0 6px; font-weight: 500; font-family: monospace; }
  .bc-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 8px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--bc-muted); font-size: 12px; font-family: monospace; cursor: pointer; }
  .bc-row:hover { border-color: var(--bc-border); color: var(--bc-text); background: rgba(15,52,96,0.4); }
  .bc-row.active { color: var(--bc-brass); border-color: rgba(200,169,110,0.4); background: rgba(200,169,110,0.10); }
  .bc-row kbd { color: var(--bc-dim); font-size: 10px; letter-spacing: 0.08em; }
  .bc-row.active kbd { color: var(--bc-brass); }
  .bc-zoomrow { display: flex; align-items: center; gap: 4px; }
  .bc-zoomrow input { flex: 1; }
  .bc-mini { width: 22px; height: 22px; padding: 0; background: #0f2040; border: 1px solid var(--bc-border); color: var(--bc-muted); border-radius: 3px; cursor: pointer; }

  /* Compass */
  #bc-compass {
    position: absolute; top: 12px; right: 12px;
    width: 52px; height: 52px;
    border: 1px solid var(--bc-brass);
    border-radius: 50%;
    background: rgba(7, 16, 31, 0.65);
    backdrop-filter: blur(4px);
    cursor: pointer;
    font-family: monospace;
    color: var(--bc-brass);
    z-index: 10;
  }
  #bc-compass svg { width: 100%; height: 100%; }
  #bc-compass:hover { background: rgba(15,32,64,0.85); }
```

- [ ] **Step 4: Add Compass SVG to canvas-container**

Inside `<div id="canvas-container">` (just before `</div>`), add static markup (no user input):

```html
<div id="bc-compass" title="Klick = Home (H)" role="button" aria-label="Kompass — Klick für Home">
  <svg viewBox="-30 -30 60 60">
    <circle cx="0" cy="0" r="22" fill="none" stroke="rgba(200,169,110,0.3)" stroke-width="0.5"/>
    <g id="bc-compass-rose">
      <text x="0" y="-14" text-anchor="middle" font-size="9" fill="currentColor" dominant-baseline="middle" font-weight="600">N</text>
      <text x="14" y="0"  text-anchor="middle" font-size="7" fill="currentColor" dominant-baseline="middle">E</text>
      <text x="0" y="14"  text-anchor="middle" font-size="7" fill="currentColor" dominant-baseline="middle">S</text>
      <text x="-14" y="0" text-anchor="middle" font-size="7" fill="currentColor" dominant-baseline="middle">W</text>
      <polygon points="0,-20 -3,-10 0,-13 3,-10" fill="currentColor"/>
    </g>
    <line id="bc-compass-horizon" x1="-10" y1="0" x2="10" y2="0" stroke="rgba(110,180,140,0.7)" stroke-width="1"/>
  </svg>
</div>
```

- [ ] **Step 5: Wire dock buttons and compass click**

Below the preset functions, add:

```javascript
// ── Dock wiring ──────────────────────────────────────────
document.getElementById('bc-home').addEventListener('click', goHome);
document.getElementById('bc-fit').addEventListener('click', goFit);
document.getElementById('bc-compass').addEventListener('click', goHome);
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => goToPreset(parseInt(btn.dataset.preset, 10)));
});

const bcZoomSlider = document.getElementById('bc-zoom-slider');
const bcZoomVal    = document.getElementById('bc-zoom-val');
function bcSetZoom(r) {
  camera.anim = null;
  camera.radius = Math.max(12, Math.min(75, r));
  bcZoomSlider.value = camera.radius;
  bcZoomVal.textContent = Math.round(camera.radius);
}
bcZoomSlider.addEventListener('input', () => bcSetZoom(parseFloat(bcZoomSlider.value)));
document.getElementById('bc-zoom-in') .addEventListener('click', () => bcSetZoom(camera.radius - 4));
document.getElementById('bc-zoom-out').addEventListener('click', () => bcSetZoom(camera.radius + 4));

// Update compass + active-preset + zoom-slider every frame
function tickCompass() {
  const rose = document.getElementById('bc-compass-rose');
  if (rose) rose.setAttribute('transform', `rotate(${-camera.theta * 180 / Math.PI})`);
  const horizon = document.getElementById('bc-compass-horizon');
  if (horizon) {
    const tilt = (Math.PI/2 - camera.phi) * 20;  // visual tilt indicator
    horizon.setAttribute('y1',  -tilt);
    horizon.setAttribute('y2',  -tilt);
  }
  bcZoomSlider.value = camera.radius;
  bcZoomVal.textContent = Math.round(camera.radius);
  // Active-preset highlight
  const name = activePresetName();
  document.querySelectorAll('[data-preset]').forEach(b => {
    b.classList.toggle('active', PRESETS[b.dataset.preset]?.name === name);
  });
}
// Hook into existing animate() loop — find `function animate()` and call tickCompass() inside
```

- [ ] **Step 6: Hook tickCompass into animate loop**

Find the existing `function animate() { … }` block (around line 1805). Add `tickCompass();` after `updateCamera();` inside its body.

- [ ] **Step 7: Add keyboard shortcuts**

Below all the dock wiring, add:

```javascript
// ── Keyboard ─────────────────────────────────────────────
function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', e => {
  if (isTypingTarget(document.activeElement)) {
    // Only allow Esc to bubble from modals; the modal handles it.
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (k >= '1' && k <= '6') { goToPreset(parseInt(k, 10)); e.preventDefault(); return; }
  if (k === 'h' || k === 'H' || k === '0') { goHome(); e.preventDefault(); return; }
  if (k === 'f' || k === 'F') { goFit(); e.preventDefault(); return; }
  if (k === '+' || k === '=') { bcSetZoom(camera.radius - 4); e.preventDefault(); return; }
  if (k === '-' || k === '_') { bcSetZoom(camera.radius + 4); e.preventDefault(); return; }
});
```

- [ ] **Step 8: Smoke test**

```bash
cd brett && node server.js
# Browser: http://localhost:3000?room=test-presets
```

Press `1` → camera animates to top-down. Press `5` → returns to isometric. Press `H` → home. Press `F` → fit. Click compass → home. Drag in dock zoom slider → zoom changes. Active preset highlighted in dock.

- [ ] **Step 9: Add E2E tests**

Append to `tests/e2e/specs/brett-controls.spec.ts`:

```typescript
test.describe('Brett Controls — Task 3 presets', () => {
  test('keyboard 1 enters top-down view', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-preset-${Date.now()}`);
    await page.waitForFunction(() => typeof window.goToPreset === 'function', { timeout: 5000 });
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    const phi = await page.evaluate(() => window.camera.phi);
    expect(phi).toBeLessThan(0.10);
  });

  test('keyboard H returns to home from any view', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-home-${Date.now()}`);
    await page.waitForFunction(() => typeof window.goToPreset === 'function');
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    await page.keyboard.press('h');
    await page.waitForTimeout(600);
    const { phi, radius } = await page.evaluate(() => ({ phi: window.camera.phi, radius: window.camera.radius }));
    expect(phi).toBeCloseTo(0.95, 1);
    expect(radius).toBeCloseTo(44, 1);
  });
});
```

Run: `BRETT_URL=http://localhost:3000 npx playwright test tests/e2e/specs/brett-controls.spec.ts` → expected PASS.

- [ ] **Step 10: Commit**

```bash
git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
git commit -m "feat(brett): 6 view presets + home + fit + compass widget"
```

---

## Task 4 — Tool-Rail + Tool-Mode System (V/O/P/R/F/E)

**Goal:** Implement the Figma-style tool system. Adds Tool-Rail HTML/CSS, `activeTool` state, keyboard switching (`V O P R F E`), `Space`-hold temp-pan, cursor changes, and refactors `mousedown/move/up` to dispatch by active tool. Removes the legacy RMB-orbit / RMB-rotate / MMB-pan overload (replaces with single LMB-drag based on active tool, with RMB-drag = temp-pan).

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add Tool-Rail HTML (static, no user input)**

Inside `<aside id="bc-rail">`, add:

```html
<button class="bc-tool active" data-tool="V" title="Auswählen (V)" aria-label="Tool: Auswählen"><span>↖</span><kbd>V</kbd></button>
<button class="bc-tool" data-tool="O" title="Orbit (O)" aria-label="Tool: Kamera drehen"><span>⟲</span><kbd>O</kbd></button>
<button class="bc-tool" data-tool="P" title="Pan (P)" aria-label="Tool: Brett verschieben"><span>✋</span><kbd>P</kbd></button>
<button class="bc-tool" data-tool="R" title="Figur drehen (R)" aria-label="Tool: Figur drehen"><span>⟳</span><kbd>R</kbd></button>
<button class="bc-tool" data-tool="F" title="Fokus (F)" aria-label="Tool: Fokus"><span>⊕</span><kbd>F</kbd></button>
<button class="bc-tool" data-tool="E" title="POV (E)" aria-label="Tool: Aus Figur-Augen"><span>👁</span><kbd>E</kbd></button>
```

- [ ] **Step 2: Add Tool-Rail CSS**

In `<style>`:

```css
  .bc-tool {
    width: 32px; height: 32px;
    background: var(--bc-panel); border: 1px solid var(--bc-border); border-radius: 5px;
    color: var(--bc-muted);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: monospace; font-size: 13px; cursor: pointer;
    transition: background 100ms, border-color 100ms;
    padding: 0;
  }
  .bc-tool:hover { border-color: var(--bc-brass); color: var(--bc-text); }
  .bc-tool.active { background: rgba(200,169,110,0.15); border-color: var(--bc-brass); color: var(--bc-brass); }
  .bc-tool:focus-visible { outline: 2px solid var(--bc-brass); outline-offset: 2px; }
  .bc-tool kbd { font-size: 8px; color: var(--bc-dim); margin-top: -2px; }
  .bc-tool.active kbd { color: var(--bc-brass); }

  body.bc-tool-V #canvas-container { cursor: default; }
  body.bc-tool-O #canvas-container { cursor: move; }
  body.bc-tool-P #canvas-container { cursor: grab; }
  body.bc-tool-P.bc-panning #canvas-container { cursor: grabbing; }
  body.bc-tool-R #canvas-container { cursor: ew-resize; }
  body.bc-tool-F #canvas-container { cursor: crosshair; }
  body.bc-tool-E #canvas-container { cursor: cell; }
```

- [ ] **Step 3: Add activeTool state and setActiveTool()**

```javascript
// ── Tool-Mode system ─────────────────────────────────────
let activeTool = 'V';
let spaceHeld = false;

function setActiveTool(t) {
  if (!'VOPRFE'.includes(t)) return;
  activeTool = t;
  document.querySelectorAll('.bc-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  document.body.className = document.body.className.replace(/\bbc-tool-[A-Z]\b/g, '').trim();
  document.body.classList.add(`bc-tool-${t}`);
  updateHint();
  announceLive(`Werkzeug: ${toolName(t)}`);
}
function toolName(t) {
  return { V: 'Auswählen', O: 'Orbit', P: 'Pan', R: 'Figur drehen', F: 'Fokus', E: 'POV' }[t];
}
document.querySelectorAll('.bc-tool').forEach(b => b.addEventListener('click', () => setActiveTool(b.dataset.tool)));
setActiveTool('V');

window.setActiveTool = setActiveTool;
window.getActiveTool = () => activeTool;
```

- [ ] **Step 4: Refactor `mousedown` to dispatch by tool**

Find the existing `canvas.addEventListener('mousedown', e => {…})` block (~line 1529). Replace it with:

```javascript
const cnv = document.getElementById('three-canvas');
let drag = { on: false, fig: null };
let panOn = false;
let rotFig = null, rotStartX = 0, rotFigStartY = 0;
let lastClick = { fig: null, time: 0 };
let orbitOn = false;
let dragStart = { x: 0, y: 0 };

cnv.addEventListener('contextmenu', e => e.preventDefault());

cnv.addEventListener('mousedown', e => {
  if (typeof modal !== 'undefined' && modal.classList.contains('visible')) return;
  camera.anim = null;

  const ndc = getNDC(e);
  const fig = pickFigure(ndc);

  // RMB = always temp-pan (replaces old RMB-orbit / RMB-rotate)
  if (e.button === 2) {
    panOn = true;
    dragStart = { x: e.clientX, y: e.clientY };
    document.body.classList.add('bc-panning');
    return;
  }

  // MMB = also temp-pan (kept for legacy parity)
  if (e.button === 1) {
    panOn = true;
    dragStart = { x: e.clientX, y: e.clientY };
    document.body.classList.add('bc-panning');
    e.preventDefault();
    return;
  }

  // Space-hold + LMB = temp-pan regardless of tool
  if (e.button === 0 && spaceHeld) {
    panOn = true;
    dragStart = { x: e.clientX, y: e.clientY };
    document.body.classList.add('bc-panning');
    return;
  }

  if (e.button !== 0) return;

  // Dispatch LMB by active tool
  switch (activeTool) {
    case 'V':
      if (fig) {
        const now = Date.now();
        if (lastClick.fig === fig && now - lastClick.time < 380) { openLabelModal(fig); lastClick.fig = null; return; }
        lastClick = { fig, time: now };
        selectFigure(fig);
        drag = { on: true, fig };
      } else {
        selectFigure(null);
        lastClick.fig = null;
      }
      break;
    case 'O':
      orbitOn = true;
      dragStart = { x: e.clientX, y: e.clientY };
      break;
    case 'P':
      panOn = true;
      dragStart = { x: e.clientX, y: e.clientY };
      document.body.classList.add('bc-panning');
      break;
    case 'R':
      if (fig) {
        selectFigure(fig);
        rotFig = fig; rotStartX = e.clientX; rotFigStartY = fig.rotY;
      }
      break;
    case 'F':
      goFit();
      break;
    case 'E':
      if (fig) { selectFigure(fig); /* enterPOV(fig.id);  // wired in Task 9 */ }
      break;
  }
});
```

- [ ] **Step 5: Refactor `mousemove`**

Replace the existing handler with:

```javascript
cnv.addEventListener('mousemove', e => {
  if (rotFig) {
    const dx = e.clientX - rotStartX;
    const raw = rotFigStartY + dx * 0.018;
    const SNAP = Math.PI / 4;
    const nearest = Math.round(raw / SNAP) * SNAP;
    setRotY(rotFig, Math.abs(raw - nearest) < 0.14 ? nearest : raw);
    return;
  }
  if (orbitOn) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    camera.theta -= dx * 0.008;
    camera.phi = Math.max(0.05, Math.min(Math.PI/2.05, camera.phi + dy*0.008));
    dragStart = { x: e.clientX, y: e.clientY };
    return;
  }
  if (panOn) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const f = camera.radius * 0.01;
    camera.target.x += dx * f * Math.cos(camera.theta) + dy * f * Math.sin(camera.theta);
    camera.target.z += dx * f * (-Math.sin(camera.theta)) + dy * f * Math.cos(camera.theta);
    dragStart = { x: e.clientX, y: e.clientY };
    return;
  }
  if (drag.on && drag.fig) {
    const pos = pickBoard(getNDC(e));
    if (pos) {
      drag.fig.mesh.position.x = Math.max(-BW/2+1, Math.min(BW/2-1, pos.x));
      drag.fig.mesh.position.z = Math.max(-BD/2+1, Math.min(BD/2-1, pos.z));
      if (!applyingRemote) sendMoveThrottled(drag.fig);
    }
  }
});
```

- [ ] **Step 6: Refactor `mouseup`**

```javascript
cnv.addEventListener('mouseup', e => {
  if (panOn) { panOn = false; document.body.classList.remove('bc-panning'); }
  if (orbitOn) orbitOn = false;
  if (rotFig) {
    const SNAP = Math.PI / 4;
    setRotY(rotFig, Math.round(rotFig.rotY / SNAP) * SNAP);
    if (!applyingRemote) send({ type: 'update', id: rotFig.id, changes: { rotY: rotFig.rotY } });
    rotFig = null;
  }
  if (drag.on && drag.fig && !applyingRemote) {
    send({ type: 'move', id: drag.fig.id, x: drag.fig.mesh.position.x, z: drag.fig.mesh.position.z });
  }
  drag = { on:false, fig:null };
});
```

- [ ] **Step 7: Extend keyboard handler with tool switching + Space-hold**

In the keydown handler from Task 3, add tool keys (before the digit check):

```javascript
  // Inside keydown handler, after the typing-target guard:
  if (e.key === ' ' && !e.repeat) {
    spaceHeld = true;
    document.body.classList.add('bc-space-hold');
    e.preventDefault();
    return;
  }
  const tk = e.key.toUpperCase();
  if ('VOPRE'.includes(tk) && !e.shiftKey) {
    setActiveTool(tk);
    e.preventDefault();
    return;
  }
  // 'F' is both tool and Fit — pressing F triggers goFit AND sets tool F. Keep both behaviors:
  if (tk === 'F' && !e.shiftKey) {
    setActiveTool('F');
    goFit();
    e.preventDefault();
    return;
  }
  // ... existing digit/H/0 handling below
```

Add a matching `keyup`:

```javascript
document.addEventListener('keyup', e => {
  if (e.key === ' ') {
    spaceHeld = false;
    document.body.classList.remove('bc-space-hold');
  }
});
```

- [ ] **Step 8: Add contextual Hint zone**

Replace the legacy `<div id="hint">` content (around line 405) with:

```html
<div id="bc-hint" role="status" aria-live="off"></div>
```

CSS:

```css
  #bc-hint {
    position: absolute; left: 12px; bottom: 12px;
    background: rgba(7,16,31,0.7); padding: 5px 10px;
    border: 1px solid var(--bc-border); border-radius: 4px;
    color: var(--bc-muted); font-size: 11px; letter-spacing: 0.04em;
    pointer-events: none;
    opacity: 1;
    transition: opacity 400ms;
  }
  #bc-hint.bc-fade { opacity: 0; }
```

JS — uses `textContent` (safe for any future dynamic strings):

```javascript
const HINTS = {
  V: 'Tap = auswählen · Drag = Figur ziehen · Doppel-Tap = Beschriftung',
  O: 'Drag = Brett rotieren · Wheel/Pinch = Zoom · RMB = Pan',
  P: 'Drag = Brett verschieben',
  R: 'Drag horizontal auf Figur = drehen (snap π/4)',
  F: 'F = alles einrahmen · Klick auf Figur = darauf fokussieren',
  E: 'Figur wählen, dann E oder Klick = aus deren Augen sehen',
};
let hintFadeTimer = null;
function updateHint() {
  const el = document.getElementById('bc-hint');
  if (!el) return;
  el.textContent = HINTS[activeTool] || '';
  el.classList.remove('bc-fade');
  clearTimeout(hintFadeTimer);
  hintFadeTimer = setTimeout(() => el.classList.add('bc-fade'), 10_000);
}
updateHint();
```

- [ ] **Step 9: Smoke test**

```bash
cd brett && node server.js
```

In browser: press `O` — Tool-Rail highlights Orbit; cursor changes to move. LMB-drag now orbits (used to require RMB). Press `P` — cursor grab; LMB-drag pans. Press `R`, click figure, drag — rotates figure. Press `V`, drag figure — moves it. Hold Space + drag — temp-pan regardless of tool. RMB-drag — temp-pan. MMB-drag — temp-pan (legacy parity).

- [ ] **Step 10: E2E test**

Append:

```typescript
test.describe('Brett Controls — Task 4 tool modes', () => {
  test('keyboard V/O/P/R/F/E switches active tool', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-tool-${Date.now()}`);
    await page.waitForFunction(() => typeof window.setActiveTool === 'function');
    for (const k of ['V', 'O', 'P', 'R', 'F', 'E']) {
      await page.keyboard.press(k.toLowerCase());
      const active = await page.evaluate(() => window.getActiveTool());
      expect(active).toBe(k);
    }
  });
});
```

- [ ] **Step 11: Commit**

```bash
git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
git commit -m "feat(brett): Tool-Rail with Figma-style V/O/P/R/F/E modes"
```

---

## Task 5 — Touch Parity (1F/2F/Long-Press/3F)

**Goal:** Wire touch handlers: 1F-drag dispatches by tool (same as LMB), 2F-drag = pan, 2F-pinch = zoom, long-press 400ms = context menu, 3F-tap = home. Existing touch handlers in `index.html` are replaced.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Locate and remove existing touch handlers**

```bash
grep -n "touchstart\|touchmove\|touchend\|tPrev" brett/public/index.html
```

Note the line numbers of the existing handlers (around line 1648). They will be replaced.

- [ ] **Step 2: Write new touch handlers**

Replace the entire touch block with:

```javascript
// ── Touch ──────────────────────────────────────────────
const touch = {
  count: 0,
  startX: 0, startY: 0, lastX: 0, lastY: 0,
  pinchDist: 0,
  fig: null,
  longPressTimer: null,
  longPressFired: false,
  startedAt: 0,
  _lastTap: 0,
};

function touchDist(t1, t2) {
  const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

cnv.addEventListener('touchstart', e => {
  if (typeof modal !== 'undefined' && modal.classList.contains('visible')) return;
  camera.anim = null;
  touch.count = e.touches.length;
  touch.startedAt = performance.now();
  touch.longPressFired = false;

  if (e.touches.length === 1) {
    const t = e.touches[0];
    touch.startX = touch.lastX = t.clientX;
    touch.startY = touch.lastY = t.clientY;
    const ndc = getNDC(t);
    touch.fig = pickFigure(ndc);

    // Long-press timer (400ms) → context menu
    touch.longPressTimer = setTimeout(() => {
      touch.longPressFired = true;
      openContextMenu(touch.fig, touch.lastX, touch.lastY);
    }, 400);

    // Dispatch by tool on press-down (drag is handled in touchmove)
    if (activeTool === 'V' && touch.fig) selectFigure(touch.fig);
    if (activeTool === 'R' && touch.fig) {
      rotFig = touch.fig; rotStartX = t.clientX; rotFigStartY = touch.fig.rotY;
    }
    if (activeTool === 'E' && touch.fig) { /* POV-enter in Task 9 */ }
  } else if (e.touches.length === 2) {
    clearTimeout(touch.longPressTimer);
    touch.pinchDist = touchDist(e.touches[0], e.touches[1]);
    touch.lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    touch.lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  } else if (e.touches.length === 3) {
    // 3-finger tap will fire on touchend
    clearTimeout(touch.longPressTimer);
  }
  e.preventDefault();
}, { passive: false });

cnv.addEventListener('touchmove', e => {
  // Any movement cancels long-press
  clearTimeout(touch.longPressTimer);

  if (e.touches.length === 1) {
    const t = e.touches[0];
    const dx = t.clientX - touch.lastX;
    const dy = t.clientY - touch.lastY;

    if (rotFig) {
      const totalDx = t.clientX - rotStartX;
      const raw = rotFigStartY + totalDx * 0.018;
      const SNAP = Math.PI/4;
      const n = Math.round(raw / SNAP) * SNAP;
      setRotY(rotFig, Math.abs(raw - n) < 0.14 ? n : raw);
    } else if (activeTool === 'V' && touch.fig) {
      const pos = pickBoard(getNDC(t));
      if (pos) {
        touch.fig.mesh.position.x = Math.max(-BW/2+1, Math.min(BW/2-1, pos.x));
        touch.fig.mesh.position.z = Math.max(-BD/2+1, Math.min(BD/2-1, pos.z));
        if (!applyingRemote) sendMoveThrottled(touch.fig);
      }
    } else if (activeTool === 'O') {
      camera.theta -= dx * 0.008;
      camera.phi = Math.max(0.05, Math.min(Math.PI/2.05, camera.phi + dy*0.008));
    } else if (activeTool === 'P') {
      const f = camera.radius * 0.01;
      camera.target.x += dx * f * Math.cos(camera.theta) + dy * f * Math.sin(camera.theta);
      camera.target.z += dx * f * (-Math.sin(camera.theta)) + dy * f * Math.cos(camera.theta);
    }
    touch.lastX = t.clientX; touch.lastY = t.clientY;
  } else if (e.touches.length === 2) {
    // 2F: pan + pinch zoom (tool-agnostic)
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const dx = cx - touch.lastX;
    const dy = cy - touch.lastY;
    const f = camera.radius * 0.01;
    camera.target.x += dx * f * Math.cos(camera.theta) + dy * f * Math.sin(camera.theta);
    camera.target.z += dx * f * (-Math.sin(camera.theta)) + dy * f * Math.cos(camera.theta);
    touch.lastX = cx; touch.lastY = cy;

    const d = touchDist(e.touches[0], e.touches[1]);
    const ratio = d / touch.pinchDist;
    if (ratio > 0) {
      const r = Math.max(12, Math.min(75, camera.radius / ratio));
      camera.radius = r;
    }
    touch.pinchDist = d;
  }
  e.preventDefault();
}, { passive: false });

cnv.addEventListener('touchend', e => {
  clearTimeout(touch.longPressTimer);
  const wasCount = touch.count;
  const duration = performance.now() - touch.startedAt;

  if (wasCount === 3 && duration < 500 && !touch.longPressFired) {
    goHome();  // 3-finger tap = reset
  }

  if (rotFig && wasCount === 1) {
    const SNAP = Math.PI/4;
    setRotY(rotFig, Math.round(rotFig.rotY / SNAP) * SNAP);
    if (!applyingRemote) send({ type: 'update', id: rotFig.id, changes: { rotY: rotFig.rotY } });
  }
  rotFig = null;
  touch.count = e.touches.length;
  touch.fig = null;
}, { passive: false });
```

- [ ] **Step 3: Implement openContextMenu() with safe DOM construction**

Add markup (no user input — static labels):

```html
<!-- Inside <body>, near the end -->
<div id="bc-context-menu" role="menu" aria-hidden="true">
  <button data-ctx="rotate" role="menuitem">↻ Drehen…</button>
  <button data-ctx="pov" role="menuitem">👁 Aus dieser Sicht</button>
  <button data-ctx="delete" role="menuitem">✕ Löschen</button>
  <button data-ctx="home" role="menuitem">⌂ Home</button>
</div>
```

CSS:

```css
  #bc-context-menu {
    position: fixed; display: none;
    background: var(--bc-panel); border: 1px solid var(--bc-border); border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 1500; min-width: 160px;
    padding: 4px; font-size: 12px;
  }
  #bc-context-menu.open { display: block; }
  #bc-context-menu button {
    display: block; width: 100%; text-align: left; padding: 6px 10px;
    background: transparent; border: none; color: var(--bc-text); cursor: pointer; font-size: 12px;
  }
  #bc-context-menu button:hover { background: rgba(15,52,96,0.6); }
```

JS:

```javascript
let ctxFig = null;
function openContextMenu(fig, x, y) {
  ctxFig = fig;
  const menu = document.getElementById('bc-context-menu');
  menu.querySelectorAll('button').forEach(b => {
    const needsFig = ['rotate','pov','delete'].includes(b.dataset.ctx);
    b.disabled = needsFig && !fig;
    b.style.opacity = needsFig && !fig ? '0.4' : '1';
  });
  menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  menu.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');
}
function closeContextMenu() {
  document.getElementById('bc-context-menu').classList.remove('open');
  document.getElementById('bc-context-menu').setAttribute('aria-hidden', 'true');
}
document.getElementById('bc-context-menu').addEventListener('click', e => {
  const b = e.target.closest('button[data-ctx]');
  if (!b || b.disabled) return;
  switch (b.dataset.ctx) {
    case 'rotate':  if (ctxFig) { setActiveTool('R'); } break;
    case 'pov':     /* enterPOV(ctxFig.id); — Task 9 */ break;
    case 'delete':  if (ctxFig) { send({ type: 'delete', id: ctxFig.id }); } break;
    case 'home':    goHome(); break;
  }
  closeContextMenu();
});
document.addEventListener('click', e => {
  if (!e.target.closest('#bc-context-menu')) closeContextMenu();
});
```

For desktop RMB context menu: replace the existing `cnv.addEventListener('contextmenu', e => e.preventDefault())` line. Keep `e.preventDefault()` (so the browser menu doesn't show), but **don't** auto-open the menu here — RMB-drag = pan is the primary use. Instead, at the bottom of `mouseup`, detect a no-drag RMB release and open then:

```javascript
  // Inside mouseup handler:
  if (e.button === 2) {
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (Math.sqrt(dx*dx + dy*dy) < 5) {
      openContextMenu(pickFigure(getNDC(e)), e.clientX, e.clientY);
    }
  }
```

- [ ] **Step 4: Smoke test**

In a touch-capable browser (Chrome DevTools → Toggle device toolbar → Pixel 7):

- 1-finger drag on board with O active → orbit
- 1-finger drag on board with P active → pan
- 1-finger drag on figure with V active → moves figure
- 2-finger drag → pan (always)
- 2-finger pinch → zoom in/out
- Long-press 400ms on figure → context menu opens
- Long-press 400ms on empty board → context menu opens with figure-specific items grayed out
- 3-finger tap → home
- Tap outside context menu → closes it
- Right-click on desktop → context menu

- [ ] **Step 5: E2E touch test (CDP touch emulation)**

Append:

```typescript
test.describe('Brett Controls — Task 5 touch', () => {
  test.use({ hasTouch: true, viewport: { width: 412, height: 915 } });
  test('two-finger pinch changes radius', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-pinch-${Date.now()}`);
    await page.waitForFunction(() => typeof window.camera === 'object');
    const before = await page.evaluate(() => window.camera.radius);
    // Synthesize a pinch-in via touchscreen
    await page.evaluate(() => {
      const cnv = document.getElementById('three-canvas');
      const r = cnv.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const t1Down = new TouchEvent('touchstart', { touches: [
        new Touch({ identifier: 1, target: cnv, clientX: cx - 50, clientY: cy }),
        new Touch({ identifier: 2, target: cnv, clientX: cx + 50, clientY: cy }),
      ]});
      cnv.dispatchEvent(t1Down);
      const t2Move = new TouchEvent('touchmove', { touches: [
        new Touch({ identifier: 1, target: cnv, clientX: cx - 100, clientY: cy }),
        new Touch({ identifier: 2, target: cnv, clientX: cx + 100, clientY: cy }),
      ]});
      cnv.dispatchEvent(t2Move);
    });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.camera.radius);
    expect(after).toBeLessThan(before);
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
git commit -m "feat(brett): full touch parity (1F/2F/long-press/3F)"
```

---

## Task 6 — Collapsible Bars + LocalStorage Persistence

**Goal:** Add `▾` chevrons to each bar header. Clicking collapses/expands. State persists per board-ID in localStorage. Keyboard `\` toggles all bars (distraction-free), `[`/`]` toggle Rail/Dock individually, `⇧\` toggles Top-Toolbar.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add chevrons to bar headers (static markup)**

The Top-Toolbar has many children. Append a chevron button at the end (`</div>` of `#toolbar`). The Tool-Rail and Side-Dock collapse via the body class + CSS already added in Task 1.

Top-Toolbar (`#toolbar`) — append before the closing tag:

```html
<button id="bc-collapse-top" class="bc-chevron" title="Toolbar einklappen (⇧\)" aria-label="Toolbar einklappen">▾</button>
```

Tool-Rail (`#bc-rail`) — append at the end:

```html
<button id="bc-collapse-rail" class="bc-chevron bc-chevron-rail" title="Tool-Rail ([)" aria-label="Tool-Rail einklappen" style="margin-top:auto;">◀</button>
```

Side-Dock (`#bc-dock`) — prepend at the top, before the first `<section>`:

```html
<button id="bc-collapse-dock" class="bc-chevron bc-chevron-dock" title="Dock (])" aria-label="Side-Dock einklappen" style="float:right;margin: -4px -4px 0 0;">▸</button>
```

- [ ] **Step 2: CSS for chevrons**

```css
  .bc-chevron {
    background: transparent; border: 1px solid transparent;
    color: var(--bc-brass); cursor: pointer;
    padding: 2px 6px; border-radius: 3px; font-size: 11px; font-family: monospace;
  }
  .bc-chevron:hover { border-color: var(--bc-brass); }
  body.bc-top-collapsed #toolbar > * { display: none; }
  body.bc-top-collapsed #toolbar #bc-collapse-top { display: inline-block; }
  body.bc-top-collapsed #toolbar { padding: 6px 10px; }
```

- [ ] **Step 3: Add Bars namespace JS**

```javascript
// ── Bars: collapse / restore / persistence ───────────────
const Bars = {
  state: { top: false, rail: false, dock: false },
  init() {
    try {
      const room = new URLSearchParams(location.search).get('room') || 'default';
      const saved = JSON.parse(localStorage.getItem('brett-bars-' + room) || '{}');
      this.state = { top: !!saved.top, rail: !!saved.rail, dock: !!saved.dock };
    } catch {}
    this.apply();
  },
  apply() {
    document.body.classList.toggle('bc-top-collapsed',  this.state.top);
    document.body.classList.toggle('bc-rail-collapsed', this.state.rail);
    document.body.classList.toggle('bc-dock-collapsed', this.state.dock);
  },
  save() {
    try {
      const room = new URLSearchParams(location.search).get('room') || 'default';
      localStorage.setItem('brett-bars-' + room, JSON.stringify(this.state));
    } catch {}
  },
  toggle(which) { this.state[which] = !this.state[which]; this.apply(); this.save(); },
  toggleAll()   {
    const anyOpen = !this.state.top || !this.state.rail || !this.state.dock;
    this.state = { top: anyOpen, rail: anyOpen, dock: anyOpen };
    this.apply(); this.save();
  },
};
window.Bars = Bars;
Bars.init();

document.getElementById('bc-collapse-top') ?.addEventListener('click', () => Bars.toggle('top'));
document.getElementById('bc-collapse-rail')?.addEventListener('click', () => Bars.toggle('rail'));
document.getElementById('bc-collapse-dock')?.addEventListener('click', () => Bars.toggle('dock'));

// Click on collapsed stubs reopens
document.getElementById('bc-rail').addEventListener('click', e => {
  if (Bars.state.rail && (e.target === document.getElementById('bc-rail'))) Bars.toggle('rail');
});
document.getElementById('bc-dock').addEventListener('click', e => {
  if (Bars.state.dock && (e.target === document.getElementById('bc-dock'))) Bars.toggle('dock');
});
```

- [ ] **Step 4: Wire keyboard shortcuts**

In the keydown handler, after the typing-target guard:

```javascript
  if (e.key === '\\') {
    if (e.shiftKey) Bars.toggle('top'); else Bars.toggleAll();
    e.preventDefault();
    return;
  }
  if (e.key === '[') { Bars.toggle('rail'); e.preventDefault(); return; }
  if (e.key === ']') { Bars.toggle('dock'); e.preventDefault(); return; }
```

- [ ] **Step 5: Smoke test**

Click each chevron — bar collapses. Reload page — same state persists (use same `?room=` param). Press `\` — all bars toggle. Press `[` — Tool-Rail toggles. Press `]` — Side-Dock toggles. Press `⇧\` — Top-Toolbar toggles.

- [ ] **Step 6: E2E test**

```typescript
test.describe('Brett Controls — Task 6 collapsible bars', () => {
  test('bar state persists across reload', async ({ page }) => {
    const room = `e2e-bars-${Date.now()}`;
    await page.goto(`${BRETT_URL}?room=${room}`);
    await page.waitForFunction(() => typeof window.Bars === 'object');
    await page.keyboard.press(']');  // collapse dock
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.Bars.state.dock)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.Bars === 'object');
    expect(await page.evaluate(() => window.Bars.state.dock)).toBe(true);
    expect(await page.evaluate(() => document.body.classList.contains('bc-dock-collapsed'))).toBe(true);
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
git commit -m "feat(brett): collapsible toolbars with localStorage persistence"
```

---

## Task 7 — Phone Breakpoint (FAB + Bottom-Sheet)

**Goal:** Under 640px width, replace the Tool-Rail with a Floating Action Button (FAB, long-press = radial menu) and the Side-Dock with a swipe-up Bottom-Sheet (Griff + 4 tabs).

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Phone CSS — FAB + Bottom-Sheet**

```css
  @media (max-width: 639px) {
    #bc-rail { display: none; }
    #bc-fab {
      position: fixed; right: 16px; bottom: 96px;
      width: 56px; height: 56px;
      background: var(--bc-panel); border: 1px solid var(--bc-brass);
      border-radius: 50%; color: var(--bc-brass);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
      z-index: 1200;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    #bc-fab-radial {
      position: fixed; right: 16px; bottom: 160px;
      display: none;
      flex-direction: column; gap: 6px;
      z-index: 1200;
    }
    #bc-fab-radial.open { display: flex; }
    #bc-fab-radial button {
      width: 44px; height: 44px;
      background: var(--bc-panel); border: 1px solid var(--bc-border);
      border-radius: 50%; color: var(--bc-muted);
    }
    #bc-fab-radial button.active { color: var(--bc-brass); border-color: var(--bc-brass); }

    #bc-dock {
      position: fixed !important; left: 0; right: 0; bottom: 0;
      width: auto !important; max-height: 60vh;
      transform: translateY(calc(100% - 80px));
      transition: transform 250ms ease-out;
      z-index: 1000;
      border-top: 1px solid var(--bc-border); border-left: none;
      padding: 0 !important;
    }
    body.bc-sheet-open #bc-dock { transform: translateY(0); }
    body.bc-sheet-full #bc-dock { transform: translateY(0); max-height: 100vh; }

    #bc-sheet-grab {
      width: 100%; height: 32px;
      display: flex; align-items: center; justify-content: center;
      cursor: grab;
    }
    #bc-sheet-grab::before {
      content: ''; width: 36px; height: 4px;
      background: var(--bc-dim); border-radius: 2px;
    }
    #bc-sheet-tabs {
      display: flex; gap: 6px; padding: 0 12px 8px;
      overflow-x: auto;
    }
    #bc-sheet-tabs button {
      padding: 5px 10px; background: #0f2040; border: 1px solid var(--bc-border);
      border-radius: 4px; color: var(--bc-muted); font-size: 11px;
      font-family: monospace; white-space: nowrap;
    }
    #bc-sheet-tabs button.active { background: rgba(200,169,110,0.15); border-color: var(--bc-brass); color: var(--bc-brass); }

    .bc-section { display: none; padding: 10px 12px; }
    .bc-section.active { display: block; }
  }
```

- [ ] **Step 2: Add FAB + Bottom-Sheet markup (static)**

Inside `<body>`, near the end (after `#bc-context-menu`):

```html
<button id="bc-fab" aria-label="Werkzeug-Auswahl" title="Long-Press für Radial-Menü">↖</button>
<div id="bc-fab-radial" role="menu">
  <button data-tool="V" aria-label="Auswählen">↖</button>
  <button data-tool="O" aria-label="Orbit">⟲</button>
  <button data-tool="P" aria-label="Pan">✋</button>
  <button data-tool="R" aria-label="Drehen">⟳</button>
  <button data-tool="F" aria-label="Fokus">⊕</button>
  <button data-tool="E" aria-label="POV">👁</button>
</div>
```

Inside `<aside id="bc-dock">`, prepend (above existing sections):

```html
<div id="bc-sheet-grab" aria-label="Bottom-Sheet ziehen"></div>
<div id="bc-sheet-tabs">
  <button data-tab="ansicht" class="active">Ansicht</button>
  <button data-tab="modi">Modi</button>
  <button data-tab="marks">Marks</button>
  <button data-tab="aufnahme">📷</button>
</div>
```

And add tab-content wrappers around existing dock sections (modify the existing markup):

```html
<div data-tab-content="ansicht">
  <section class="bc-section"> ... Ansichten ... </section>
  <section class="bc-section"> ... Presets ... </section>
  <section class="bc-section"> ... Zoom ... </section>
</div>
<div data-tab-content="modi" hidden>
  <p style="color:var(--bc-dim);text-align:center;padding:20px;font-size:11px;">Modi werden in Task 10-12 hinzugefügt</p>
</div>
<div data-tab-content="marks" hidden>
  <p style="color:var(--bc-dim);text-align:center;padding:20px;font-size:11px;">Lesezeichen werden in Task 13 hinzugefügt</p>
</div>
<div data-tab-content="aufnahme" hidden>
  <p style="color:var(--bc-dim);text-align:center;padding:20px;font-size:11px;">Aufnahmen werden in Task 14 hinzugefügt</p>
</div>
```

- [ ] **Step 3: Wire FAB + Bottom-Sheet JS**

```javascript
// ── Mobile: FAB + Bottom-Sheet ───────────────────────────
const FAB_ICONS = { V:'↖', O:'⟲', P:'✋', R:'⟳', F:'⊕', E:'👁' };
const fab = document.getElementById('bc-fab');
const fabRadial = document.getElementById('bc-fab-radial');
let fabLongPressTimer = null;
let fabLongPressFired = false;

fab.addEventListener('pointerdown', () => {
  fabLongPressFired = false;
  fabLongPressTimer = setTimeout(() => { fabLongPressFired = true; fabRadial.classList.add('open'); }, 400);
});
fab.addEventListener('pointerup', () => {
  clearTimeout(fabLongPressTimer);
  if (!fabLongPressFired) {
    // Tap = cycle to next tool
    const order = 'VOPRFE';
    const i = order.indexOf(activeTool);
    setActiveTool(order[(i + 1) % order.length]);
  }
});
fab.addEventListener('pointercancel', () => clearTimeout(fabLongPressTimer));

fabRadial.querySelectorAll('button[data-tool]').forEach(b => {
  b.addEventListener('click', () => {
    setActiveTool(b.dataset.tool);
    fabRadial.classList.remove('open');
  });
});

document.addEventListener('click', e => {
  if (!e.target.closest('#bc-fab') && !e.target.closest('#bc-fab-radial')) fabRadial.classList.remove('open');
});

// Sync FAB icon when tool changes (wrap setActiveTool safely)
const _prevSetActiveTool = window.setActiveTool;
window.setActiveTool = function(t) {
  _prevSetActiveTool(t);
  // textContent is safe — only known glyph chars from FAB_ICONS
  fab.textContent = FAB_ICONS[t] || '↖';
  fabRadial.querySelectorAll('button[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
};

// Bottom-Sheet
const sheetGrab = document.getElementById('bc-sheet-grab');
let sheetState = 'closed';
function setSheetState(s) {
  sheetState = s;
  document.body.classList.toggle('bc-sheet-open', s === 'half');
  document.body.classList.toggle('bc-sheet-full', s === 'full');
}
sheetGrab.addEventListener('click', () => {
  if (sheetState === 'closed') setSheetState('half');
  else if (sheetState === 'half') setSheetState('full');
  else setSheetState('closed');
});

document.getElementById('bc-sheet-tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('#bc-sheet-tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('[data-tab-content]').forEach(c => {
    c.hidden = c.dataset.tabContent !== b.dataset.tab;
  });
  if (sheetState === 'closed') setSheetState('half');
});
```

- [ ] **Step 4: Smoke test**

Chrome DevTools → Pixel 7 device emulation. Reload. Tool-Rail gone, FAB visible bottom-right. Tap FAB cycles tools (icon updates). Long-press FAB opens radial. Bottom-Sheet shows grab handle, tabs; tap grab opens sheet to ~60%, tap again → full, tap again → closed. Tab switching changes section.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): phone breakpoint with FAB tool-switcher and bottom-sheet dock"
```

---

## Task 8 — Top-Toolbar Reorganization + Tablet Layout

**Goal:** Remove the legacy zoom-section from the Top-Toolbar (it's now in the Side-Dock). Clean up old structure so the Top-Toolbar holds **only** figure tools + global actions. On tablet width, hide some labels and compress.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Remove zoom controls from Top-Toolbar**

Find the existing block:

```html
<div class="sep"></div>
<span class="tlabel">Zoom</span>
<div id="zoom-section">
  <button class="size-btn" id="zoom-out" title="Herauszoomen">−</button>
  <input type="range" id="zoom-slider" min="12" max="75" step="0.5" value="44">
  <button class="size-btn" id="zoom-in" title="Heranzoomen">+</button>
  <span id="zoom-val">44</span>
</div>
```

Remove it from the toolbar markup entirely. The old JS handlers (`zoomSlider.addEventListener…` etc.) need to either be removed or made null-safe. The cleanest approach: remove them since the dock has its own:

```bash
grep -n "zoomSlider\|getElementById('zoom-" brett/public/index.html
```

Delete each line (they should be in the legacy `setZoom`/`zoomSlider` block — pure deletes).

- [ ] **Step 2: Add tablet media query polish**

```css
  @media (max-width: 1023px) and (min-width: 640px) {
    #toolbar .tlabel { display: none; }    /* hide text labels, keep icons */
    #toolbar .color-swatch:nth-of-type(n+5) { display: none; }  /* keep only first 4 swatches */
    #toolbar .size-btn[data-scale="0.6"],
    #toolbar .size-btn[data-scale="1.5"] { display: none; }  /* S/L hidden, only M */
  }
```

- [ ] **Step 3: Smoke test**

- Desktop (≥1024 px): full Top-Toolbar.
- Tablet (768 × 1024): compact Top-Toolbar (only icons, only M button, 4 swatches). Tool-Rail visible, Dock collapsed by default (per Task 1 grid). Tap dock-handle → reveals dock.
- Phone (375 × 667): Top-Toolbar inline but very compact, FAB + Bottom-Sheet active.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): top-toolbar reorganization, remove zoom (lives in dock), tablet compression"
```

---

## Task 9 — POV Mode

**Goal:** Implement "Aus den Augen von Figur X". `E`-key + selected figure enters POV; camera animates to head height, looking forward (figure's `rotY`). 1F-drag = look around (limited yaw/pitch). FOV-zoom replaces radius. Banner shows current POV figure + exit button. Camera follows figure if it moves via WebSocket. `Esc` or banner-click exits.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add POV banner markup (static + safe ID for dynamic text)**

Inside `<div id="canvas-container">` (after compass):

```html
<div id="bc-pov-banner" role="status" aria-live="polite" hidden>
  <span id="bc-pov-banner-prefix">👁 Sicht von </span>
  <span id="bc-pov-banner-name"></span>
  <button id="bc-pov-exit" aria-label="POV verlassen">⎋ Verlassen</button>
</div>
```

CSS:

```css
  #bc-pov-banner {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(110,180,140,0.18); border: 1px solid var(--bc-sage);
    color: var(--bc-sage); padding: 6px 14px; border-radius: 18px;
    font-family: monospace; font-size: 12px;
    display: flex; align-items: center; gap: 10px;
    z-index: 100;
  }
  #bc-pov-banner button { background: transparent; border: 1px solid currentColor; color: currentColor; padding: 2px 8px; border-radius: 8px; cursor: pointer; font-size: 11px; }
```

- [ ] **Step 2: POV state + enter/exit**

```javascript
// ── POV Mode ─────────────────────────────────────────────
let povSavedSnapshot = null;

function enterPOV(figureId) {
  const fig = figures.find(f => f.id === figureId);
  if (!fig) return;
  povSavedSnapshot = snapshot();
  const headY = 3.0 * (fig.scale || 1.0);
  const headPos = { x: fig.mesh.position.x, y: headY, z: fig.mesh.position.z };
  const fwd = { x: Math.sin(fig.rotY), z: Math.cos(fig.rotY) };
  const tgt = { x: headPos.x + fwd.x * 5, y: headY * 0.85, z: headPos.z + fwd.z * 5 };
  easeCamera({
    mode: 'pov',
    target: tgt,
    radius: 5.0,
    theta: fig.rotY,
    phi: Math.PI / 2.0 + 0.087,
    fov: 55,
  }, 600, 'ease-in-out-cubic', () => {
    camera.povFigureId = figureId;
    camera.povYaw = 0; camera.povPitch = -0.087;
    // textContent is SAFE — fig.label may contain user input but textContent escapes it
    document.getElementById('bc-pov-banner-name').textContent = fig.label || 'Figur';
    document.getElementById('bc-pov-banner').hidden = false;
    Bars._savedBeforeMode = { ...Bars.state };
    Bars.state.rail = true; Bars.state.dock = true; Bars.apply();
  });
}

function exitPOV() {
  if (camera.mode !== 'pov') return;
  camera.povFigureId = null;
  document.getElementById('bc-pov-banner').hidden = true;
  const to = povSavedSnapshot ? { ...povSavedSnapshot, mode: 'orbit' } : { mode: 'orbit', ...PRESETS[5] };
  easeCamera(to, 500, 'ease-out-cubic', () => {
    if (Bars._savedBeforeMode) { Bars.state = Bars._savedBeforeMode; Bars.apply(); }
  });
}

document.getElementById('bc-pov-exit').addEventListener('click', exitPOV);
window.enterPOV = enterPOV; window.exitPOV = exitPOV;

// POV camera-update override
const _prevUpdateCamera = updateCamera;
updateCamera = function() {
  tickAnim();
  if (camera.mode === 'pov' && camera.povFigureId && !camera.anim) {
    const fig = figures.find(f => f.id === camera.povFigureId);
    if (fig) {
      const headY = 3.0 * (fig.scale || 1.0);
      camera_obj.fov = camera.fov;
      camera_obj.updateProjectionMatrix();
      camera_obj.position.set(fig.mesh.position.x, headY, fig.mesh.position.z);
      const yaw = fig.rotY + camera.povYaw;
      const pitch = camera.povPitch;
      camera_obj.lookAt(
        fig.mesh.position.x + Math.sin(yaw) * Math.cos(pitch),
        headY + Math.sin(pitch),
        fig.mesh.position.z + Math.cos(yaw) * Math.cos(pitch)
      );
      return;
    }
  }
  return updateCameraOrbit();
};
```

- [ ] **Step 3: POV interaction — mouse/touch look-around**

Inside `mousemove`, when `camera.mode === 'pov'` is true, replace the orbit branch with POV look:

```javascript
  if (camera.mode === 'pov' && (orbitOn || activeTool === 'O')) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    camera.povYaw   = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.povYaw - dx * 0.005));
    camera.povPitch = Math.max(-Math.PI/4, Math.min(Math.PI/4, camera.povPitch - dy * 0.005));
    dragStart = { x: e.clientX, y: e.clientY };
    return;
  }
```

In touchmove, do the same for `camera.mode === 'pov' && e.touches.length === 1`.

- [ ] **Step 4: Wire E-tool + dock toggle + context-menu POV**

In the existing E-tool case (Task 4), replace with:

```javascript
    case 'E':
      if (camera.mode === 'pov') exitPOV();
      else if (fig) enterPOV(fig.id);
      break;
```

In context-menu handler (Task 5), the 'pov' case:

```javascript
    case 'pov': if (ctxFig) enterPOV(ctxFig.id); break;
```

In keydown, add `Esc` handling at the top:

```javascript
  if (e.key === 'Escape') {
    if (camera.mode === 'pov') { exitPOV(); e.preventDefault(); return; }
    closeContextMenu();
    return;
  }
```

- [ ] **Step 5: Smoke test**

Place a figure with a label. Select it (V tool, click). Press `E` → camera animates to figure's eye level, looking forward. Banner shows the label as text (any HTML in the label is escaped — verified via console: `figures[0].label = '<script>'` then enter POV → banner shows literal `<script>`). Drag = look around. Press `Esc` → exit, camera returns to previous view.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): POV mode — see through a figure's eyes"
```

---

## Task 10 — Auto-Orbit Mode

**Goal:** Slow continuous theta-drift around the board center. Toggled with `A` or dock checkbox. Speed slider in dock. Pauses 1.5s after any gesture.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add Modi section to dock**

Replace the placeholder content in `<div data-tab-content="modi">` (from Task 7) with:

```html
<div data-tab-content="modi">
  <section class="bc-section bc-modi">
    <h4>Modi</h4>
    <button class="bc-row" id="bc-mode-pov"><span>👁 POV von …</span><kbd>E</kbd></button>
    <button class="bc-row" id="bc-mode-auto"><span>⟳ Auto-Orbit</span><kbd>A</kbd></button>
    <div class="bc-zoomrow" style="margin-top:4px;">
      <span style="font-size:10px;color:var(--bc-dim);width:30px;">Tempo</span>
      <input type="range" id="bc-auto-speed" min="0.02" max="0.5" step="0.02" value="0.15">
    </div>
    <button class="bc-row" id="bc-mode-fly"><span>✈ Free-Fly</span><kbd>⇧F</kbd></button>
    <button class="bc-row" id="bc-mode-split"><span>⫼ Split-View</span><kbd>⇧S</kbd></button>
  </section>
</div>
```

- [ ] **Step 2: Auto-Orbit JS**

```javascript
// ── Auto-Orbit ───────────────────────────────────────────
let autoOrbitOn = false;
function toggleAutoOrbit() {
  autoOrbitOn = !autoOrbitOn;
  document.getElementById('bc-mode-auto').classList.toggle('active', autoOrbitOn);
  announceLive(autoOrbitOn ? 'Auto-Orbit ein' : 'Auto-Orbit aus');
  if (autoOrbitOn && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    autoOrbitOn = false;
    document.getElementById('bc-mode-auto').classList.remove('active');
  }
}
document.getElementById('bc-mode-auto').addEventListener('click', toggleAutoOrbit);
document.getElementById('bc-auto-speed').addEventListener('input', e => { camera.autoSpeed = parseFloat(e.target.value); });

let _lastFrame = performance.now();
function tickAutoOrbit() {
  const now = performance.now();
  const dt = (now - _lastFrame) / 1000;
  _lastFrame = now;
  if (autoOrbitOn && camera.mode === 'orbit' && now > camera.autoPausedUntil && !camera.anim) {
    camera.theta += camera.autoSpeed * dt;
  }
  return dt;
}
// Hook into animate(): add `tickAutoOrbit()` before updateCamera()

// Any gesture pauses auto-orbit for 1.5s
['mousedown', 'wheel', 'touchstart'].forEach(ev => {
  cnv.addEventListener(ev, () => { camera.autoPausedUntil = performance.now() + 1500; }, { passive: true, capture: true });
});

window.toggleAutoOrbit = toggleAutoOrbit;
```

- [ ] **Step 3: Wire `A` shortcut**

In keydown:

```javascript
  if ((e.key === 'a' || e.key === 'A') && !e.shiftKey) {
    toggleAutoOrbit();
    e.preventDefault();
    return;
  }
```

- [ ] **Step 4: Hook into animate loop**

In the existing `function animate()`, before `updateCamera()`, add:

```javascript
  tickAutoOrbit();
```

- [ ] **Step 5: Smoke test**

Press `A` → camera starts rotating slowly. Drag → pauses for 1.5s, then resumes. Speed slider in dock changes rate. Press `A` again → stops.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): auto-orbit mode with speed slider and gesture-pause"
```

---

## Task 11 — Free-Fly Mode

**Goal:** Camera-free WASD movement + mouse-look. Touch alternative: double-tap a board point → 1.5s animated flight to that location. `⇧F` toggles; `Esc` returns to last orbit state.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Free-Fly state + enter/exit**

```javascript
// ── Free-Fly ─────────────────────────────────────────────
let flySavedSnapshot = null;
const flyKeys = { w: false, a: false, s: false, d: false, q: false, e: false, ' ': false, Shift: false };

function enterFreeFly() {
  if (camera.mode !== 'orbit') return;
  flySavedSnapshot = snapshot();
  const startPos = { x: camera_obj.position.x, y: camera_obj.position.y, z: camera_obj.position.z };
  camera.flyPos = startPos;
  camera.flyYaw = camera.theta + Math.PI;
  camera.flyPitch = -(Math.PI/2 - camera.phi);
  easeCamera({ mode: 'freefly' }, 500, 'ease-out-cubic', () => {
    document.getElementById('bc-fly-banner').hidden = false;
  });
}
function exitFreeFly() {
  if (camera.mode !== 'freefly') return;
  document.getElementById('bc-fly-banner').hidden = true;
  const to = flySavedSnapshot ? { ...flySavedSnapshot, mode: 'orbit' } : { mode: 'orbit', ...PRESETS[5] };
  easeCamera(to, 500, 'ease-out-cubic');
}

document.addEventListener('keydown', e => {
  const k = e.key === 'Shift' ? 'Shift' : e.key.toLowerCase();
  if (k in flyKeys) flyKeys[k] = true;
});
document.addEventListener('keyup', e => {
  const k = e.key === 'Shift' ? 'Shift' : e.key.toLowerCase();
  if (k in flyKeys) flyKeys[k] = false;
});

function tickFreeFly(dt) {
  if (camera.mode !== 'freefly') return;
  const speed = camera.flySpeed * (flyKeys.Shift ? 3 : 1) * dt;
  const fwd = { x: -Math.sin(camera.flyYaw), z: -Math.cos(camera.flyYaw) };
  const right = { x: -fwd.z, z: fwd.x };
  if (flyKeys.w) { camera.flyPos.x += fwd.x * speed; camera.flyPos.z += fwd.z * speed; }
  if (flyKeys.s) { camera.flyPos.x -= fwd.x * speed; camera.flyPos.z -= fwd.z * speed; }
  if (flyKeys.a) { camera.flyPos.x -= right.x * speed; camera.flyPos.z -= right.z * speed; }
  if (flyKeys.d) { camera.flyPos.x += right.x * speed; camera.flyPos.z += right.z * speed; }
  if (flyKeys[' '] || flyKeys.e) camera.flyPos.y += speed;
  if (flyKeys.q) camera.flyPos.y -= speed;
}

// Extend updateCamera() to handle freefly
const _prevUpdateCamera2 = updateCamera;
updateCamera = function() {
  tickAnim();
  if (camera.mode === 'freefly' && !camera.anim) {
    camera_obj.fov = 60;
    camera_obj.updateProjectionMatrix();
    camera_obj.position.set(camera.flyPos.x, camera.flyPos.y, camera.flyPos.z);
    camera_obj.lookAt(
      camera.flyPos.x + Math.sin(camera.flyYaw) * Math.cos(camera.flyPitch),
      camera.flyPos.y + Math.sin(camera.flyPitch),
      camera.flyPos.z + Math.cos(camera.flyYaw) * Math.cos(camera.flyPitch)
    );
    return;
  }
  if (camera.mode === 'pov') return _prevUpdateCamera2.call(null);
  return updateCameraOrbit();
};
window.enterFreeFly = enterFreeFly; window.exitFreeFly = exitFreeFly;
```

Modify the `animate()` loop to compute dt and pass it:

```javascript
  const dt = tickAutoOrbit();   // returns dt from Task 10's tick fn
  tickFreeFly(dt);
```

- [ ] **Step 2: Free-Fly look (mouse + touch)**

In `mousemove`, before the orbit branch:

```javascript
  if (camera.mode === 'freefly') {
    if (orbitOn || drag.on) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      camera.flyYaw -= dx * 0.005;
      camera.flyPitch = Math.max(-Math.PI/2 * 0.95, Math.min(Math.PI/2 * 0.95, camera.flyPitch - dy * 0.005));
      dragStart = { x: e.clientX, y: e.clientY };
    }
    return;
  }
```

Tap-to-Fly on touch (in touchstart, after the long-press timer is started):

```javascript
  if (e.touches.length === 1 && camera.mode === 'freefly') {
    const now = performance.now();
    if (now - touch._lastTap < 350) {
      const pos = pickBoard(getNDC(e.touches[0]));
      if (pos) {
        easeCamera({ flyPos: { x: pos.x, y: 8, z: pos.z + 12 } }, 1500, 'ease-out-cubic');
      }
    }
    touch._lastTap = now;
  }
```

- [ ] **Step 3: Banner + dock wiring (static markup)**

Markup (inside `#canvas-container`):

```html
<div id="bc-fly-banner" role="status" aria-live="polite" hidden>
  <span>✈ Free-Fly · WASD + Maus · Shift = Sprint</span>
  <button id="bc-fly-exit" aria-label="Free-Fly verlassen">⎋</button>
</div>
```

CSS:

```css
  #bc-fly-banner {
    position: absolute; top: 50px; left: 50%; transform: translateX(-50%);
    background: rgba(200,169,110,0.18); border: 1px solid var(--bc-brass);
    color: var(--bc-brass); padding: 6px 14px; border-radius: 18px;
    font-family: monospace; font-size: 12px;
    display: flex; align-items: center; gap: 10px; z-index: 100;
  }
  #bc-fly-banner button { background: transparent; border: 1px solid currentColor; color: currentColor; padding: 2px 8px; border-radius: 8px; cursor: pointer; font-size: 11px; }
```

JS:

```javascript
document.getElementById('bc-fly-exit').addEventListener('click', exitFreeFly);
document.getElementById('bc-mode-fly').addEventListener('click', () => {
  if (camera.mode === 'freefly') exitFreeFly(); else enterFreeFly();
});
```

Keyboard `⇧F`:

```javascript
  if ((e.key === 'F' || e.key === 'f') && e.shiftKey) {
    if (camera.mode === 'freefly') exitFreeFly(); else enterFreeFly();
    e.preventDefault();
    return;
  }
```

Extend Esc handler:

```javascript
  if (e.key === 'Escape') {
    if (camera.mode === 'pov') { exitPOV(); e.preventDefault(); return; }
    if (camera.mode === 'freefly') { exitFreeFly(); e.preventDefault(); return; }
    closeContextMenu();
    return;
  }
```

- [ ] **Step 4: Smoke test**

`⇧F` → enters Free-Fly. WASD moves camera. Mouse-drag = look around. Space = up. Q = down. Shift+WASD = 3× faster. Touch: double-tap on board → 1.5s flight to that point. `Esc` → back to orbit.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): free-fly mode with WASD + mouse-look + tap-to-fly"
```

---

## Task 12 — Split-View

**Goal:** Toggle splits the canvas into two viewports rendered by the same WebGL context (`renderer.setViewport`). Left = primary (interactive). Right = secondary, picked from a dropdown (Top/Front/Iso/POV-figure/Bookmark).

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: State + secondary camera**

```javascript
// ── Split-View ───────────────────────────────────────────
let splitOn = false;
let splitRatio = 0.5;
const camera_obj_secondary = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
let secondaryView = { kind: 'preset', value: 1 };

function enterSplit() { splitOn = true; document.getElementById('bc-split-controls').hidden = false; document.getElementById('bc-mode-split').classList.add('active'); onResize(); }
function exitSplit()  { splitOn = false; document.getElementById('bc-split-controls').hidden = true; document.getElementById('bc-mode-split').classList.remove('active'); onResize(); }

document.getElementById('bc-mode-split').addEventListener('click', () => { splitOn ? exitSplit() : enterSplit(); });
```

- [ ] **Step 2: Render two viewports**

Find the existing render call in `animate()` (e.g., `renderer.render(scene, camera_obj)`). Replace with:

```javascript
  if (splitOn) {
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const splitX = Math.floor(w * splitRatio);
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, splitX, h);
    renderer.setScissor(0, 0, splitX, h);
    renderer.render(scene, camera_obj);
    camera_obj_secondary.aspect = (w - splitX) / h;
    camera_obj_secondary.updateProjectionMatrix();
    configureSecondaryCamera();
    renderer.setViewport(splitX, 0, w - splitX, h);
    renderer.setScissor(splitX, 0, w - splitX, h);
    renderer.render(scene, camera_obj_secondary);
    renderer.setScissorTest(false);
  } else {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
    renderer.render(scene, camera_obj);
  }
```

Add `configureSecondaryCamera`:

```javascript
function configureSecondaryCamera() {
  if (secondaryView.kind === 'preset') {
    const p = PRESETS[secondaryView.value]; if (!p) return;
    const r = p.radius === 'fit' ? computeFit() : p.radius;
    camera_obj_secondary.position.set(
      r * Math.sin(p.phi) * Math.sin(p.theta),
      r * Math.cos(p.phi),
      r * Math.sin(p.phi) * Math.cos(p.theta)
    );
    camera_obj_secondary.lookAt(0, 0, 0);
  } else if (secondaryView.kind === 'pov' && camera.povFigureId) {
    const fig = figures.find(f => f.id === camera.povFigureId);
    if (fig) {
      camera_obj_secondary.position.set(fig.mesh.position.x, 3.0 * (fig.scale||1), fig.mesh.position.z);
      camera_obj_secondary.lookAt(
        fig.mesh.position.x + Math.sin(fig.rotY) * 5,
        2.0 * (fig.scale||1),
        fig.mesh.position.z + Math.cos(fig.rotY) * 5
      );
    }
  }
}
```

- [ ] **Step 3: Split-View controls (static markup)**

Append to the Modi section:

```html
<div id="bc-split-controls" hidden style="margin-top:4px;">
  <select id="bc-split-source" style="width:100%;padding:4px;background:#0f2040;border:1px solid var(--bc-border);color:var(--bc-text);font-size:11px;">
    <option value="preset:1">Top-Down</option>
    <option value="preset:2">Frontal</option>
    <option value="preset:5" selected>Iso</option>
    <option value="preset:6">3/4</option>
  </select>
</div>
```

JS:

```javascript
document.getElementById('bc-split-source').addEventListener('change', e => {
  const [kind, val] = e.target.value.split(':');
  secondaryView = { kind, value: kind === 'preset' ? parseInt(val,10) : val };
});
```

- [ ] **Step 4: Keyboard ⇧S**

```javascript
  if ((e.key === 'S' || e.key === 's') && e.shiftKey) {
    splitOn ? exitSplit() : enterSplit();
    e.preventDefault();
    return;
  }
```

- [ ] **Step 5: Smoke test**

`⇧S` → canvas splits 50/50. Right shows isometric. Dropdown changes the right perspective. `⇧S` again → unsplit. While splitting, all interactions still drive the left (primary) view.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): split-view with selectable secondary perspective"
```

---

## Task 13 — Bookmarks (with safe DOM construction)

**Goal:** Save/restore named camera snapshots in localStorage. `B` saves current (auto-named "Lesezeichen N"); `⇧1`–`⇧9` restore by index. Dock lists all bookmarks; double-click to rename. **All bookmark name rendering uses `textContent` — no `innerHTML` template literals with user data.**

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Bookmarks namespace + storage**

```javascript
// ── Bookmarks ────────────────────────────────────────────
const Bookmarks = {
  items: [],
  key() { return 'brett-bookmarks-' + (new URLSearchParams(location.search).get('room') || 'default'); },
  load() {
    try { this.items = JSON.parse(localStorage.getItem(this.key()) || '[]'); }
    catch { this.items = []; }
  },
  save() { try { localStorage.setItem(this.key(), JSON.stringify(this.items)); } catch {} },
  add() {
    const snap = snapshot();
    const name = `Lesezeichen ${this.items.length + 1}`;
    this.items.push({ name, snap, createdAt: Date.now() });
    if (this.items.length > 12) this.items.shift();
    this.save(); this.render();
    announceLive(`${name} gespeichert`);
  },
  restore(i) {
    const b = this.items[i]; if (!b) return;
    easeCamera({ ...b.snap }, 500, 'ease-out-cubic');
    announceLive(`Wiederhergestellt: ${b.name}`);
  },
  rename(i, name) {
    if (this.items[i]) { this.items[i].name = name; this.save(); this.render(); }
  },
  remove(i) {
    this.items.splice(i, 1); this.save(); this.render();
  },
  render() {
    const list = document.getElementById('bc-bookmarks-list');
    if (!list) return;
    // Clear safely — no innerHTML
    while (list.firstChild) list.removeChild(list.firstChild);
    this.items.forEach((b, i) => {
      const row = document.createElement('button');
      row.className = 'bc-row';
      row.dataset.bkIndex = String(i);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bc-bk-name';
      // textContent ESCAPES any HTML — safe for arbitrary user input
      nameSpan.textContent = '★ ' + b.name;
      row.appendChild(nameSpan);

      const kbd = document.createElement('kbd');
      kbd.textContent = '⇧' + (i + 1);
      row.appendChild(kbd);

      list.appendChild(row);
    });
  },
};

document.addEventListener('click', e => {
  const row = e.target.closest('[data-bk-index]');
  if (row) Bookmarks.restore(parseInt(row.dataset.bkIndex, 10));
});
document.addEventListener('dblclick', e => {
  const row = e.target.closest('[data-bk-index]');
  if (!row) return;
  const i = parseInt(row.dataset.bkIndex, 10);
  const name = prompt('Neuer Name', Bookmarks.items[i]?.name || '');
  if (name && name.trim()) Bookmarks.rename(i, name.trim());
});

window.Bookmarks = Bookmarks;
Bookmarks.load(); Bookmarks.render();
```

- [ ] **Step 2: Dock Lesezeichen section (static markup; list is populated by render() via DOM methods)**

In the dock, replace the `data-tab-content="marks"` placeholder with:

```html
<div data-tab-content="marks">
  <section class="bc-section">
    <h4>Lesezeichen</h4>
    <button class="bc-row" id="bc-bk-add"><span>+ Aktuelle Ansicht</span><kbd>B</kbd></button>
    <div id="bc-bookmarks-list"></div>
  </section>
</div>
```

JS:

```javascript
document.getElementById('bc-bk-add').addEventListener('click', () => Bookmarks.add());
```

- [ ] **Step 3: Keyboard shortcuts**

In keydown:

```javascript
  if ((e.key === 'b' || e.key === 'B') && !e.shiftKey) {
    Bookmarks.add(); e.preventDefault(); return;
  }
  if (e.shiftKey && e.key >= '1' && e.key <= '9') {
    Bookmarks.restore(parseInt(e.key, 10) - 1);
    e.preventDefault(); return;
  }
```

- [ ] **Step 4: XSS safety smoke**

Open browser console:

```javascript
Bookmarks.items.push({ name: '<img src=x onerror=alert(1)>', snap: window.snapshot ? snapshot() : {} });
Bookmarks.render();
```

Expected: bookmark renders as literal text `★ <img src=x onerror=alert(1)>` — **no alert fires**, no broken HTML.

- [ ] **Step 5: Smoke test**

Orbit to some view. Press `B`. Dock shows "Lesezeichen 1". Orbit elsewhere. Press `⇧1` → animates back. Double-click bookmark row → rename. Reload page (same `?room=`) → bookmark persists.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): bookmarks with localStorage + ⇧1-9 shortcuts"
```

---

## Task 14 — Recording (Screenshot + Video)

**Goal:** `C` → screenshot to PNG. `⇧R` → start/stop video recording via MediaRecorder. Indicator (red dot + timer) shows during recording.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Markup — indicator + dock buttons (all static, no user input)**

Inside `#canvas-container`:

```html
<div id="bc-rec-indicator" hidden>
  <span class="bc-rec-dot"></span>
  <span id="bc-rec-time">0:00</span>
</div>
```

Replace the `data-tab-content="aufnahme"` placeholder:

```html
<div data-tab-content="aufnahme">
  <section class="bc-section">
    <h4>Aufnehmen</h4>
    <button class="bc-row" id="bc-screenshot"><span>📷 Screenshot</span><kbd>C</kbd></button>
    <button class="bc-row" id="bc-video"><span>🎬 Aufnahme</span><kbd>⇧R</kbd></button>
  </section>
</div>
```

CSS:

```css
  #bc-rec-indicator {
    position: absolute; top: 12px; right: 80px;
    background: rgba(7,16,31,0.7); border: 1px solid var(--bc-danger);
    padding: 4px 10px; border-radius: 4px;
    font-family: monospace; font-size: 11px;
    color: var(--bc-text);
    display: flex; align-items: center; gap: 8px;
    z-index: 100;
  }
  .bc-rec-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--bc-danger);
    animation: bc-rec-pulse 1.2s infinite ease-in-out;
  }
  @keyframes bc-rec-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
```

- [ ] **Step 2: Recorder JS**

```javascript
// ── Recording ────────────────────────────────────────────
const Recorder = {
  rec: null, chunks: [], startedAt: 0, timer: null,

  screenshot() {
    const cnv2 = document.getElementById('three-canvas');
    cnv2.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `brett-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
    announceLive('Screenshot gespeichert');
  },

  toggleVideo() {
    if (this.rec) return this._stop();
    return this._start();
  },

  _start() {
    const cnv2 = document.getElementById('three-canvas');
    const stream = cnv2.captureStream(30);
    let mime = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `brett-${Date.now()}.webm`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.rec = null;
      document.getElementById('bc-rec-indicator').hidden = true;
      document.getElementById('bc-video').classList.remove('active');
      clearInterval(this.timer);
      announceLive('Aufnahme gespeichert');
    };
    this.rec.start(1000);
    this.startedAt = Date.now();
    document.getElementById('bc-rec-indicator').hidden = false;
    document.getElementById('bc-video').classList.add('active');
    this.timer = setInterval(() => {
      const secs = Math.floor((Date.now() - this.startedAt) / 1000);
      document.getElementById('bc-rec-time').textContent = `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
    }, 500);
    announceLive('Aufnahme gestartet');
  },

  _stop() {
    if (!this.rec) return;
    this.rec.stop();
  },
};
window.Recorder = Recorder;

document.getElementById('bc-screenshot').addEventListener('click', () => Recorder.screenshot());
document.getElementById('bc-video').addEventListener('click', () => Recorder.toggleVideo());
```

- [ ] **Step 3: Keyboard `C` and `⇧R`**

In keydown:

```javascript
  if ((e.key === 'c' || e.key === 'C') && !e.shiftKey) {
    Recorder.screenshot(); e.preventDefault(); return;
  }
  if ((e.key === 'r' || e.key === 'R') && e.shiftKey) {
    Recorder.toggleVideo(); e.preventDefault(); return;
  }
```

- [ ] **Step 4: Smoke test**

Press `C` → PNG downloads. Press `⇧R` → red indicator + timer; record movement. Press `⇧R` again → webm downloads. Open the webm in a video player — playable.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): screenshot (C) + video recording (⇧R) with MediaRecorder"
```

---

## Task 15 — Help Overlay + A11y Polish

**Goal:** `?` opens a modal with the full keyboard cheatsheet. Add `prefers-contrast: more` and verify `prefers-reduced-motion`. Verify ARIA labels on all interactive elements.

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Help overlay markup (static) + CSS**

```html
<div id="bc-help-overlay" role="dialog" aria-modal="true" aria-labelledby="bc-help-title" hidden>
  <div class="bc-help-card">
    <h3 id="bc-help-title">Tastatur-Cheatsheet</h3>
    <div class="bc-help-grid">
      <section>
        <h5>Werkzeuge</h5>
        <p><kbd>V</kbd> Auswählen · <kbd>O</kbd> Orbit · <kbd>P</kbd> Pan · <kbd>R</kbd> Drehen · <kbd>F</kbd> Fokus · <kbd>E</kbd> POV</p>
        <p><kbd>Space</kbd>-hold = Temp-Pan</p>
      </section>
      <section>
        <h5>Ansichten</h5>
        <p><kbd>1</kbd>–<kbd>6</kbd> Presets · <kbd>H</kbd>/<kbd>0</kbd> Home · <kbd>+</kbd>/<kbd>−</kbd> Zoom</p>
      </section>
      <section>
        <h5>Modi</h5>
        <p><kbd>A</kbd> Auto · <kbd>⇧F</kbd> Free-Fly · <kbd>⇧S</kbd> Split · <kbd>Esc</kbd> verlassen</p>
        <p>Free-Fly: <kbd>WASD</kbd> · <kbd>Space</kbd>/<kbd>Q</kbd> · <kbd>⇧</kbd>=Sprint</p>
      </section>
      <section>
        <h5>Bookmarks</h5>
        <p><kbd>B</kbd> speichern · <kbd>⇧1</kbd>–<kbd>⇧9</kbd> wiederherstellen</p>
      </section>
      <section>
        <h5>Aufnahme</h5>
        <p><kbd>C</kbd> Screenshot · <kbd>⇧R</kbd> Video</p>
      </section>
      <section>
        <h5>Bars</h5>
        <p><kbd>\</kbd> alle · <kbd>[</kbd> Rail · <kbd>]</kbd> Dock · <kbd>⇧\</kbd> Top</p>
      </section>
    </div>
    <button id="bc-help-close" class="bc-row" style="margin-top:14px;">Schließen (Esc)</button>
  </div>
</div>
```

CSS:

```css
  #bc-help-overlay {
    position: fixed; inset: 0; background: rgba(7,16,31,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 2000; padding: 20px;
  }
  .bc-help-card {
    background: var(--bc-panel); border: 1px solid var(--bc-brass); border-radius: 12px;
    max-width: 720px; width: 100%; max-height: 80vh; overflow: auto;
    padding: 24px; color: var(--bc-text);
  }
  .bc-help-card h3 { color: var(--bc-brass); margin: 0 0 16px; font-family: 'Newsreader', Georgia, serif; }
  .bc-help-card h5 { color: var(--bc-brass); margin: 0 0 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-family: monospace; }
  .bc-help-card kbd { color: var(--bc-brass); border: 1px solid rgba(200,169,110,0.4); padding: 1px 6px; border-radius: 3px; font-size: 11px; font-family: monospace; }
  .bc-help-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
  @media (max-width: 639px) { .bc-help-grid { grid-template-columns: 1fr; } }
  .bc-help-card p { color: var(--bc-muted); font-size: 13px; line-height: 1.6; margin: 0; }

  @media (prefers-contrast: more) {
    .bc-row, .bc-tool, .bc-chevron { border-width: 2px; }
    .bc-row.active { text-decoration: underline; }
  }
```

JS:

```javascript
// ── Help overlay ────────────────────────────────────────
function openHelp() {
  const overlay = document.getElementById('bc-help-overlay');
  overlay.hidden = false;
  document.getElementById('bc-help-close').focus();
}
function closeHelp() { document.getElementById('bc-help-overlay').hidden = true; }
document.getElementById('bc-help-close').addEventListener('click', closeHelp);
document.getElementById('bc-help-overlay').addEventListener('click', e => {
  if (e.target.id === 'bc-help-overlay') closeHelp();
});
document.getElementById('bc-help').addEventListener('click', openHelp);
```

- [ ] **Step 2: Add `?` shortcut + extend Esc handling**

In keydown, before the typing-target guard (since we want Esc to work in any state):

```javascript
  if (e.key === 'Escape') {
    if (!document.getElementById('bc-help-overlay').hidden) { closeHelp(); e.preventDefault(); return; }
    if (camera.mode === 'pov') { exitPOV(); e.preventDefault(); return; }
    if (camera.mode === 'freefly') { exitFreeFly(); e.preventDefault(); return; }
    closeContextMenu();
    return;
  }
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    if (isTypingTarget(document.activeElement)) return;
    openHelp(); e.preventDefault(); return;
  }
```

- [ ] **Step 3: Polish ARIA labels on existing buttons**

Verify every `.bc-tool`, `.bc-row`, `.bc-chevron` has either `aria-label` or visible text. Spot-check:

```bash
grep -n "class=\"bc-\(tool\|row\|chevron\)\"" brett/public/index.html | head -40
```

Where missing, add `aria-label="..."` (German labels).

- [ ] **Step 4: prefers-reduced-motion smoke**

Chrome DevTools → Rendering → Emulate CSS prefers-reduced-motion = reduce. Reload. Press `1` → camera **snaps** to top (no animation). Press `A` → auto-orbit does NOT start (button toggles state visually but tick checks the media query).

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): help overlay (?) + A11y polish (prefers-contrast, ARIA)"
```

---

## Task 16 — E2E Test Pass

**Goal:** Round out the Playwright spec with tests for all major features. Run locally + add to CI hook (e2e workflow already runs nightly per CLAUDE.md).

**Files:**
- Modify: `tests/e2e/specs/brett-controls.spec.ts`

- [ ] **Step 1: Add comprehensive tests**

Append to the spec:

```typescript
test.describe('Brett Controls — full coverage', () => {

  test('compass click returns home', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-compass-${Date.now()}`);
    await page.waitForFunction(() => typeof window.goHome === 'function');
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    await page.click('#bc-compass');
    await page.waitForTimeout(600);
    const phi = await page.evaluate(() => window.camera.phi);
    expect(phi).toBeCloseTo(0.95, 1);
  });

  test('bookmark save + restore', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-bk-${Date.now()}`);
    await page.waitForFunction(() => typeof window.Bookmarks === 'object');
    await page.keyboard.press('3');
    await page.waitForTimeout(500);
    await page.keyboard.press('b');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.Bookmarks.items.length)).toBe(1);
    await page.keyboard.press('5');
    await page.waitForTimeout(500);
    await page.keyboard.press('Shift+1');
    await page.waitForTimeout(600);
    const theta = await page.evaluate(() => window.camera.theta);
    expect(theta).toBeCloseTo(-Math.PI/2, 1);
  });

  test('bookmark name with HTML is escaped (XSS safety)', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-bkxss-${Date.now()}`);
    await page.waitForFunction(() => typeof window.Bookmarks === 'object');
    await page.evaluate(() => {
      window.Bookmarks.items.push({ name: '<img src=x onerror=window.__xss=1>', snap: window.snapshot ? snapshot() : {} });
      window.Bookmarks.render();
    });
    await page.waitForTimeout(200);
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();
    const html = await page.locator('.bc-bk-name').first().innerHTML();
    expect(html).not.toContain('<img');
  });

  test('split-view toggle changes render', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-split-${Date.now()}`);
    await page.waitForFunction(() => typeof window.camera === 'object');
    await page.keyboard.press('Shift+S');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('bc-mode-split').classList.contains('active'))).toBe(true);
    await page.keyboard.press('Shift+S');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('bc-mode-split').classList.contains('active'))).toBe(false);
  });

  test('help overlay opens on ?', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-help-${Date.now()}`);
    await page.waitForFunction(() => document.getElementById('bc-help-overlay') !== null);
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => !document.getElementById('bc-help-overlay').hidden)).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('bc-help-overlay').hidden)).toBe(true);
  });
});
```

- [ ] **Step 2: Run locally**

```bash
cd brett && DATABASE_URL=postgres://nobody:nopass@127.0.0.1:1/none node server.js &
SERVER_PID=$!
sleep 2
cd .. && BRETT_URL=http://localhost:3000 npx playwright test tests/e2e/specs/brett-controls.spec.ts --reporter=line
kill $SERVER_PID
```

Expected: all green. If any test fails, fix the underlying behavior (not the test).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/brett-controls.spec.ts
git commit -m "test(brett): e2e coverage for new controls"
```

---

## Task 17 — Local Verify + Production Deploy

**Goal:** Run the manifest validators, ensure no CI red, then deploy via `task feature:brett` to both production clusters.

**Files:** none (operational)

- [ ] **Step 1: Run offline tests**

```bash
task test:all
```

Expected: PASS (BATS unit + manifest validators + dry-runs). If failures, fix before deploying.

- [ ] **Step 2: Open a PR**

```bash
git push -u origin feature/brett-controls-redesign-2026-05-14
gh pr create --title "feat(brett): controls redesign — perspective changes, touch parity, collapsible bars" --body "$(cat <<'EOF'
## Summary
- Replaces the overloaded brett toolbar with a Figma-style 3-bar layout (Top-Toolbar figure-only · Tool-Rail left V/O/P/R/F/E · Side-Dock right with all view/cinematic controls visible).
- Camera becomes a state machine with four modes (Orbit / POV / Auto-Orbit / Free-Fly) plus orthogonal Split-View, all transitioning through one `easeCamera()` pipeline.
- Adds six view presets, three independently collapsible toolbars (persisted per-board in localStorage), full touch parity for Android (1F-drag tool · 2F-drag pan · pinch zoom · long-press menu · 3F-tap home · double-tap-fly), Bookmarks, MediaRecorder-based screenshot+video, and a `?` keyboard cheatsheet.

Spec: `docs/superpowers/specs/2026-05-14-brett-controls-redesign-design.md`
Plan: `docs/superpowers/plans/2026-05-14-brett-controls-redesign.md`

## Test plan
- [x] Local smoke (Chrome desktop + Pixel 7 emulation): drag, orbit, pinch, long-press
- [x] Playwright E2E: `tests/e2e/specs/brett-controls.spec.ts`
- [x] `task test:all` green
- [ ] After merge: visual check at https://brett.mentolder.de and https://brett.korczewski.de

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for green CI, then squash-merge per CLAUDE.md.

- [ ] **Step 3: Post-merge deploy to both prod clusters**

```bash
task feature:brett
```

This rebuilds the brett image and rolls the deployment on mentolder + korczewski.

- [ ] **Step 4: Live verification**

```bash
curl -s -o /dev/null -w "mentolder %{http_code}\n" https://brett.mentolder.de/
curl -s -o /dev/null -w "korczewski %{http_code}\n" https://brett.korczewski.de/
```

Expected: both `200`. Open both URLs in browser, smoke-test: drag figure (V tool default), press 1 → top-down, press 5 → iso, press ⇧R → record short clip → ⇧R stop → webm downloads.

- [ ] **Step 5: Tracking update**

The PR auto-emits a `tracking/pending/<pr>.json` entry via `.github/workflows/track-pr.yml`; the `tracking-import` CronJob drains it into `bachelorprojekt.features` within 5 min. Confirm visibility on `web.korczewski.de` timeline section.

---

## Self-Review Notes (already applied)

- **Spec coverage:** Tasks 1–14 implement spec sections 4 (UI Anatomy), 5 (Camera State), 6 (Animation), 7 (Modes), 8 (Input), 9 (Responsive), 10 (A11y). Task 15 covers section 11 (Implementation Notes — help overlay + ARIA). Tasks 16–17 cover testing + deploy.
- **Type consistency:** `camera` object schema in Task 2 matches use in Tasks 3, 9, 10, 11, 12, 13. `setActiveTool`, `goToPreset`, `enterPOV`, `enterFreeFly`, `Bars`, `Bookmarks`, `Recorder` are all `window`-exposed for tests.
- **No placeholders:** Every step contains actual code/commands. Out-of-scope items from the spec (Undo/Redo, POV-Sync, WebXR, Bookmark thumbnails, multi-split) are explicitly excluded.
- **XSS safety:** All user-controlled strings (bookmark names, figure labels) go through `textContent` / `document.createElement` / `createTextNode`. No `innerHTML` template literal in any task touches user input. An explicit XSS-safety test is included in Task 16.
- **Frequent commits:** 17 commits, one per task. Each commit is a self-contained step that keeps the app functional. Squash-merge collapses them on `main`.
