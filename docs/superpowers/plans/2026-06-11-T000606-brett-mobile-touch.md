---
title: Brett Mobile-Touch-Steuerung Implementation Plan
ticket_id: T000656
domains: [website, test]
status: active
pr_number: 1582
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Brett Mobile-Touch-Steuerung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Brett 3D board fully operable on touch devices — one-finger orbit, one-finger figure-drag, two-finger pinch-zoom, and ≥44px touch targets — via a new Pointer-Events-based `touch-handler.ts` module, without changing desktop mouse behavior.

**Architecture:** A new headless-testable module `brett/src/client/touch-handler.ts` owns all Pointer-Event logic. Pinch/orbit math is extracted into pure exported functions (mirroring the `free-fly-camera.ts` pattern: pure functions + `_set*`/`_resetState` test hooks) so unit tests run under `node:test`/`tsx` with no DOM. `mannequin.ts` picking helpers are generalized from `MouseEvent` to a `{clientX,clientY}` duck-type. `scene.ts` gains a writable orbit-distance setter. `board-boot.ts` wires `initTouchHandler(deps)` after scene setup, reusing the exact lock/possession/freeze gates the mouse path uses. E2E coverage extends the existing Playwright `android` project (Pixel 5, `hasTouch`) and its `brett-mobile.spec.ts` — **no new Playwright project is added** (the spec's `brett-mobile` project proposal is superseded; `android` already exists and covers touch).

**Tech Stack:** TypeScript, three.js, Pointer Events API, `node:test` via `tsx --test` (unit), Playwright `android`/Pixel 5 project (E2E). Build: `tsc -p tsconfig.client.json --noEmit`.

---

## Spec-to-plan reconciliation (read before starting)

The design spec (`docs/superpowers/specs/2026-06-11-T000606-brett-mobile-touch-design.md`) was written before the live source was re-checked. These corrections are authoritative and are baked into the tasks below:

1. **Picking helpers live in `mannequin.ts`, not a separate file** — `setNdc`, `pickContact`, `pickFloor`, `pickMannequinBody` are all in `brett/src/client/mannequin.ts:358-395`. ✅ matches spec.
2. **`scene.ts` already exposes `getOrbitState()`** (returns `{theta,phi,dist}`) and `setCameraToOrbit()` (feature-flag gated, NOT usable for pinch). We add a **new** un-gated `setOrbitDist(dist: number)` setter rather than the spec's `getCameraOrbit`/`setCameraOrbitDist` names — `getOrbitState()` already covers the read side.
3. **No new Playwright project.** The spec proposes a `brett-mobile` project. It already exists as the **`android`** project (`devices['Pixel 5']`, `hasTouch:true`, deps `brett-mentolder-setup`) running `tests/e2e/specs/brett-mobile.spec.ts`. Extend that file + project. Do NOT add a `brett-mobile` project to `playwright.config.ts`.
4. **An existing tap-target test contradicts the new requirement.** `brett-mobile.spec.ts` test **T8** currently asserts preset buttons are `>= 20px`. The new spec requires `>= 44px` on `pointer:coarse`. T8 must be tightened to `>= 44`.
5. **No jsdom dependency exists** in `brett/package.json`. Unit tests must be DOM-free: follow the `free-fly-camera.ts` pattern (pure functions + injected state), not the spec's "jsdom + mocked getBoundingClientRect" approach.
6. **E2E orbit/zoom assertions need a debug hook.** `window.__brettDebug.orbitDist` does not exist. We expose `window.__brettScene` (the `SceneApi`) in `board-boot.ts` so Playwright can read `getOrbitState().dist` / `.theta`.
7. **Figure-drag touch path must replicate the mouse gates** in `board-boot.ts:206-277`: `activeLocks` foreign-lock block, `currentModerationState.freeze` leiter-gate, and the "free figure → possess instead of drag" branch. The touch handler reuses these via injected deps.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `brett/src/client/mannequin.ts` | Modify (`:358-395`) | Generalize `setNdc`/`pickContact`/`pickFloor`/`pickMannequinBody` from `MouseEvent` → `{clientX,clientY}` duck-type; add `setNdcFromPoint(clientX,clientY)`. |
| `brett/src/client/scene.ts` | Modify (`:15-29`, `:177-199`) | Add `setOrbitDist(dist:number)` to `SceneApi` + impl; touch sensitivity unchanged. |
| `brett/src/client/touch-handler.ts` | **Create** | All Pointer-Event logic: pinch/orbit/figure-drag state machine + pure math helpers + `_*` test hooks. |
| `brett/src/client/board-boot.ts` | Modify (`:36-39`, near `:204`) | Call `initTouchHandler(deps)`; expose `window.__brettScene`. |
| `brett/public/index.html` | Modify (`:5`, `:8-290` style block) | `touch-action` rules, `@media(pointer:coarse)` 44px targets, viewport `maximum-scale=1`. |
| `brett/test/touch-handler.test.ts` | **Create** | Headless unit tests for pinch/orbit math + mode-transition logic. |
| `tests/e2e/specs/brett-mobile.spec.ts` | Modify | Tighten T8 to ≥44px; add pinch-zoom + orbit-drag touch tests. |

---

## Task 1: Generalize mannequin picking helpers to a point duck-type

**Files:**
- Modify: `brett/src/client/mannequin.ts:358-395`
- Test: `brett/test/touch-handler.test.ts` (created in Task 6; this task is verified via existing `tsc` + existing mannequin-consuming tests)

- [x] **Step 1: Add `setNdcFromPoint` and refactor `setNdc` to delegate**

In `brett/src/client/mannequin.ts`, replace the existing `setNdc` (lines 358-363):

```typescript
export function setNdcFromPoint(clientX: number, clientY: number): void {
  const { renderer } = getScene();
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

/** Backward-compat wrapper for existing mouse-event call sites. Accepts any
 *  object exposing clientX/clientY (MouseEvent, PointerEvent, or a plain point). */
export function setNdc(ev: { clientX: number; clientY: number }): void {
  setNdcFromPoint(ev.clientX, ev.clientY);
}
```

- [x] **Step 2: Loosen the pick-helper parameter types**

In the same file, change the three picking helpers so they accept the duck-type (only `.clientX`/`.clientY` are used):

```typescript
export function pickContact(ev: { clientX: number; clientY: number }): any {
```
```typescript
export function pickMannequinBody(ev: { clientX: number; clientY: number }): any {
```
```typescript
export function pickFloor(ev: { clientX: number; clientY: number }): THREE.Vector3 | null {
```

Leave each function **body** unchanged — only the parameter type annotation changes. The `setNdc(ev)` call inside each now accepts the wider type.

- [x] **Step 3: Type-check (existing call sites must still compile)**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: exit 0, no errors. `board-boot.ts` passes `MouseEvent` to `pickContact`/`pickFloor`/`setNdc` — `MouseEvent` is assignable to `{clientX,clientY}`, so these still compile.

- [x] **Step 4: Run the full brett unit suite (regression check)**

Run: `cd brett && npm test`
Expected: all existing tests pass (the change is type-only + a delegating wrapper). The `scene-orbit-api.test.ts` static checks are unaffected.

- [x] **Step 5: Commit**

```bash
git add brett/src/client/mannequin.ts
git commit -m "refactor(brett): generalize mannequin pick helpers to {clientX,clientY} duck-type for touch"
```

---

## Task 2: Add `setOrbitDist` to SceneApi

**Files:**
- Modify: `brett/src/client/scene.ts:15-29` (interface) and `:177-199` (impl + return)
- Test: `brett/test/scene-orbit-api.test.ts` (extend with one static assertion)

- [x] **Step 1: Write the failing static test**

Append to `brett/test/scene-orbit-api.test.ts`:

```typescript
test('SceneApi interface declares setOrbitDist(dist)', () => {
  assert.match(
    sceneSrc,
    /setOrbitDist\s*\(\s*\w+\s*:\s*number\s*\)\s*:/,
    'SceneApi must have setOrbitDist(dist: number) method',
  );
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `cd brett && npx tsx --test test/scene-orbit-api.test.ts`
Expected: FAIL — the new assertion does not match (no `setOrbitDist` in source yet).

- [x] **Step 3: Declare `setOrbitDist` on the `SceneApi` interface**

In `brett/src/client/scene.ts`, inside `interface SceneApi` (after `setCameraToOrbit`, before the closing `}` at line 29):

```typescript
  /**
   * Set the orbit camera radial distance directly and re-render.
   * Clamped to [2, 40] (same range as wheel/pinch zoom). Un-gated
   * (unlike setCameraToOrbit) — used by touch pinch-zoom.
   */
  setOrbitDist: (dist: number) => void;
