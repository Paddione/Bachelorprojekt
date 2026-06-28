// brett/src/client/touch-handler.ts — T000606 Mobile-Touch-Steuerung

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

// ── State machine ───────────────────────────────────────────────────────────

export interface TouchDeps {
  pickContactAt: (clientX: number, clientY: number) => any | null;
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
    if (mode === 'figure') deps.endFigureDrag();
    beginPinch(deps);
    return;
  }

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

// ── Test hooks ──────────────────────────────────────────────────────────────
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

  canvas.addEventListener('contextmenu', (e: Event) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });
}
