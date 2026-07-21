---
title: "brett-fig-panel-drag-rotate — Implementation Plan"
ticket_id: T002050
domains: [brett, frontend]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brett-fig-panel-drag-rotate — Implementation Plan

_Ticket: T002050_

Turns the Systembrett figure panel into a viewport-edge drawer with a contextual edit tab, and
adds whole-figure floor drag plus free 360° Y rotation. All logic is client-side; the existing
`move` protocol (`x, z, facingY`) already carries position and facing, so there is no
server/protocol change. New drag/rotation logic lives in a **new pure-ish module**
`brett/src/client/figure-drag.ts` so `board-boot.ts` (S1 budget 74) does not grow — the existing
mouse handler bodies are **extracted** into that module and `board-boot.ts` only calls a
delegating wiring function.

Coordination note: the parallel plan `fix-t001935-brett-admin-session` owns
`brett/src/client/ws-connection-client.ts`. This plan does **not** touch that file — `sendMove`
already has the needed signature — keeping the two changes conflict-free.

## File Structure

| File | LOC (ist) | Effective budget | Note |
|------|-----------|------------------|------|
| `brett/src/client/figure-drag.ts` | new | new (<600) | NEW pure helpers (angle/offset/predicate/throttle) + `initFigureDrag` wiring |
| `brett/src/client/ui/fig-panel.ts` | 255 | 345 | auto-close in `addFigure`, `syncEdgeTab`, rotation slider |
| `brett/src/client/board-boot.ts` | 526 | 74 | extract drag handlers → `figure-drag.ts`; keep a delegating one-liner |
| `brett/src/client/mannequin.ts` | 417 | 183 | invisible rotate-ring hit region + `pickRotateRing` |
| `brett/src/client/state.ts` | 73 | 527 | discriminated `ui.dragging` union (`bone`/`body`/`rotate`) |
| `brett/src/client/touch-controls.ts` | 101 | 499 | reuse shared figure-drag helpers for touch body/ring |
| `brett/public/index.html` | 482 | ungated (.html) | edge-drawer CSS, `#fig-panel-edge-tab`, rotation-slider markup |
| `tests/spec/brett.bats` | existing | grep-structural | add T002050 `@test` entries (no new bats file) |
| `brett/test/figure-drag.test.ts` | new | new (<600) | NEW node:test unit coverage for the pure helpers |

The effective budgets equal the static `.ts` limit (600) minus current LOC — none of these files is
baselined in `docs/code-quality/baseline.json`, so the static limit is the wirksame Schwelle.
`board-boot.ts` residual is only 74, so the drag handlers are extracted (not added) — see Task 3.

## Task 1 — Discriminated drag state + pure figure-drag helpers

**Files:** `brett/src/client/state.ts`, `brett/src/client/figure-drag.ts` (new)

- Widen `ui.dragging` in `state.ts` to a discriminated union keyed by `kind`, keeping the existing
  bone-drag shape as the `'bone'` variant so current reads (`.boneName`, `.plane`, `.figId`) keep
  compiling once guarded:

```ts
// brett/src/client/state.ts — ui.dragging
export const ui = {
  dragging: null as null
    | { kind: 'bone'; figId: string; boneName: string; plane: THREE.Plane }
    | { kind: 'body'; figId: string; plane: THREE.Plane; grabOffset: { x: number; z: number } }
    | { kind: 'rotate'; figId: string; startAngle: number; startFacing: number },
  placingMode: false,
  panelColor: '#b8c0a8',
  panelScale: 1.0,
};
```

- Create `brett/src/client/figure-drag.ts` with **pure, dependency-free helpers** (no THREE, no
  `STATE` import → keeps it a pure module, avoids the `state.ts` ↔ `figure-drag.ts` import cycle
  that S2 forbids):