```

- [x] **Step 4: Implement `setOrbitDist` and add it to the return object**

In `initScene`, after the `setCameraToOrbit` function definition (after line 196), add:

```typescript
  function setOrbitDist(dist: number): void {
    cameraOrbit.dist = Math.max(2, Math.min(40, dist));
    updateCameraFromOrbit();
  }
```

Then extend the return statement (line 199) to include it:

```typescript
  return { renderer, scene, camera, floor: floorMesh, updateCameraFromOrbit, getOrbitState, setCameraToOrbit, setOrbitDist };
```

- [x] **Step 5: Run the test to confirm it passes**

Run: `cd brett && npx tsx --test test/scene-orbit-api.test.ts`
Expected: PASS (all assertions incl. the new one).

- [x] **Step 6: Type-check**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: exit 0.

- [x] **Step 7: Commit**

```bash
git add brett/src/client/scene.ts brett/test/scene-orbit-api.test.ts
git commit -m "feat(brett): add SceneApi.setOrbitDist for touch pinch-zoom"
```

---

## Task 3: Create touch-handler module — pure pinch/orbit math + test hooks

This task creates the module skeleton with **only the pure, DOM-free helpers** so they can be unit-tested headlessly first (TDD). The DOM event wiring is added in Task 4.

**Files:**
- Create: `brett/src/client/touch-handler.ts`
- Test: `brett/test/touch-handler.test.ts`

- [x] **Step 1: Write the failing unit tests for the pure helpers**

Create `brett/test/touch-handler.test.ts`:

```typescript
// brett/test/touch-handler.test.ts — T000606
// Headless unit tests for touch-handler pure helpers (no DOM/WebGL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pinchDistance,
  pinchZoomedDist,
  orbitDelta,
  TOUCH_ORBIT_SENSITIVITY,
} from '../src/client/touch-handler';

test('exports pure helpers', () => {
  assert.strictEqual(typeof pinchDistance, 'function');
  assert.strictEqual(typeof pinchZoomedDist, 'function');
  assert.strictEqual(typeof orbitDelta, 'function');
  assert.strictEqual(typeof TOUCH_ORBIT_SENSITIVITY, 'number');
});

