---
ticket_id: T000377
title: Brett UX Overhaul Implementation Plan
domains: []
status: active
pr_number: null
---

# Brett UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hollow SVG character heads, replace scattered toolbar controls with a foldable character-editor panel, remove ctrlBall, add WASD+sprint and double-click-teleport movement.

**Architecture:** All changes live in two locations — `brett/public/art-library/*.svg` (head fill fix) and `brett/public/index.html` (UI + JS). The monolithic `index.html` is modified in place; no new files are created. JS changes are additive (new functions + extended handlers) except for ctrlBall deletion.

**Tech Stack:** Vanilla JS, Three.js (already loaded), CSS in `<style>` block, SVG assets, Playwright for E2E tests.

---

## Files

| File | Change |
|------|--------|
| `brett/public/art-library/mann.svg` | head circle: `fill="none"` → `fill="#C8F76A"` |
| `brett/public/art-library/frau.svg` | same |
| `brett/public/art-library/person.svg` | same |
| `brett/public/art-library/nonbinary.svg` | same (head circle only — largest r) |
| `brett/public/art-library/senior.svg` | same |
| `brett/public/art-library/baby.svg` | same |
| `brett/public/art-library/fuehrungskraft.svg` | same |
| `brett/public/art-library/mitarbeiter.svg` | same |
| `brett/public/art-library/kunde.svg` | same |
| `brett/public/art-library/berater.svg` | same |
| `brett/public/art-library/kind.svg` | head circle: `fill="none"` → `fill="#5BD4D0"` |
| `brett/public/index.html` | all JS + HTML + CSS changes |
| `tests/e2e/specs/brett-controls.spec.ts` | new test suites for WASD + panel + teleport |

---

## Task 1: Fix SVG head circles (11 files)

**Files:** `brett/public/art-library/*.svg` (11 files listed above)