```ts
// brett/src/client/figure-drag.ts — pure helpers (unit-tested)
export interface Vec2 { x: number; z: number; }

/** Grab-offset captured on body-drag start so the figure never jumps to the cursor. */
export function computeGrabOffset(hit: Vec2, root: Vec2): Vec2 {
  return { x: hit.x - root.x, z: hit.z - root.z };
}
/** New root position from a raw floor hit minus the captured grab-offset. */
export function applyGrabOffset(hit: Vec2, offset: Vec2): Vec2 {
  return { x: hit.x - offset.x, z: hit.z - offset.z };
}
/** Angle (radians) of a floor point around the figure root — matches the facingY convention. */
export function angleAround(root: Vec2, point: Vec2): number {
  return Math.atan2(point.x - root.x, point.z - root.z);
}
/** Ring-drag facing: start facing plus the pointer's angular delta around the root. */
export function rotateFacing(startFacing: number, startAngle: number, currentAngle: number): number {
  return startFacing + (currentAngle - startAngle);
}
/** Wrap radians into [0, 2π). */
export function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}
export function degToRad(deg: number): number { return (deg * Math.PI) / 180; }
export function radToDeg(rad: number): number { return (normalizeAngle(rad) * 180) / Math.PI; }
/** D3 edge-tab visibility predicate. */
export function edgeTabVisible(selectedId: string | null, panelHidden: boolean): boolean {
  return selectedId !== null && panelHidden;
}
/** ~33 ms throttle decision for sendMove during drag/rotate. */
export function shouldSend(now: number, last: number, intervalMs = 33): boolean {
  return now - last >= intervalMs;
}
```