test('pinchDistance computes euclidean distance between two points', () => {
  assert.strictEqual(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('fingers moving apart (currentDist > startDist) zooms IN (dist decreases)', () => {
  // start 100px apart, now 200px apart → ratio 0.5 → dist halves
  const out = pinchZoomedDist(10, 100, 200);
  assert.ok(out < 10, `expected zoom-in, got ${out}`);
  assert.strictEqual(out, 5);
});

test('fingers pinching together (currentDist < startDist) zooms OUT (dist increases)', () => {
  const out = pinchZoomedDist(10, 200, 100);
  assert.ok(out > 10, `expected zoom-out, got ${out}`);
  assert.strictEqual(out, 20);
});

test('pinchZoomedDist clamps result to upper bound 40', () => {
  // huge zoom-out ratio
  assert.strictEqual(pinchZoomedDist(30, 100, 10), 40);
});

test('pinchZoomedDist clamps result to lower bound 2', () => {
  // huge zoom-in ratio
  assert.strictEqual(pinchZoomedDist(30, 10, 1000), 2);
});

test('pinchZoomedDist guards against zero currentDist (no NaN/Infinity)', () => {
  const out = pinchZoomedDist(10, 100, 0);
  assert.ok(isFinite(out), `expected finite, got ${out}`);
});

test('orbitDelta scales pixel deltas by TOUCH_ORBIT_SENSITIVITY', () => {
  const { dTheta, dPhi } = orbitDelta(100, 50);
  assert.strictEqual(dTheta, -100 * TOUCH_ORBIT_SENSITIVITY); // theta -= dx*sens
  assert.strictEqual(dPhi, 50 * TOUCH_ORBIT_SENSITIVITY);     // phi  += dy*sens
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `cd brett && npx tsx --test test/touch-handler.test.ts`
Expected: FAIL — `Cannot find module '../src/client/touch-handler'`.

- [x] **Step 3: Create the module with the pure helpers**

Create `brett/src/client/touch-handler.ts`:

```typescript
// brett/src/client/touch-handler.ts — T000606 Mobile-Touch-Steuerung
// Unified Pointer-Events handler for the Brett 3D board: one-finger orbit,
// one-finger figure-drag, two-finger pinch-zoom. Desktop mouse paths in
// scene.ts / board-boot.ts are untouched and run in parallel.
//
// Design: pure math helpers (pinchDistance/pinchZoomedDist/orbitDelta) are
// DOM-free and unit-tested under node:test. initTouchHandler() wires them to
// PointerEvents (added in Task 4). Mirrors free-fly-camera.ts's testability.

import * as THREE from 'three';

/** Orbit drag sensitivity for touch (higher than the 0.005 mouse value:
 *  a finger travels larger screen distances than a mouse). */
export const TOUCH_ORBIT_SENSITIVITY = 0.007;

const ORBIT_DIST_MIN = 2;
const ORBIT_DIST_MAX = 40;

export interface Point2 { x: number; y: number; }

/** Euclidean distance between two screen points. */
export function pinchDistance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Given the orbit distance at pinch-start and the start/current finger gaps,
 * return the new clamped orbit distance.
 * Fingers apart (current > start) → ratio < 1 → smaller dist → zoom IN.
 * Fingers together (current < start) → ratio > 1 → larger dist → zoom OUT.
 */
export function pinchZoomedDist(
  startOrbitDist: number,
  startDist: number,
  currentDist: number,
): number {
  // Guard: a zero/near-zero current gap would divide by ~0 → Infinity.
  const safeCurrent = currentDist < 1e-3 ? 1e-3 : currentDist;
  const ratio = startDist / safeCurrent;
  const next = startOrbitDist * ratio;
  return Math.max(ORBIT_DIST_MIN, Math.min(ORBIT_DIST_MAX, next));
}

/** Convert a pixel drag delta to orbit angle deltas (theta -= dx, phi += dy). */
export function orbitDelta(dx: number, dy: number): { dTheta: number; dPhi: number } {
  return {
    dTheta: -dx * TOUCH_ORBIT_SENSITIVITY,
    dPhi: dy * TOUCH_ORBIT_SENSITIVITY,
  };
}
```

- [x] **Step 4: Run the unit tests to confirm they pass**

Run: `cd brett && npx tsx --test test/touch-handler.test.ts`
Expected: PASS (all 9 tests green).

- [x] **Step 5: Type-check**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: exit 0. (`THREE` import is currently unused — that's fine; Task 4 uses it. If your tsconfig has `noUnusedLocals`, instead omit the `import * as THREE` line until Task 4 — check with the type-check; the default brett tsconfig does NOT set `noUnusedLocals`, so keep it.)

- [x] **Step 6: Commit**

```bash
git add brett/src/client/touch-handler.ts brett/test/touch-handler.test.ts
git commit -m "feat(brett): touch-handler pure pinch/orbit math helpers + tests"
```

---

## Task 4: Touch-handler DOM wiring — Pointer-Event state machine

Add `initTouchHandler(deps)` and the mode state machine (orbit / figure-drag / pinch) using Pointer Events + `setPointerCapture`. The figure-drag branch reuses the exact gates from the mouse path.

**Files:**
- Modify: `brett/src/client/touch-handler.ts`
- Test: `brett/test/touch-handler.test.ts` (extend with mode-transition tests using a fake pointer harness)

- [x] **Step 1: Write failing tests for the mode state machine**

The state machine is tested via exported test hooks `_resetTouchState()`, `_getTouchMode()`, and a `_simulate*` API that accepts plain objects (no real DOM). Append to `brett/test/touch-handler.test.ts`:

```typescript
import {
  _resetTouchState,
  _getTouchMode,
  _onPointerDown,
  _onPointerMove,
  _onPointerUp,
  type TouchDeps,
} from '../src/client/touch-handler';

// A fake deps object: pickContact returns a "hit" only for x>=500 (right half).
function makeFakeDeps(overrides: Partial<TouchDeps> = {}): TouchDeps {
  let dist = 10;
  return {
    pickContactAt: (x: number, _y: number) =>
      x >= 500 ? { userData: { figureId: 'fig1', boneName: 'lWrist' } } : null,
    canDragFigure: () => true,
    startFigureDrag: () => {},
    moveFigureDrag: () => {},
    endFigureDrag: () => {},
    getOrbitDist: () => dist,
    setOrbitDist: (d: number) => { dist = d; },
    applyOrbitDelta: () => {},
    capturePointer: () => {},
    releasePointer: () => {},
    ...overrides,
  };
}

function pe(id: number, x: number, y: number) {
  return { pointerId: id, clientX: x, clientY: y } as any;
}

test('single pointer on floor (miss) → orbit mode', () => {
  _resetTouchState();
  const deps = makeFakeDeps();
  _onPointerDown(pe(1, 100, 100), deps); // left half → miss
  assert.strictEqual(_getTouchMode(), 'orbit');
});

test('single pointer on figure (hit) → figure mode', () => {
  _resetTouchState();
  const deps = makeFakeDeps();
  _onPointerDown(pe(1, 600, 100), deps); // right half → hit
  assert.strictEqual(_getTouchMode(), 'figure');
});

test('figure hit but canDragFigure=false → falls back to orbit', () => {
  _resetTouchState();
  const deps = makeFakeDeps({ canDragFigure: () => false });
  _onPointerDown(pe(1, 600, 100), deps);
  assert.strictEqual(_getTouchMode(), 'orbit');
});

test('two pointers → pinch mode (cancels figure drag)', () => {
  _resetTouchState();
  const deps = makeFakeDeps();
  _onPointerDown(pe(1, 600, 100), deps); // figure
  assert.strictEqual(_getTouchMode(), 'figure');
  _onPointerDown(pe(2, 100, 100), deps); // second finger → pinch
  assert.strictEqual(_getTouchMode(), 'pinch');
});

test('pinch updates orbit dist via setOrbitDist', () => {
  _resetTouchState();
  let written = -1;
  const deps = makeFakeDeps({ getOrbitDist: () => 10, setOrbitDist: (d) => { written = d; } });
  _onPointerDown(pe(1, 100, 100), deps);
  _onPointerDown(pe(2, 200, 100), deps); // start gap = 100
  _onPointerMove(pe(2, 300, 100), deps); // gap now 200 → zoom in → 5
  assert.strictEqual(written, 5);
});

test('lifting one finger during pinch → remaining finger becomes orbit', () => {
  _resetTouchState();
  const deps = makeFakeDeps();
  _onPointerDown(pe(1, 100, 100), deps);
  _onPointerDown(pe(2, 200, 100), deps);
  assert.strictEqual(_getTouchMode(), 'pinch');
  _onPointerUp(pe(2, 200, 100), deps);
  assert.strictEqual(_getTouchMode(), 'orbit');
});

test('lifting the last finger → mode null', () => {
  _resetTouchState();
  const deps = makeFakeDeps();
  _onPointerDown(pe(1, 100, 100), deps);
  _onPointerUp(pe(1, 100, 100), deps);
  assert.strictEqual(_getTouchMode(), null);
});

test('orbit move calls applyOrbitDelta with sensitivity-scaled deltas', () => {
  _resetTouchState();
  let captured: { dTheta: number; dPhi: number } | null = null;
  const deps = makeFakeDeps({ applyOrbitDelta: (dTheta, dPhi) => { captured = { dTheta, dPhi }; } });
  _onPointerDown(pe(1, 100, 100), deps);
  _onPointerMove(pe(1, 110, 90), deps); // dx=10, dy=-10
  assert.ok(captured);
  assert.strictEqual(captured!.dTheta, -10 * TOUCH_ORBIT_SENSITIVITY);
  assert.strictEqual(captured!.dPhi, -10 * TOUCH_ORBIT_SENSITIVITY);
});
```

- [x] **Step 2: Run to confirm failure**

Run: `cd brett && npx tsx --test test/touch-handler.test.ts`
Expected: FAIL — `_resetTouchState`, `_onPointerDown`, etc. not exported.

- [x] **Step 3: Implement the state machine + test hooks**

Append to `brett/src/client/touch-handler.ts`:

```typescript
// ── State machine ───────────────────────────────────────────────────────────
// `TouchDeps` is the thin, DOM-free seam the state machine drives. initTouchHandler
// builds a concrete TouchDeps from the real scene/mannequin and binds the handlers
// to canvas PointerEvents. Unit tests build a fake TouchDeps and call _onPointer*.

export interface TouchDeps {
  /** Raycast a contact sphere at screen coords; null = miss. */
  pickContactAt: (clientX: number, clientY: number) => any | null;
  /** Gate check (locks/freeze/possession) — false → do not start drag. */
  canDragFigure: (sphere: any) => boolean;
  startFigureDrag: (sphere: any, clientX: number, clientY: number) => void;
  moveFigureDrag: (clientX: number, clientY: number) => void;
  endFigureDrag: () => void;
  getOrbitDist: () => number;
  setOrbitDist: (dist: number) => void;
  applyOrbitDelta: (dTheta: number, dPhi: number) => void;
  capturePointer: (pointerId: number) => void;
  releasePointer: (pointerId: number) => void;
}

type Mode = 'orbit' | 'figure' | 'pinch' | null;

interface PointerSnap { pointerId: number; clientX: number; clientY: number; }

const activePointers = new Map<number, PointerSnap>();
let mode: Mode = null;
let orbitLast: { x: number; y: number } | null = null;
let pinchState: { id1: number; id2: number; startDist: number; startOrbitDist: number } | null = null;

function snap(e: { pointerId: number; clientX: number; clientY: number }): PointerSnap {
  return { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
}

function beginPinch(deps: TouchDeps): void {
  const ids = [...activePointers.keys()];
  const a = activePointers.get(ids[0])!;
  const b = activePointers.get(ids[1])!;
  pinchState = {
    id1: a.pointerId,
    id2: b.pointerId,
    startDist: pinchDistance({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY }),
    startOrbitDist: deps.getOrbitDist(),
  };
  mode = 'pinch';
  orbitLast = null;
}

export function _onPointerDown(
  e: { pointerId: number; clientX: number; clientY: number },
  deps: TouchDeps,
): void {
  activePointers.set(e.pointerId, snap(e));
  deps.capturePointer(e.pointerId);

  if (activePointers.size >= 2) {
    // If a figure drag was in progress, cancel it cleanly before pinching.
    if (mode === 'figure') deps.endFigureDrag();
    beginPinch(deps);
    return;
  }

  // First finger: figure-drag if it hits a draggable contact, else orbit.
  const sphere = deps.pickContactAt(e.clientX, e.clientY);
  if (sphere && deps.canDragFigure(sphere)) {
    mode = 'figure';
    deps.startFigureDrag(sphere, e.clientX, e.clientY);
  } else {
    mode = 'orbit';
    orbitLast = { x: e.clientX, y: e.clientY };
  }
}

export function _onPointerMove(
  e: { pointerId: number; clientX: number; clientY: number },
  deps: TouchDeps,
): void {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, snap(e));

  if (mode === 'pinch' && pinchState) {
    const a = activePointers.get(pinchState.id1);
    const b = activePointers.get(pinchState.id2);
    if (!a || !b) return;
    const cur = pinchDistance({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY });
    deps.setOrbitDist(pinchZoomedDist(pinchState.startOrbitDist, pinchState.startDist, cur));
    return;
  }

  if (mode === 'orbit' && orbitLast) {
    const dx = e.clientX - orbitLast.x;
    const dy = e.clientY - orbitLast.y;
    const { dTheta, dPhi } = orbitDelta(dx, dy);
    deps.applyOrbitDelta(dTheta, dPhi);
    orbitLast = { x: e.clientX, y: e.clientY };
    return;
  }

  if (mode === 'figure') {
    deps.moveFigureDrag(e.clientX, e.clientY);
  }
}

export function _onPointerUp(
  e: { pointerId: number; clientX: number; clientY: number },
  deps: TouchDeps,
): void {
  activePointers.delete(e.pointerId);
  deps.releasePointer(e.pointerId);

  if (mode === 'figure') {
    deps.endFigureDrag();
  }

  if (mode === 'pinch') {
    pinchState = null;
    if (activePointers.size === 1) {
      // Transition the surviving finger into an orbit drag.
      const remaining = [...activePointers.values()][0];
      mode = 'orbit';
      orbitLast = { x: remaining.clientX, y: remaining.clientY };
      return;
    }
  }

  if (activePointers.size === 0) {
    mode = null;
    orbitLast = null;
    pinchState = null;
  }
}

// ── Test hooks (mirrors free-fly-camera.ts _set*/_resetState pattern) ─────────
export function _resetTouchState(): void {
  activePointers.clear();
  mode = null;
  orbitLast = null;
  pinchState = null;
}
export function _getTouchMode(): Mode {
  return mode;
}

// ── DOM wiring ───────────────────────────────────────────────────────────────

export interface TouchHandlerWireDeps {
  canvas: HTMLElement;
  deps: TouchDeps;
}

/** Attach pointer listeners to the canvas. pointerType==='mouse' is ignored so
 *  the existing desktop mouse handlers remain the single source of truth on
 *  desktop (touch-action:none on the canvas also suppresses synthetic mouse
 *  events generated from touch). */
export function initTouchHandler({ canvas, deps }: TouchHandlerWireDeps): void {
  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    _onPointerDown(e, deps);
  }, { passive: false });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    _onPointerMove(e, deps);
  }, { passive: false });

  const up = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    _onPointerUp(e, deps);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}
```

- [x] **Step 4: Run the unit tests to confirm they pass**

Run: `cd brett && npx tsx --test test/touch-handler.test.ts`
Expected: PASS (all pure-helper tests + all 8 new state-machine tests).

- [x] **Step 5: Type-check**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: exit 0.

- [x] **Step 6: Commit**

```bash
git add brett/src/client/touch-handler.ts brett/test/touch-handler.test.ts
git commit -m "feat(brett): touch-handler pointer-event state machine (orbit/figure/pinch)"
```

---

## Task 5: Wire touch-handler into board-boot with real gates + debug hook

Build a concrete `TouchDeps` from the live scene/mannequin/ws state, replicating the lock/freeze/possession gates of the mouse path, and expose `window.__brettScene` for E2E.

**Files:**
- Modify: `brett/src/client/board-boot.ts` (imports; near `:204`; expose scene)
- Modify: `brett/src/client/scene.ts` — already has `getOrbitState`/`setOrbitDist` from Task 2; also need to mutate `theta`/`phi`. Add `applyOrbitDelta` (Step 2 below).
- Test: covered by `tsc` + E2E in Task 7 (integration glue; no new headless unit test — the logic it adds is exercised in `touch-handler.test.ts` via fakes).

- [x] **Step 1: Add `applyOrbitDelta` to SceneApi (mutate theta/phi like the mouse orbit)**

The mouse orbit at `scene.ts:146-155` mutates `cameraOrbit.theta -= dx*0.005` and clamps `phi` to `[-1.2,1.2]`. Touch needs the same mutation exposed. In `scene.ts`, add to the `SceneApi` interface (after `setOrbitDist`):

```typescript
  /** Apply incremental orbit angle deltas (theta += dTheta, phi += dPhi, phi clamped). */
  applyOrbitDelta: (dTheta: number, dPhi: number) => void;
```

In `initScene`, after `setOrbitDist` (Task 2 Step 4), add:

```typescript
  function applyOrbitDelta(dTheta: number, dPhi: number): void {
    cameraOrbit.theta += dTheta;
    cameraOrbit.phi = Math.max(-1.2, Math.min(1.2, cameraOrbit.phi + dPhi));
    updateCameraFromOrbit();
  }
```

Extend the return object:

```typescript
  return { renderer, scene, camera, floor: floorMesh, updateCameraFromOrbit, getOrbitState, setCameraToOrbit, setOrbitDist, applyOrbitDelta };
```

- [x] **Step 2: Add a static assertion for `applyOrbitDelta`**

Append to `brett/test/scene-orbit-api.test.ts`:

```typescript
test('SceneApi interface declares applyOrbitDelta(dTheta, dPhi)', () => {
  assert.match(
    sceneSrc,
    /applyOrbitDelta\s*\(\s*\w+\s*:\s*number\s*,\s*\w+\s*:\s*number\s*\)\s*:/,
    'SceneApi must have applyOrbitDelta(dTheta, dPhi)',
  );
});
```

Run: `cd brett && npx tsx --test test/scene-orbit-api.test.ts`
Expected: PASS.

- [x] **Step 3: Import touch-handler in board-boot.ts**

In `brett/src/client/board-boot.ts`, add to the import block (after line 21's `pov-camera` import or alongside the other client imports near line 22):

```typescript
import { initTouchHandler, type TouchDeps } from './touch-handler';
```

- [x] **Step 4: Build the TouchDeps and call initTouchHandler**

In `bootBoard()`, immediately after the drag-handling setup (after the `const { raycaster } = mannequin.getTickRefs();` line at `:199`, and after the ground-objects toolbar block at `:202-204`), insert the wiring. This block defines a local figure-drag closure mirroring the mouse path (`:230-300`), enforcing the same gates:

```typescript
  // ── T000606: Touch / Pointer-Events handler ────────────────────────────────
  // Reuses the same lock/freeze/possession gates as the mouse path. The desktop
  // mouse listeners above stay authoritative for pointerType==='mouse'.
  {
    let touchDrag: { figId: string; boneName: string; plane: THREE.Plane } | null = null;

    const canDragFigure = (sphere: any): boolean => {
      const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
      if (!fig) return false;
      const lock = activeLocks.get(fig.id);
      if (lock && lock.userId !== currentUser.userId) return false; // foreign lock
      // Freeze gate: non-leiter cannot drag while frozen
      if (currentModerationState.freeze) {
        const myRole = wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
        if (myRole !== 'leiter') return false;
      }
      // Free figure → possess (not drag); touch treats that as "not draggable"
      // so it falls back to orbit and the tap still works for selection below.
      return true;
    };

    const touchDeps: TouchDeps = {
      pickContactAt: (x, y) => mannequin.pickContact({ clientX: x, clientY: y }),
      canDragFigure,
      startFigureDrag: (sphere, x, y) => {
        const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
        if (!fig) return;
        // Free figure → possess instead of drag (mirror board-boot.ts:252-261)
        const isFree = !(fig as any)._serverPossessor && !activeLocks.get(fig.id);
        figPanel.selectFigure(fig.id);
        const ws = getWs();
        if (isFree) {
          if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_possess', figureId: fig.id }));
          touchDrag = null; // possession, no drag
          return;
        }
        if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_lock', id: fig.id, color: currentUser.color }));
        const worldPos = new THREE.Vector3();
        sphere.getWorldPosition(worldPos);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
        touchDrag = { figId: fig.id, boneName: sphere.userData.boneName, plane };
      },
      moveFigureDrag: (x, y) => {
        if (!touchDrag) return;
        mannequin.setNdcFromPoint(x, y);
        const { ndc } = mannequin.getTickRefs();
        raycaster.setFromCamera(ndc, camera);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(touchDrag.plane, target);
        if (!target) return;
        const fig = STATE.figures.find(f => f.id === touchDrag!.figId);
        if (!fig) return;
        mannequin.ccdIK(fig, touchDrag.boneName, target, 6);
        wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
        const now = performance.now();
        if (now - (fig._lastCollisionCheck || 0) > 33) {
          fig._lastCollisionCheck = now;
          mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
        }
      },
      endFigureDrag: () => {
        if (!touchDrag) return;
        const fig = STATE.figures.find(f => f.id === touchDrag!.figId);
        if (fig) {
          const chain = mannequin.IK_CHAINS[touchDrag.boneName] || [];
          for (const b of chain) delete fig.boneOverrides[b];
          delete fig.boneOverrides[touchDrag.boneName];
          wsClient.sendUpdate(fig, { boneOverrides: fig.boneOverrides });
          const ws = getWs();
          if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_unlock', id: fig.id }));
        }
        touchDrag = null;
      },
      getOrbitDist: () => sceneApi.getOrbitState().dist,
      setOrbitDist: (d) => sceneApi.setOrbitDist(d),
      applyOrbitDelta: (dTheta, dPhi) => sceneApi.applyOrbitDelta(dTheta, dPhi),
      capturePointer: (id) => { try { renderer.domElement.setPointerCapture(id); } catch { /* ignore */ } },
      releasePointer: (id) => { try { renderer.domElement.releasePointerCapture(id); } catch { /* ignore */ } },
    };

    initTouchHandler({ canvas: renderer.domElement, deps: touchDeps });
  }

  // T000606: expose scene for E2E touch assertions (orbit dist/theta read-back).
  (window as any).__brettScene = sceneApi;
```

> **TDZ note:** `currentModerationState` is declared with `let` at `board-boot.ts:447`, *after* this block. The mouse `mousedown` handler at `:242` already references it the same way (closure reads it lazily at event time, not at wiring time), so the `canDragFigure` closure is safe — it only reads `currentModerationState` when a pointerdown actually fires, by which point line 447 has executed. Do **not** move the declaration.

- [x] **Step 5: Type-check the whole client**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: exit 0. If `currentModerationState` is reported as "used before declaration", that's a false alarm only if you call it at module-eval time — it's inside a closure, so it compiles. If TS still complains, hoist the `let currentModerationState` declaration to just above this block (it has a literal initializer at `:447`, so moving the declaration up and leaving the initializer is safe).

- [x] **Step 6: Run the full brett unit suite**

Run: `cd brett && npm test`
Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add brett/src/client/board-boot.ts brett/src/client/scene.ts brett/test/scene-orbit-api.test.ts
git commit -m "feat(brett): wire touch-handler into board with lock/freeze/possession gates + __brettScene debug hook"
```

---

## Task 6: CSS — touch-action + 44px touch targets + viewport

**Files:**
- Modify: `brett/public/index.html` (`:5` viewport, `:8-290` style block)
- Test: covered by E2E in Task 7 + a static assertion below.

- [x] **Step 1: Update the viewport meta to block double-tap zoom**

In `brett/public/index.html` line 5, change:

```html
  <meta name="viewport" content="width=device-width,initial-scale=1" />
```

to:

```html
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
```

- [x] **Step 2: Add touch CSS rules at the end of the `<style>` block**

In `brett/public/index.html`, immediately before the closing `</style>` (line 290), insert:

```css
    /* ── T000606: Mobile-Touch-Steuerung ───────────────────────────── */
    /* Canvas owns all gestures — browser must not scroll/pan/zoom it. */
    canvas { touch-action: none; }

    @media (pointer: coarse) {
      .preset-btn {
        min-height: 44px;
        padding: 8px 12px;
        touch-action: manipulation;
      }
      #fig-panel-btn,
      #appearance-btn,
      #btn-export-png,
      #btn-export-json,
      #btn-export-pdf,
      #btn-release-possession {
        min-height: 44px;
        min-width: 44px;
        touch-action: manipulation;
      }
      #stiffness {
        height: 44px;
      }
    }
```

> Note: `#stiffness` width on mobile is set to 90px by the existing `@media (max-width: …)` rule at `:141`; this `pointer:coarse` rule only sets height, so there is no conflict.

- [x] **Step 3: Verify the markup is well-formed (no broken style block)**

Run: `cd brett && node -e "const s=require('fs').readFileSync('public/index.html','utf8'); const o=(s.match(/<style/g)||[]).length, c=(s.match(/<\/style>/g)||[]).length; if(o!==c) throw new Error('style tag mismatch '+o+'/'+c); if(!s.includes('touch-action: none')) throw new Error('canvas touch-action missing'); if(!s.includes('maximum-scale=1')) throw new Error('viewport not updated'); console.log('index.html OK: style', o+'/'+c);"`
Expected: `index.html OK: style 1/1`

- [x] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): touch-action + 44px touch targets + no-zoom viewport for mobile"
```

---

## Task 7: E2E — extend the existing `android` project (pinch, orbit, 44px)

Add touch tests to the existing `brett-mobile.spec.ts` (runs in the `android` Pixel-5 project) and tighten the existing T8 tap-target assertion from 20px to 44px.

**Files:**
- Modify: `tests/e2e/specs/brett-mobile.spec.ts`
- (No change to `tests/e2e/playwright.config.ts` — the `android` project already covers this file with `hasTouch`.)

- [x] **Step 1: Tighten the existing T8 tap-target assertion to 44px**

In `tests/e2e/specs/brett-mobile.spec.ts`, the T8 test currently asserts `heights.every(h => h >= 20)`. Replace that block. Find:

```typescript
      // Each preset button row touches the 36px topbar — at minimum 24px button
      // height. We relax to 20px here since the topbar provides the touch surface.
      expect(heights.every(h => h >= 20)).toBe(true);
```

Replace with:

```typescript
      // T000606: pointer:coarse media query enforces a 44px minimum tap height.
      expect(heights.every(h => h >= 44)).toBe(true);
```

- [x] **Step 2: Add the pinch-zoom and orbit-drag touch tests**

Append inside the `test.describe('Brett Mobile (Android) @mobile', …)` block (before its closing `});`):

```typescript
  test('T9: pinch-out zooms the orbit camera in (orbit dist decreases)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-pinch-${Date.now()}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForFunction(() => !!(window as any).__brettScene, { timeout: 10_000 });

      const before = await page.evaluate(() => (window as any).__brettScene.getOrbitState().dist);

      // Two-finger pinch-out (fingers move apart) via CDP touch dispatch.
      const cdp = await ctx.newCDPSession(page);
      const cx = await page.evaluate(() => window.innerWidth / 2);
      const cy = await page.evaluate(() => window.innerHeight / 2);
      // start: 40px apart
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
        touchPoints: [{ x: cx - 20, y: cy }, { x: cx + 20, y: cy }] });
      // move: 200px apart
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
        touchPoints: [{ x: cx - 100, y: cy }, { x: cx + 100, y: cy }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);

      const after = await page.evaluate(() => (window as any).__brettScene.getOrbitState().dist);
      expect(after).toBeLessThan(before);
    } finally {
      await ctx.close();
    }
  });

  test('T10: one-finger drag on empty floor orbits the camera (theta changes)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-orbit-${Date.now()}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForFunction(() => !!(window as any).__brettScene, { timeout: 10_000 });

      const before = await page.evaluate(() => (window as any).__brettScene.getOrbitState().theta);

      const cdp = await ctx.newCDPSession(page);
      // Drag from a top-left area unlikely to hit the single seeded figure (centered).
      const startX = await page.evaluate(() => Math.round(window.innerWidth * 0.2));
      const y = await page.evaluate(() => Math.round(window.innerHeight * 0.3));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',  touchPoints: [{ x: startX + 120, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd',   touchPoints: [] });
      await page.waitForTimeout(200);

      const after = await page.evaluate(() => (window as any).__brettScene.getOrbitState().theta);
      expect(Math.abs(after - before)).toBeGreaterThan(0.01);
    } finally {
      await ctx.close();
    }
  });
