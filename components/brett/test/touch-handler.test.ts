// brett/test/touch-handler.test.ts — T000606
// Headless unit tests for touch-handler pure helpers (no DOM/WebGL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pinchDistance,
  pinchZoomedDist,
  orbitDelta,
  TOUCH_ORBIT_SENSITIVITY,
  _resetTouchState,
  _getTouchMode,
  _onPointerDown,
  _onPointerMove,
  _onPointerUp,
  initTouchHandler,
  type TouchDeps,
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
  assert.strictEqual(pinchZoomedDist(30, 100, 10), 40);
});

test('pinchZoomedDist clamps result to lower bound 2', () => {
  assert.strictEqual(pinchZoomedDist(30, 10, 1000), 2);
});

test('pinchZoomedDist guards against zero currentDist (no NaN/Infinity)', () => {
  const out = pinchZoomedDist(10, 100, 0);
  assert.ok(isFinite(out), `expected finite, got ${out}`);
});

test('orbitDelta scales pixel deltas by TOUCH_ORBIT_SENSITIVITY', () => {
  const { dTheta, dPhi } = orbitDelta(100, 50);
  assert.strictEqual(dTheta, -100 * TOUCH_ORBIT_SENSITIVITY);
  assert.strictEqual(dPhi, 50 * TOUCH_ORBIT_SENSITIVITY);
});

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
  _onPointerDown(pe(1, 100, 100), deps);
  assert.strictEqual(_getTouchMode(), 'orbit');
});

test('single pointer on figure (hit) → figure mode', () => {
  _resetTouchState();
  const deps = makeFakeDeps();
  _onPointerDown(pe(1, 600, 100), deps);
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
  _onPointerDown(pe(1, 600, 100), deps);
  assert.strictEqual(_getTouchMode(), 'figure');
  _onPointerDown(pe(2, 100, 100), deps);
  assert.strictEqual(_getTouchMode(), 'pinch');
});

test('pinch updates orbit dist via setOrbitDist', () => {
  _resetTouchState();
  let written = -1;
  const deps = makeFakeDeps({ getOrbitDist: () => 10, setOrbitDist: (d) => { written = d; } });
  _onPointerDown(pe(1, 100, 100), deps);
  _onPointerDown(pe(2, 200, 100), deps);
  _onPointerMove(pe(2, 300, 100), deps);
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
  _onPointerMove(pe(1, 110, 90), deps);
  assert.ok(captured);
  assert.strictEqual(captured!.dTheta, -10 * TOUCH_ORBIT_SENSITIVITY);
  assert.strictEqual(captured!.dPhi, -10 * TOUCH_ORBIT_SENSITIVITY);
});

// ── DOM wiring tests (contextmenu + multi-touch guard) ─────────────────────

function makeMinimalCanvas() {
  const listeners = new Map<string, ((...args: any[]) => void)[]>();
  return {
    addEventListener(type: string, fn: (...args: any[]) => void, _opts?: any) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    removeEventListener() {},
    triggerEvent(type: string, event: any) {
      const fns = listeners.get(type) ?? [];
      for (const fn of fns) fn(event);
    },
  };
}

function makeMinimalTouchDeps() {
  return {
    pickContactAt: () => null,
    canDragFigure: () => false,
    startFigureDrag: () => {},
    moveFigureDrag: () => {},
    endFigureDrag: () => {},
    getOrbitDist: () => 10,
    setOrbitDist: () => {},
    applyOrbitDelta: () => {},
    capturePointer: () => {},
    releasePointer: () => {},
  };
}

test('contextmenu listener calls preventDefault', () => {
  const canvas = makeMinimalCanvas();
  initTouchHandler({ canvas: canvas as any, deps: makeMinimalTouchDeps() });
  let prevented = false;
  const fakeEvent = { preventDefault: () => { prevented = true; } };
  canvas.triggerEvent('contextmenu', fakeEvent);
  assert.ok(prevented, 'contextmenu should call preventDefault');
});

test('touchstart with 2 fingers calls preventDefault', () => {
  const canvas = makeMinimalCanvas();
  initTouchHandler({ canvas: canvas as any, deps: makeMinimalTouchDeps() });
  let prevented = false;
  const fakeEvent = {
    touches: { length: 2 },
    preventDefault: () => { prevented = true; },
  };
  canvas.triggerEvent('touchstart', fakeEvent);
  assert.ok(prevented, 'two-finger touchstart should call preventDefault');
});

test('touchstart with 1 finger does not call preventDefault', () => {
  const canvas = makeMinimalCanvas();
  initTouchHandler({ canvas: canvas as any, deps: makeMinimalTouchDeps() });
  let prevented = false;
  const fakeEvent = {
    touches: { length: 1 },
    preventDefault: () => { prevented = true; },
  };
  canvas.triggerEvent('touchstart', fakeEvent);
  assert.ok(!prevented, 'single-finger touchstart should not call preventDefault');
});