- Type-check: `cd brett && npx tsc --noEmit` (or the repo's brett build) must pass with the widened
  union — fix any un-guarded `ui.dragging.boneName` reads to check `kind === 'bone'` first.

## Task 2 — Unit tests for the pure helpers (RED → GREEN)

**Files:** `brett/test/figure-drag.test.ts` (new)

- Add node:test coverage for the pure helpers (round-trip `degToRad`/`radToDeg`, `normalizeAngle`
  wrap past 2π, `rotateFacing` delta, `computeGrabOffset`/`applyGrabOffset` inverse, `edgeTabVisible`
  truth table, `shouldSend` boundary at 33 ms):

```ts
// brett/test/figure-drag.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGrabOffset, applyGrabOffset, angleAround, rotateFacing,
  normalizeAngle, degToRad, radToDeg, edgeTabVisible, shouldSend,
} from '../src/client/figure-drag.ts';

test('grab-offset keeps the figure under the cursor without jumping', () => {
  const off = computeGrabOffset({ x: 2, z: 3 }, { x: 1.5, z: 2 });
  assert.deepEqual(applyGrabOffset({ x: 2, z: 3 }, off), { x: 1.5, z: 2 });
});
test('edgeTabVisible is true only with a selection and a closed panel', () => {
  assert.equal(edgeTabVisible('f1', true), true);
  assert.equal(edgeTabVisible(null, true), false);
  assert.equal(edgeTabVisible('f1', false), false);
});
test('rotation degree round-trip and wrap', () => {
  assert.ok(Math.abs(radToDeg(degToRad(270)) - 270) < 1e-9);
  assert.ok(Math.abs(normalizeAngle(rotateFacing(0, 0, Math.PI * 3)) - Math.PI) < 1e-9);
});
```

- Run the brett unit suite; the module does not exist yet, so this is the red step:

```bash
cd brett && npm test
# expected: FAIL (figure-drag.ts helpers not yet importable / assertions not yet satisfied)
```

- Implement Task 1 so the assertions pass, then re-run `cd brett && npm test` → GREEN.

## Task 3 — Extract drag orchestration into figure-drag.ts and delegate from board-boot

**Files:** `brett/src/client/figure-drag.ts`, `brett/src/client/board-boot.ts`,
`brett/src/client/mannequin.ts`

- **Extract** the `mousedown` / `mousemove` / `mouseup` figure-drag handler bodies out of
  `board-boot.ts` into an exported `initFigureDrag(deps)` in `figure-drag.ts`. `board-boot.ts` keeps
  only the delegating call (net line reduction — respects the 74-line residual budget):

```ts
// brett/src/client/board-boot.ts (delegating wiring — replaces the inline handlers)
import { initFigureDrag } from './figure-drag';
// …
initFigureDrag({ renderer, camera, raycaster, mannequin, wsClient, figPanel, snapping,
                 getModerationState: () => currentModerationState });
```

- In `figure-drag.ts`, `initFigureDrag` wires `mousedown`/`mousemove`/`mouseup` and implements the
  pick priority: contact sphere → IK bone drag (`kind:'bone'`, unchanged behaviour); else rotate-ring
  → `kind:'rotate'`; else body mesh → `kind:'body'`. Body and rotate reuse the same lock/freeze gates
  as the bone path (no new bypass) and stream throttled `move`:

```ts
// figure-drag.ts — body-drag move (uses the pure helpers + throttle)
const hit = mannequin.pickFloor(e);
if (hit && d.kind === 'body') {
  const p = applyGrabOffset({ x: hit.x, z: hit.z }, d.grabOffset);
  fig.root.position.x = p.x; fig.root.position.z = p.z;
  const now = performance.now();
  if (shouldSend(now, fig._lastMoveSent || 0)) { fig._lastMoveSent = now; wsClient.sendMove(fig.id, p.x, p.z, fig.facingY); }
}
```

- In `mannequin.ts`, add an **invisible wider rotate-ring hit region** as a child of `root` (e.g. a
  larger `RingGeometry`/disk with `visible:false`, `userData.isRotateRing = true`, `userData.figureId`)
  next to the existing visible ring, and export `pickRotateRing(ev)` mirroring `pickContact` but
  intersecting only rotate-ring meshes of the selected figure. This keeps the thin visible ring
  usable by mouse and touch.
- On rotate move: `facingY = rotateFacing(startFacing, startAngle, angleAround(root, floorHit))`,
  set `fig.root.rotation.y = fig.facingY`, throttled `wsClient.sendMove(id, x, z, facingY)`.
- On `mouseup`: keep the existing `snapping.finishDrag(fig)` + `figure_unlock` path for `bone`/`body`;
  for `rotate` send a final `move` and unlock. Clear `ui.dragging = null`.

## Task 4 — Fig-panel edge-drawer, auto-close, edge-tab, rotation slider

**Files:** `brett/src/client/ui/fig-panel.ts`, `brett/public/index.html`

- `index.html`: repoint the `#fig-panel` CSS to an edge-drawer — `position: fixed; right: 12px;`
  top below the topbar, `z-index: 200; max-height: calc(100vh - 60px); overflow-y: auto`; extend the
  `@media (max-width: 600px)` block so the drawer fits narrow viewports (reduced width / bottom-anchor).
  Keep `#fig-panel-wrap` and `#fig-panel-btn` (toggle) in place.
- `index.html`: add the edge-tab button and a rotation-slider row inside the panel:

```html
<button id="fig-panel-edge-tab" hidden aria-controls="fig-panel">Figur bearbeiten</button>
<!-- inside #fig-panel, edit-only controls -->
<span class="fig-panel-label" data-i18n-skip>Drehung</span>
<input id="fig-rotate-slider" type="range" min="0" max="360" step="1" value="0" />
```

```css
#fig-panel-edge-tab {
  position: fixed; right: 0; top: 50%; transform: translateY(-50%);
  z-index: 199; /* … edge-tab styling … */
}
```

- `fig-panel.ts`: add `syncEdgeTab()` using the pure predicate, and call it from `selectFigure`,
  `openFigPanel`, `closeFigPanel`; make `addFigure` auto-close after spawn:

```ts
import { edgeTabVisible, degToRad, radToDeg } from '../figure-drag';
const figEdgeTab = document.getElementById('fig-panel-edge-tab');
export function syncEdgeTab(): void {
  if (figEdgeTab) figEdgeTab.hidden = !edgeTabVisible(STATE.selectedId, figPanel.hidden);
}
// in addFigure(), after selectFigure(id) / sendAddFigure:
closeFigPanel();
```

- Wire the edge-tab click to `openFigPanel()`, and the `#fig-rotate-slider` `input` event to set
  `fig.facingY = degToRad(value)`, `fig.root.rotation.y = fig.facingY`, and `sendMove`. In
  `syncPanelToSelection`, initialise the slider from `radToDeg(fig.facingY)`.
- Call `syncEdgeTab()` inside `openFigPanel`/`closeFigPanel`/`selectFigure` so the tab tracks state.

## Task 5 — Touch parity via shared helpers

**Files:** `brett/src/client/touch-controls.ts`

- Extend the `TouchDeps` wiring so a single-finger press that misses a contact sphere falls back to
  the shared body-drag / rotate helpers from `figure-drag.ts` (same state machine as mouse — no
  copy-pasted drag math). Reuse `pickRotateRing` / `pickMannequinBody`, `applyGrabOffset`,
  `rotateFacing`, `angleAround`, and `shouldSend`; keep the existing pinch/orbit branches untouched.
- Verify no import cycle is introduced (`touch-controls.ts` → `figure-drag.ts` only; `figure-drag.ts`
  never imports `touch-controls.ts`).

## Task 6 — Structural BATS tests (RED → GREEN)

**Files:** `tests/spec/brett.bats`

- Append T002050 `@test` entries to the existing SSOT bats file (no new file per repo convention).
  The regexes match the code planned in Tasks 1–4:

```bash
@test "T002050: figure-drag.ts exists and exports body/rotation helpers" {
  [ -s "${SRC}/client/figure-drag.ts" ]
  run grep -E 'export function edgeTabVisible\b' "${SRC}/client/figure-drag.ts"
  [ "$status" -eq 0 ]
  run grep -E 'export function rotateFacing\b' "${SRC}/client/figure-drag.ts"
  [ "$status" -eq 0 ]
  run grep -E 'export function applyGrabOffset\b' "${SRC}/client/figure-drag.ts"
  [ "$status" -eq 0 ]
}

@test "T002050: state.ts dragging supports body and rotate drag kinds" {
  run grep -E "kind: 'body'" "${SRC}/client/state.ts"
  [ "$status" -eq 0 ]
  run grep -E "kind: 'rotate'" "${SRC}/client/state.ts"
  [ "$status" -eq 0 ]
}

@test "T002050: fig-panel auto-closes on addFigure and syncs the edge-tab" {
  run grep -E 'syncEdgeTab' "${SRC}/client/ui/fig-panel.ts"
  [ "$status" -eq 0 ]
  run grep -E 'closeFigPanel\(\)' "${SRC}/client/ui/fig-panel.ts"
  [ "$status" -eq 0 ]
}

@test "T002050: index.html adds the edge-tab and rotation slider" {
  run grep -E 'id="fig-panel-edge-tab"' "${BRETT}/public/index.html"
  [ "$status" -eq 0 ]
  run grep -E '#fig-panel-edge-tab' "${BRETT}/public/index.html"
  [ "$status" -eq 0 ]
  run grep -E 'id="fig-rotate-slider"' "${BRETT}/public/index.html"
  [ "$status" -eq 0 ]
}

@test "T002050: board-boot delegates figure drag/rotate to figure-drag module" {
  run grep -E "from './figure-drag'" "${SRC}/client/board-boot.ts"
  [ "$status" -eq 0 ]
  run grep -E 'initFigureDrag' "${SRC}/client/board-boot.ts"
  [ "$status" -eq 0 ]
}
```

- Run the structural gate before implementing Tasks 1–4 — the new module/markers do not exist yet:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
# expected: FAIL (red — figure-drag.ts, edge-tab, and drag kinds not yet present)
```

- After Tasks 1–5 land, re-run the same command → GREEN.

## Task 7 — Final verification

**Files:** none (verification only)

- Regenerate the test inventory (test files changed) and commit
  `website/src/data/test-inventory.json` alongside the new tests:

```bash
task test:inventory
```

- Run the mandatory CI gates and confirm each is green before opening the PR:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- Also run the OpenSpec gate and the brett unit suite as a final cross-check:

```bash
task test:openspec
cd brett && npm test
```