```

- [x] **Step 3: Lint-compile the spec (type-check only — do not run against prod here)**

Run: `cd tests/e2e && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0. (If `tsconfig.json` lacks a `noEmit` build path, instead run `npx playwright test --list --project=android tests/e2e/specs/brett-mobile.spec.ts` to confirm the file parses and the tests are discovered — expected: lists T1–T10 with no parse error.)

> **E2E execution note:** These tests run nightly via `e2e.yml` against the live `android` project (requires `.auth/mentolder-brett.json`). They self-skip when auth state is absent, so a local `--list` is the offline gate. Full execution belongs to the `dev-flow-e2e` phase after deploy, not this plan.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/specs/brett-mobile.spec.ts
git commit -m "test(brett): e2e pinch-zoom + orbit-drag touch tests; tighten tap-target to 44px"
```

---

## Task 8: Full build + CI-equivalent verification

**Files:** none (verification only).

- [x] **Step 1: Full client + server type-check (mirrors `npm run typecheck`)**

Run: `cd brett && npm run typecheck`
Expected: exit 0 (both `tsconfig.client.json` and `tsconfig.server.json` clean).

- [x] **Step 2: Full brett unit suite**

Run: `cd brett && npm test`
Expected: all tests pass, including the new `touch-handler.test.ts` (17 tests) and extended `scene-orbit-api.test.ts`.

- [x] **Step 3: Production client build (catches Vite/Rollup resolution issues)**

Run: `cd brett && npm run build`
Expected: exit 0 — `vite build` bundles `touch-handler.ts` (reached lazily via `board-boot.ts`) and `tsc -p tsconfig.server.json` passes.

- [x] **Step 4: Repo-level offline test gate (the CI job)**

Run: `cd /tmp/wt-T000606-brett-mobile-touch && task test:all`
Expected: exit 0. If `task` is unavailable, at minimum the brett suite (Steps 1-3) must be green.

- [x] **Step 5: Confirm the desktop mouse path is untouched (no regression)**

Run: `cd brett && grep -n "addEventListener('mousedown'\|addEventListener('mousemove'\|addEventListener('mouseup'\|addEventListener('wheel'" src/client/scene.ts src/client/board-boot.ts`
Expected: the original mouse/wheel listeners are all still present (scene.ts mousedown+wheel+window mousemove/mouseup; board-boot.ts mousedown/click/dblclick + window mousemove/mouseup). Touch is additive.

- [x] **Step 6: Final commit (only if any verification fix was needed)**

```bash
git add -A
git commit -m "chore(brett): T000606 touch-handler verification fixes" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Goal 1 (Touch-Drag&Drop): Tasks 4-5 (figure mode + `startFigureDrag`/`moveFigureDrag`/`endFigureDrag`, reusing `ccdIK`/`sendUpdate`). ✅
- Goal 2 (Pinch-Zoom): Tasks 3-5 (`pinchZoomedDist` + `setOrbitDist`, clamped 2-40). ✅
- Goal 3 (One-finger orbit): Tasks 3-5 (`orbitDelta` + `applyOrbitDelta`). ✅
- Goal 4 (44px targets): Task 6 CSS + Task 7 T8 tightened. ✅
- Goal 5 (touch-action CSS): Task 6 (`canvas{touch-action:none}` + `manipulation` on buttons). ✅
- Arch A (Pointer Events): Task 4 (`pointerdown/move/up/cancel`, `setPointerCapture`, `pointerType==='mouse'` skip). ✅
- Arch B (pinch via 2 pointer-ids): Task 4 (`activePointers` Map + `pinchState`). ✅
- Arch C (intent disambiguation): Task 4 (`pickContactAt` → figure vs orbit). ✅
- Arch D (separate module): Task 3. ✅
- Arch E (CSS): Task 6. ✅
- `mannequin.ts` `setNdcFromPoint`/duck-types: Task 1. ✅
- Tests (unit + E2E): Tasks 3,4,7. ✅ (Corrected: no jsdom, reuse `android` project, expose `__brettScene` not `__brettDebug`.)
- Out-of-scope (haptics, POV touch, a11y): not addressed — correct. ✅

**Placeholder scan:** No TBD/TODO/"add error handling". `capturePointer`/`releasePointer` use explicit `try/catch{ /* ignore */ }` (intentional — capturing an already-released pointer throws in some browsers; this is the documented safe pattern, not a silent-failure smell). All code blocks are complete.

**Type consistency:** `TouchDeps` member names (`pickContactAt`, `canDragFigure`, `startFigureDrag`, `moveFigureDrag`, `endFigureDrag`, `getOrbitDist`, `setOrbitDist`, `applyOrbitDelta`, `capturePointer`, `releasePointer`) are identical across the interface (Task 4), the fake in tests (Task 4), and the concrete impl (Task 5). `setNdcFromPoint(clientX,clientY)` signature matches between Task 1 (def) and Task 5 (call). `SceneApi.setOrbitDist`/`applyOrbitDelta`/`getOrbitState().dist` consistent across Tasks 2/5. Mode strings `'orbit'|'figure'|'pinch'|null` consistent.