- [ ] **Step 1: Understand what to change**

  Each affected SVG has exactly one head circle near the top of the viewBox (the character's head). It currently reads `fill="none"` which makes it transparent. We change it to match its `stroke` attribute so the head is opaque.

  Reference table:
  | SVG | head element selector | fill to set |
  |-----|----------------------|-------------|
  | mann.svg | `<circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | frau.svg | `<circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | person.svg | `<circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | nonbinary.svg | first circle `r="42"` only — ignore the second `r="18"` circle | `#C8F76A` |
  | senior.svg | `<circle cx="126" cy="70" r="40" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | baby.svg | `<circle cx="120" cy="136" r="58" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | fuehrungskraft.svg | `<circle cx="120" cy="84" r="40" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | mitarbeiter.svg | `<circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | kunde.svg | `<circle cx="120" cy="68" r="42" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | berater.svg | `<circle cx="108" cy="68" r="40" fill="none" stroke="#C8F76A" .../>` | `#C8F76A` |
  | kind.svg | `<circle cx="120" cy="148" r="30" fill="none" stroke="#5BD4D0" .../>` | `#5BD4D0` |

- [ ] **Step 2: Apply the change with sed**

  ```bash
  cd brett/public/art-library

  # All C8F76A stroke files — change fill="none" to fill="#C8F76A" on the FIRST circle only
  for f in mann.svg frau.svg person.svg senior.svg baby.svg fuehrungskraft.svg mitarbeiter.svg kunde.svg berater.svg; do
    # Use perl for reliable first-match-only substitution
    perl -i '0,/fill="none"/ s/fill="none"/fill="#C8F76A"/' "$f"
  done

  # nonbinary.svg: same — change only the FIRST fill="none" (the head, r=42)
  perl -i '0,/fill="none"/ s/fill="none"/fill="#C8F76A"/' nonbinary.svg

  # kind.svg: stroke is #5BD4D0
  perl -i '0,/fill="none"/ s/fill="none"/fill="#5BD4D0"/' kind.svg
  ```

- [ ] **Step 3: Verify the changes**

  ```bash
  # Check each file has fill= the right color on its first circle
  for f in mann.svg frau.svg person.svg nonbinary.svg senior.svg baby.svg \
            fuehrungskraft.svg mitarbeiter.svg kunde.svg berater.svg; do
    echo -n "$f: "
    grep -m1 '<circle' "$f" | grep -o 'fill="[^"]*"'
  done
  # Expected: fill="#C8F76A" for all

  echo -n "kind.svg: "
  grep -m1 '<circle' kind.svg | grep -o 'fill="[^"]*"'
  # Expected: fill="#5BD4D0"

  # nonbinary.svg: second circle must STILL have fill="none"
  echo "nonbinary second circle:"
  grep '<circle' nonbinary.svg | tail -1 | grep -o 'fill="[^"]*"'
  # Expected: fill="none"
  ```

- [ ] **Step 4: Commit**

  ```bash
  cd /home/patrick/Bachelorprojekt
  git add brett/public/art-library/
  git commit -m "fix(brett): fill character head circles to fix hollow-head bug"
  ```

---

## Task 2: Remove ctrlBall

**Files:** `brett/public/index.html`

The ctrlBall is a golden sphere that appears when you click empty board. It served no complete feature and is the "click to move" interaction the user wants removed.

- [ ] **Step 1: Delete ctrlBall variable declarations and functions (lines ~1704–1743)**

  Find and delete the block:
  ```js
  let ctrlBall = null, ctrlBallActive = false, ctrlBallDrag = false;
  let ctrlBallStart = { x: 0, y: 0 };
  let ctrlBallShowTime = 0;

  function showCtrlBall(wx, wz) { ... }   // entire function

  function hideCtrlBall() { ... }          // entire function

  function pickBall(ndc) { ... }           // entire function
  ```

  These are lines 1704–1743 in the current file. Delete all of them.

- [ ] **Step 2: Remove ctrlBall references in the V tool mousedown handler (lines ~2443–2460)**

  Current code in the `case 'V':` block:
  ```js
  case 'V':
    if (fig) {
      const now = Date.now();
      if (lastClick.fig === fig && now - lastClick.time < 380) { openLabelModal(fig); lastClick.fig = null; return; }
      lastClick = { fig, time: now };
      selectFigure(fig);
      drag = { on: true, fig };
      if (ctrlBallActive) hideCtrlBall();     // ← DELETE this line
    } else {
      selectFigure(null);
      lastClick.fig = null;
      const bpos = pickBoard(ndc);
      if (bpos) {
        if (ctrlBallActive) hideCtrlBall();   // ← DELETE these two lines
        else showCtrlBall(bpos.x, bpos.z);   // ← DELETE
      }
    }
    break;
  ```

  Replace the entire `case 'V':` block with:
  ```js
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
  ```

- [ ] **Step 3: Remove ctrlBall fade from animate() (lines ~3377–3382)**

  Find and delete this block inside `animate()`:
  ```js
  if (ctrlBall && ctrlBallActive) {
    const tFade = Math.min(1, (Date.now() - ctrlBallShowTime) / 150);
    ctrlBall.children.forEach((c, i) => {
      if (c.material) c.material.opacity = tFade * (i === 0 ? 0.72 : 0.9);
    });
  }
  ```

- [ ] **Step 4: Verify no remaining ctrlBall references**

  ```bash
  grep -n "ctrlBall" brett/public/index.html
  # Expected: no output
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add brett/public/index.html
  git commit -m "fix(brett): remove ctrlBall click-to-move mechanism"
  ```

---

## Task 3: WASD + Shift-sprint movement

**Files:** `brett/public/index.html`, `tests/e2e/specs/brett-controls.spec.ts`

Figures move in real-time while WASD/arrow keys are held, with Shift for sprint (3× speed). Uses per-frame RAF tick — no keydown repeat delay.

- [ ] **Step 1: Add wasdHeld state and key listeners**

  Find the line `const flyKeys = { ... };` (around line 2933). Add this block BEFORE it:

  ```js
  // ── WASD figure movement ──────────────────────────────────────────────────────
  const wasdHeld = { w: false, a: false, s: false, d: false,
                     ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
                     Shift: false };
  const WASD_KEYS = new Set(['w','a','s','d','W','A','S','D',
                              'ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);

  document.addEventListener('keydown', e => {
    if (isAnyModalOpen() || isTypingTarget(document.activeElement)) return;
    if (!WASD_KEYS.has(e.key) && e.key !== 'Shift') return;
    if (e.key === 'Shift') { wasdHeld.Shift = true; return; }
    const k = e.key.toLowerCase().replace('arrow', 'Arrow');
    const norm = e.key.startsWith('Arrow') ? e.key : e.key.toLowerCase();
    if (norm === 'w' || e.key === 'ArrowUp')    { wasdHeld.w = true; e.preventDefault(); return; }
    if (norm === 's' || e.key === 'ArrowDown')  { wasdHeld.s = true; e.preventDefault(); return; }
    if (norm === 'a' || e.key === 'ArrowLeft')  { wasdHeld.a = true; e.preventDefault(); return; }
    if (norm === 'd' || e.key === 'ArrowRight') { wasdHeld.d = true; e.preventDefault(); return; }
  }, true); // capture phase — runs before other keydown handlers, allows preventDefault

  document.addEventListener('keyup', e => {
    if (e.key === 'Shift') { wasdHeld.Shift = false; return; }
    const norm = e.key.startsWith('Arrow') ? e.key : e.key.toLowerCase();
    if (norm === 'w' || e.key === 'ArrowUp')    wasdHeld.w = false;
    if (norm === 's' || e.key === 'ArrowDown')  wasdHeld.s = false;
    if (norm === 'a' || e.key === 'ArrowLeft')  wasdHeld.a = false;
    if (norm === 'd' || e.key === 'ArrowRight') wasdHeld.d = false;
    // Send final position on key release
    if (WASD_KEYS.has(e.key) && selectedFigure && !applyingRemote) {
      send({ type: 'move', id: selectedFigure.id,
             x: selectedFigure.mesh.position.x, z: selectedFigure.mesh.position.z });
    }
  });

  function tickWASD(dt) {
    if (!selectedFigure || isAnyModalOpen()) return;
    let dx = 0, dz = 0;
    if (wasdHeld.w) dz -= 1;
    if (wasdHeld.s) dz += 1;
    if (wasdHeld.a) dx -= 1;
    if (wasdHeld.d) dx += 1;
    if (dx === 0 && dz === 0) return;
    const len = Math.sqrt(dx * dx + dz * dz);
    const speed = (wasdHeld.Shift ? 12 : 4) * dt;
    dx = dx / len * speed;
    dz = dz / len * speed;
    const HW = BW / 2 - 1, HD = BD / 2 - 1;
    selectedFigure.mesh.position.x = Math.max(-HW, Math.min(HW, selectedFigure.mesh.position.x + dx));
    selectedFigure.mesh.position.z = Math.max(-HD, Math.min(HD, selectedFigure.mesh.position.z + dz));
    if (!applyingRemote) sendMoveThrottled(selectedFigure);
  }
  window.wasdHeld = wasdHeld; // expose for tests
  ```

  > **Note on `{ capture: true }`:** The WASD keydown listener uses capture phase so it intercepts the event before the main keydown handler (registered without capture). `e.preventDefault()` on W/A/S/D when a figure is selected prevents the 'A' key from triggering auto-orbit toggle.

- [ ] **Step 2: Call tickWASD in the animate loop**

  Inside `function animate()`, find the line:
  ```js
  const dt = tickAutoOrbit();
  ```

  Add `tickWASD(dt);` immediately after:
  ```js
  const dt = tickAutoOrbit();
  tickWASD(dt);
  tickFreeFly(dt);
  tickOrbitKeys(dt);
  ```

- [ ] **Step 3: Update the V-tool hint text**

  Find:
  ```js
  V: 'Tap = auswählen · Drag = Figur ziehen · Doppel-Tap = Beschriftung',
  ```

  Replace with:
  ```js
  V: 'Tap = auswählen · Drag = ziehen · WASD/↑↓←→ = bewegen · Shift = Sprint · Doppelklick = Teleport',
  ```

- [ ] **Step 4: Write Playwright test**

  Add this test suite to `tests/e2e/specs/brett-controls.spec.ts`:

  ```typescript
  test.describe('Brett Controls — WASD movement', () => {
    test('W key moves selected figure in -Z direction', async ({ page }) => {
      await page.goto(`${BRETT_URL}?room=e2e-wasd-${Date.now()}`);
      await page.waitForFunction(() => typeof (window as W).addFigure === 'function', { timeout: 5000 });

      // Add a pawn figure at centre, select it
      const figId = await page.evaluate(() => {
        const fig = (window as W).addFigure('pawn', '#e06b6b', 0, 0, '', 1.0, 0);
        (window as W).selectFigure(fig);
        return fig.id;
      });

      const zBefore = await page.evaluate((id) =>
        (window as W).figures.find((f: W) => f.id === id).mesh.position.z, figId);

      // Hold W for 300ms
      await page.keyboard.down('w');
      await page.waitForTimeout(300);
      await page.keyboard.up('w');

      const zAfter = await page.evaluate((id) =>
        (window as W).figures.find((f: W) => f.id === id).mesh.position.z, figId);

      expect(zAfter).toBeLessThan(zBefore); // W = -Z
    });

    test('Shift+W moves figure faster than W alone', async ({ page }) => {
      await page.goto(`${BRETT_URL}?room=e2e-sprint-${Date.now()}`);
      await page.waitForFunction(() => typeof (window as W).addFigure === 'function', { timeout: 5000 });

      // Normal speed: hold W 200ms, measure dZ
      const dNormal = await page.evaluate(async () => {
        const fig = (window as W).addFigure('pawn', '#e06b6b', 0, 5, '', 1.0, 0);
        (window as W).selectFigure(fig);
        return fig.mesh.position.z;
      });

      await page.keyboard.down('w');
      await page.waitForTimeout(200);
      await page.keyboard.up('w');
      const zNormal = await page.evaluate((id) =>
        (window as W).figures.find((f: W) => f.id === id).mesh.position.z, await page.evaluate(() => (window as W).figures.at(-1).id));

      // Sprint speed
      await page.evaluate(() => {
        const fig = (window as W).addFigure('pawn', '#6ba8e0', 0, 5, '', 1.0, 0);
        (window as W).selectFigure(fig);
      });
      await page.keyboard.down('Shift');
      await page.keyboard.down('w');
      await page.waitForTimeout(200);
      await page.keyboard.up('w');
      await page.keyboard.up('Shift');
      const zSprint = await page.evaluate(() => (window as W).figures.at(-1).mesh.position.z);

      expect(Math.abs(zSprint - 5)).toBeGreaterThan(Math.abs(zNormal - 5));
    });
  });
  ```

- [ ] **Step 5: Run tests (skip if no local cluster)**

  ```bash
  # If brett.localhost is running:
  cd tests && npx playwright test brett-controls --grep "WASD" 2>&1 | tail -20
  # Otherwise, skip — CI will catch regressions
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
  git commit -m "feat(brett): add WASD/arrow-key movement with Shift-sprint"
  ```

---

## Task 4: Double-click teleport

**Files:** `brett/public/index.html`, `tests/e2e/specs/brett-controls.spec.ts`

Double-clicking on an empty board position teleports the previously-selected figure there with a 300 ms ease-out-cubic animation.

- [ ] **Step 1: Add easeFigure function and lastBoardClick state**

  Find the line `let currentColor = '#e06b6b';` (around line 1746). Add before it:

  ```js
  let lastBoardClick = { time: 0, fig: null };

  function easeFigure(fig, tx, tz, durationMs) {
    const sx = fig.mesh.position.x, sz = fig.mesh.position.z;
    const start = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      fig.mesh.position.x = sx + (tx - sx) * e;
      fig.mesh.position.z = sz + (tz - sz) * e;
      if (t < 1) { requestAnimationFrame(step); }
      else {
        fig.mesh.position.x = tx;
        fig.mesh.position.z = tz;
        if (!applyingRemote) send({ type: 'move', id: fig.id, x: tx, z: tz });
      }
    }
    requestAnimationFrame(step);
  }
  window.easeFigure = easeFigure; // expose for tests
  ```

- [ ] **Step 2: Update the V tool mousedown else-branch**

  After Task 2 the else-branch of `case 'V':` reads:
  ```js
  } else {
    selectFigure(null);
    lastClick.fig = null;
  }
  ```

  Replace it with:
  ```js
  } else {
    const bpos = pickBoard(ndc);
    const now = Date.now();
    if (bpos && lastBoardClick.fig && now - lastBoardClick.time < 380) {
      // Double-click on empty board: teleport the previously-selected figure
      easeFigure(lastBoardClick.fig, bpos.x, bpos.z, 300);
      selectFigure(lastBoardClick.fig);
      lastBoardClick = { time: 0, fig: null };
    } else {
      // Single click: remember which figure was selected, then deselect
      lastBoardClick = { time: now, fig: selectedFigure };
      selectFigure(null);
      lastClick.fig = null;
    }
  }
  ```

- [ ] **Step 3: Write Playwright test**

  Add to `tests/e2e/specs/brett-controls.spec.ts`:

  ```typescript
  test.describe('Brett Controls — double-click teleport', () => {
    test('double-click on board teleports selected figure', async ({ page }) => {
      await page.goto(`${BRETT_URL}?room=e2e-teleport-${Date.now()}`);
      await page.waitForFunction(() => typeof (window as W).easeFigure === 'function', { timeout: 5000 });

      // Place a figure at (-5, -5), select it
      const figId = await page.evaluate(() => {
        const fig = (window as W).addFigure('pawn', '#e06b6b', -5, -5, '', 1.0, 0);
        (window as W).selectFigure(fig);
        return fig.id;
      });

      // Simulate double-click: click empty board twice via JS (avoids canvas coordinate math)
      await page.evaluate(() => {
        const fig = (window as W).figures.find((f: W) => f.id !== undefined);
        // First click: deselect, record lastBoardClick
        (window as W).lastBoardClick = { time: Date.now(), fig };
        // Second click: teleport
        (window as W).easeFigure(fig, 3, 3, 300);
        (window as W).selectFigure(fig);
        (window as W).lastBoardClick = { time: 0, fig: null };
      });

      await page.waitForTimeout(400); // animation completes

      const pos = await page.evaluate((id) => {
        const f = (window as W).figures.find((f: W) => f.id === id);
        return { x: f.mesh.position.x, z: f.mesh.position.z };
      }, figId);

      expect(pos.x).toBeCloseTo(3, 0);
      expect(pos.z).toBeCloseTo(3, 0);
    });
  });
  ```

  Note: `lastBoardClick` must be exposed on `window` for this test. Add `window.lastBoardClick = lastBoardClick;` after the variable declaration in Step 1. But since it's an object, we expose it by reference and can mutate it from the test.

  Actually — `lastBoardClick` is a primitive-containing object that gets *replaced* (`lastBoardClick = { time:..., fig:... }`). The window reference won't stay in sync after replacement. Expose a getter instead:

  After `let lastBoardClick = ...;` add:
  ```js
  Object.defineProperty(window, 'lastBoardClick', {
    get: () => lastBoardClick,
    set: v => { lastBoardClick = v; },
  });
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
  git commit -m "feat(brett): add double-click-teleport figure movement"
  ```

---

## Task 5: Character-editor panel — HTML + CSS

**Files:** `brett/public/index.html`

Replace the scattered toolbar controls with a `＋ Figur ▾` toggle button and a floating dropdown panel.

- [ ] **Step 1: Add panel CSS**

  Inside the `<style>` block (before `</style>`), add:

  ```css
  /* ── Character-Editor Panel ─────────────────────────────────── */
  #fig-panel-wrap { position: relative; display: inline-flex; align-items: center; }

  #fig-panel-btn {
    background: rgba(200,169,110,0.12);
    border: 1px solid var(--bc-brass);
    color: var(--bc-brass);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  #fig-panel-btn:hover, #fig-panel-btn.open { background: rgba(200,169,110,0.24); }

  #fig-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 200;
    background: var(--bc-panel);
    border: 1px solid var(--bc-brass);
    border-radius: 10px;
    padding: 10px 12px;
    width: 280px;
    max-height: 70vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  #fig-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  #fig-panel-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--bc-brass);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  #fig-panel-close {
    background: none;
    border: none;
    color: var(--bc-dim);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
  }
  #fig-panel-close:hover { color: var(--bc-text); }

  .fig-panel-label {
    font-size: 10px;
    color: var(--bc-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  #fig-panel #category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  #fig-panel #figure-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  #fig-panel .color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.15s;
  }
  #fig-panel .color-swatch.active { border-color: var(--bc-brass); }

  #fig-panel-colors { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }

  #fig-panel #scale-section { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }

  #fig-panel-setzen {
    background: var(--bc-brass);
    color: #0a0a1a;
    border: none;
    border-radius: 7px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 4px;
    width: 100%;
  }
  #fig-panel-setzen:hover { filter: brightness(1.1); }
  #fig-panel-setzen:disabled { opacity: 0.4; cursor: default; }

  body.placing-figure { cursor: crosshair !important; }
  ```

- [ ] **Step 2: Replace toolbar controls with panel HTML**

  In `<div id="toolbar">`, remove these existing sections and replace with the panel wrapper. The toolbar currently contains (after the constellation-type select):
  - `<div class="sep"></div>`
  - `<div id="category-tabs"></div>`
  - `<div class="sep"></div>`
  - `<div id="figure-buttons" style="display:flex;gap:6px;"></div>`
  - `<div class="sep"></div>`
  - `<span class="tlabel">Farbe</span>`
  - colour swatches div
  - `<div class="sep"></div>`
  - `<span class="tlabel">Größe</span>`
  - `<div id="scale-section">` … `</div>`
  - `<div class="sep"></div>`
  - `<span class="tlabel">Drehen</span>`
  - `<div id="rot-section">` … `</div>`
  - `<div class="sep"></div>`

  Replace all of the above (from the first `<div class="sep"></div>` after `constellation-type` through the `rot-section` separator) with:

  ```html
  <div class="sep"></div>
  <div id="fig-panel-wrap">
    <button id="fig-panel-btn" aria-expanded="false" aria-controls="fig-panel">＋ Figur ▾</button>
    <div id="fig-panel" hidden role="dialog" aria-label="Figur-Editor">
      <div id="fig-panel-header">
        <span id="fig-panel-title">NEUE FIGUR</span>
        <button id="fig-panel-close" aria-label="Panel schließen">✕</button>
      </div>
      <span class="fig-panel-label">Kategorie</span>
      <div id="category-tabs"></div>
      <span class="fig-panel-label">Typ</span>
      <div id="figure-buttons"></div>
      <span class="fig-panel-label">Farbe</span>
      <div id="fig-panel-colors">
        <div class="color-swatch active" data-color="#e06b6b" style="background:#e06b6b;"></div>
        <div class="color-swatch" data-color="#6ba8e0" style="background:#6ba8e0;"></div>
        <div class="color-swatch" data-color="#6be0a0" style="background:#6be0a0;"></div>
        <div class="color-swatch" data-color="#e0c06b" style="background:#e0c06b;"></div>
        <div class="color-swatch" data-color="#c06be0" style="background:#c06be0;"></div>
        <div class="color-swatch" data-color="#e0906b" style="background:#e0906b;"></div>
        <div class="color-swatch" data-color="#e0e0e0" style="background:#e0e0e0;"></div>
      </div>
      <span class="fig-panel-label">Größe</span>
      <div id="scale-section">
        <button class="size-btn" data-scale="0.6">S</button>
        <button class="size-btn" data-scale="1.0">M</button>
        <button class="size-btn" data-scale="1.5">L</button>
        <input type="range" id="scale-slider" min="0.3" max="2.5" step="0.05" value="1.0">
        <span id="scale-val">1.0×</span>
      </div>
      <button id="fig-panel-setzen">＋ Auf Brett setzen</button>
    </div>
  </div>
  <div class="sep"></div>
  ```

  > The `id`s `category-tabs`, `figure-buttons`, `scale-slider`, `scale-val` are preserved — all existing JS that targets them by ID continues to work without changes.

- [ ] **Step 3: Verify HTML structure**

  Open the Brett URL in a browser. The toolbar should now show only:
  `[Aufstellung ▾] | [＋ Figur ▾] | [✕ Löschen] | [↓ Speichern] [↑ Laden] [Brett leeren] | [🗺 Übersicht] | [▾] | [🎨 Optik]`

  The figure buttons and colour swatches are no longer in the toolbar row (they're inside the hidden panel).

- [ ] **Step 4: Commit**

  ```bash
  git add brett/public/index.html
  git commit -m "feat(brett): add character-editor panel HTML + CSS"
  ```

---

## Task 6: Character-editor panel — JS wiring

**Files:** `brett/public/index.html`, `tests/e2e/specs/brett-controls.spec.ts`

Wire the panel toggle, dual-mode (new figure / edit selected), `retypeFigure`, and crosshair placement mode.

- [ ] **Step 1: Add retypeFigure function**

  Find `function recolorFigure(fig, color) {` (around line 1990). Add immediately before it:

  ```js
  function retypeFigure(fig, newType) {
    fig.type = newType;
    const newMesh = buildFigure(newType, fig.color);
    newMesh.position.copy(fig.mesh.position);
    newMesh.rotation.y = fig.rotY;
    newMesh.scale.setScalar(fig.scale);
    scene.remove(fig.mesh);
    scene.add(newMesh);
    fig.mesh = newMesh;
    if (fig.label) attachLabel(fig);
    if (selectedFigure === fig) { clearSelRing(); showSelRing(fig); }
    if (!applyingRemote) send({ type: 'update', id: fig.id, changes: { type: newType } });
  }
  ```

- [ ] **Step 2: Add type handling to the remote update handler**

  Find the `'update'` message branch (around line 1064):
  ```js
  if (msg.changes.color !== undefined) recolorFigure(f, msg.changes.color);
  ```

  Add after it:
  ```js
  if (msg.changes.type  !== undefined) retypeFigure(f, msg.changes.type);
  ```

- [ ] **Step 3: Add panel state variables**

  Find `let currentColor = '#e06b6b';`. Add after it:

  ```js
  let panelFigType = 'person'; // selected type in the panel (for new figures)
  let placingMode  = false;    // crosshair placement active
  window.placingMode_get = () => placingMode; // test hook
  ```

- [ ] **Step 4: Add updateFigPanel helper**

  Find `function selectFigure(fig) {` and add before it:

  ```js
  function updateFigPanel(fig) {
    const title   = document.getElementById('fig-panel-title');
    const setzen  = document.getElementById('fig-panel-setzen');
    if (!title) return;
    if (fig) {
      title.textContent = 'FIGUR BEARBEITEN';
      if (setzen) setzen.hidden = true;
    } else {
      title.textContent = 'NEUE FIGUR';
      if (setzen) setzen.hidden = false;
    }
  }
  ```

  At the END of `selectFigure(fig)` (before the closing `}`), add:
  ```js
  updateFigPanel(fig);
  ```

- [ ] **Step 5: Wire panel toggle and close**

  Find the section that starts `// ── Toolbar wiring ──` (around line 1969). Add a new section after the existing toolbar wiring:

  ```js
  // ── Figure-editor panel ───────────────────────────────────────────────────────
  const figPanelBtn   = document.getElementById('fig-panel-btn');
  const figPanel      = document.getElementById('fig-panel');
  const figPanelClose = document.getElementById('fig-panel-close');

  function openFigPanel()  {
    figPanel.hidden = false;
    figPanelBtn.classList.add('open');
    figPanelBtn.setAttribute('aria-expanded', 'true');
  }
  function closeFigPanel() {
    figPanel.hidden = true;
    figPanelBtn.classList.remove('open');
    figPanelBtn.setAttribute('aria-expanded', 'false');
  }

  figPanelBtn.addEventListener('click', () => {
    figPanel.hidden ? openFigPanel() : closeFigPanel();
  });
  figPanelClose.addEventListener('click', closeFigPanel);

  // Close on outside click
  document.addEventListener('click', e => {
    if (!figPanel.hidden && !figPanel.contains(e.target) && e.target !== figPanelBtn) {
      closeFigPanel();
    }
  });
  ```

- [ ] **Step 6: Wire colour swatches inside the panel**

  The original colour-swatch wiring used `document.querySelectorAll('.color-swatch')`. Since the swatches are now inside the panel, this still works. Verify the existing wiring still fires by checking for this block (around line 1981):

  ```js
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      currentColor = sw.dataset.color;
      if (selectedFigure) recolorFigure(selectedFigure, currentColor);
    });
  });
  ```

  This block is unchanged — it still works because `.color-swatch` elements are in the DOM (just inside the panel now).

- [ ] **Step 7: Wire figure-button clicks in the panel (dual-mode)**

  The figure buttons are rendered dynamically by `renderTabContent()` which calls `container.appendChild(btn)` with click handlers that call `addFigure(...)`. We need to change those click handlers so that in the panel context:
  - If no figure selected → update `panelFigType` and highlight the button (don't add a figure yet)
  - If figure selected → call `retypeFigure(selectedFigure, type)` immediately

  Find `renderTabContent` (around line 1591). Find the `btn.addEventListener('click', () => {` inside it (around line 1614):

  ```js
  btn.addEventListener('click', () => {
    const x = (Math.random()-0.5)*(BW-4);
    const z = (Math.random()-0.5)*(BD-4);
    const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
    send({ type: 'add', fig: figToJSON(fig) });
    selectFigure(fig);
    openLabelModal(fig);
  });
  ```

  Replace with:
  ```js
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    if (selectedFigure) {
      retypeFigure(selectedFigure, type);
    } else {
      panelFigType = type;
      document.querySelectorAll('#figure-buttons .figure-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.type === type));
    }
  });
  ```

  There is a second identical block in the legacy v1 path (around line 1668). Apply the same replacement there too.

- [ ] **Step 8: Wire Setzen button and crosshair placement mode**

  Find `document.getElementById('bc-collapse-top')?.addEventListener(...)` and add before it:

  ```js
  document.getElementById('fig-panel-setzen').addEventListener('click', () => {
    closeFigPanel();
    placingMode = true;
    document.body.classList.add('placing-figure');
    const hint = document.getElementById('bc-hint');
    if (hint) { hint.textContent = 'Klick auf das Brett zum Platzieren — Esc zum Abbrechen'; hint.classList.remove('bc-fade'); }
  });
  ```

  In the main `keydown` handler (around line 3267), inside the `if (e.key === 'Escape') {` block, add at the very top (before the help-overlay check):

  ```js
  if (placingMode) {
    placingMode = false;
    document.body.classList.remove('placing-figure');
    updateHint();
    e.preventDefault(); return;
  }
  ```

  In the canvas `mousedown` handler (around line 2404), add at the very top of the handler body (before `if (isAnyModalOpen()) return;`):

  ```js
  if (placingMode) {
    const bpos = pickBoard(getNDC(e));
    if (bpos) {
      const s = parseFloat(document.getElementById('scale-slider').value);
      const fig = addFigure(panelFigType, currentColor, bpos.x, bpos.z, '', s, 0);
      send({ type: 'add', fig: figToJSON(fig) });
      selectFigure(fig);
      openLabelModal(fig);
    }
    placingMode = false;
    document.body.classList.remove('placing-figure');
    updateHint();
    e.preventDefault();
    return;
  }
  ```

- [ ] **Step 9: Write Playwright test for the panel**

  Add to `tests/e2e/specs/brett-controls.spec.ts`:

  ```typescript
  test.describe('Brett Controls — character editor panel', () => {
    test('fig-panel-btn toggles the panel', async ({ page }) => {
      await page.goto(`${BRETT_URL}?room=e2e-panel-${Date.now()}`);
      await page.waitForFunction(() => !!document.getElementById('fig-panel-btn'), { timeout: 5000 });

      const panelHidden = await page.$eval('#fig-panel', (el: HTMLElement) => el.hidden);
      expect(panelHidden).toBe(true);

      await page.click('#fig-panel-btn');
      const panelVisible = await page.$eval('#fig-panel', (el: HTMLElement) => el.hidden);
      expect(panelVisible).toBe(false);

      await page.click('#fig-panel-close');
      const panelHidden2 = await page.$eval('#fig-panel', (el: HTMLElement) => el.hidden);
      expect(panelHidden2).toBe(true);
    });

    test('panel title changes to FIGUR BEARBEITEN when figure is selected', async ({ page }) => {
      await page.goto(`${BRETT_URL}?room=e2e-panel2-${Date.now()}`);
      await page.waitForFunction(() => typeof (window as W).addFigure === 'function', { timeout: 5000 });

      await page.evaluate(() => {
        const fig = (window as W).addFigure('pawn', '#e06b6b', 0, 0, '', 1.0, 0);
        (window as W).selectFigure(fig);
      });

      await page.click('#fig-panel-btn');
      const title = await page.$eval('#fig-panel-title', (el: HTMLElement) => el.textContent);
      expect(title).toBe('FIGUR BEARBEITEN');
    });

    test('Setzen button enters placing mode', async ({ page }) => {
      await page.goto(`${BRETT_URL}?room=e2e-panel3-${Date.now()}`);
      await page.waitForFunction(() => typeof (window as W).placingMode_get === 'function', { timeout: 5000 });

      await page.click('#fig-panel-btn');
      await page.click('#fig-panel-setzen');

      const placing = await page.evaluate(() => (window as W).placingMode_get());
      expect(placing).toBe(true);

      // Escape cancels
      await page.keyboard.press('Escape');
      const placing2 = await page.evaluate(() => (window as W).placingMode_get());
      expect(placing2).toBe(false);
    });
  });
  ```

- [ ] **Step 10: Commit**

  ```bash
  git add brett/public/index.html tests/e2e/specs/brett-controls.spec.ts
  git commit -m "feat(brett): wire character-editor panel JS — dual-mode, placement, retypeFigure"
  ```

---

## Task 7: Final verification and push

- [ ] **Step 1: Run offline tests**

  ```bash
  task test:all
  # Expected: all BATS + manifest tests pass
  ```

- [ ] **Step 2: Manual smoke check**

  Start Brett locally:
  ```bash
  task brett:build  # or: cd brett && node server.js
  ```
  Open `http://brett.localhost` (or `http://localhost:3000` depending on local setup) and verify:

  1. **Head fix:** Add a "Mann" or "Frau" figure — head circle is solid green, not transparent
  2. **Panel:** Click "＋ Figur ▾" — panel opens with category tabs, figure grid, colour swatches, size slider, "＋ Auf Brett setzen"
  3. **Panel close:** Click ✕, click outside panel, click button again — all close the panel
  4. **Placement mode:** Click "Auf Brett setzen" → cursor becomes crosshair → click on board → figure placed → label modal opens
  5. **Escape cancels:** In placement mode, Escape restores normal cursor
  6. **Edit mode:** Click a figure to select → open panel → title shows "FIGUR BEARBEITEN", Setzen button hidden; change colour in panel → figure recolours live; click different figure type → figure rebuilds in new type
  7. **WASD:** Select a figure, press W/A/S/D → figure moves; hold Shift+W → moves faster
  8. **Arrow keys:** Same as WASD
  9. **Double-click teleport:** Select figure, click empty board (deselects), immediately click another empty spot → figure slides to new position
  10. **No ctrlBall:** Clicking empty board shows NO golden sphere

- [ ] **Step 3: Push branch**

  ```bash
  git push -u origin feature/brett-ux-overhaul
  ```

- [ ] **Step 4: Deploy to dev for live verification (optional)**

  ```bash
  task dev:redeploy:brett
  # Then open https://brett.dev.mentolder.de and repeat smoke checks
  ```
