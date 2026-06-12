// brett/src/client/free-fly-camera.ts — T000465: Free-Fly-Observer-Kamera
//
// Self-contained free-fly camera module. No imports from scene.ts or any
// module with DOM/WebGL dependency — safe to import in headless tests.
//
// DARK-LAUNCH: all user-visible behavior in this module is benign state logic
// only (no UI writes). The HUD integration (T4) gates display behind the
// feature flag. This module itself is always loaded when board-boot imports it.

import * as THREE from 'three';

// ── DOM safety shims (headless / test environment guard) ─────────────────────
// In Node.js test environments there is no window or document. We guard every
// DOM call so the module remains importable and its pure logic testable.
const _hasWindow = typeof window !== 'undefined';
const _hasDocument = typeof document !== 'undefined';

// ── Constants ────────────────────────────────────────────────────────────────

const PITCH_MAX = (85 * Math.PI) / 180; // ±85° in radians
const BOUND_XZ = 30;
const BOUND_Y_MIN = 0.3;
const BOUND_Y_MAX = 25;

const MOVE_SPEED = 8;        // m/s base
const BOOST_MULT = 3;        // Shift multiplier
const SMOOTH_K = 12;         // exponential smoothing coefficient

// ── Module state (not exported directly — use accessors below) ───────────────

let _active = false;
let _yaw = 0;        // radians, horizontal rotation around Y-axis
let _pitch = 0;      // radians, vertical rotation, clamped ±85°

// Velocity vector (in local camera space), smoothed
const _vel = new THREE.Vector3();

// Currently pressed keys
interface KeyState {
  w?: boolean; a?: boolean; s?: boolean; d?: boolean;
  q?: boolean; e?: boolean;
  space?: boolean; ctrl?: boolean; shift?: boolean;
}
let _keys: KeyState = {};

// DOM listeners — stored for cleanup
let _domEl: HTMLElement | null = null;
let _onMouseMove: ((e: MouseEvent) => void) | null = null;
let _onPointerLockChange: (() => void) | null = null;
let _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
let _onKeyUp: ((e: KeyboardEvent) => void) | null = null;

// Reusable scratch vectors (avoid allocation in hot tick path)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _target = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enter free-fly mode. Reads camera's current position/orientation to
 * initialise yaw/pitch, then registers input listeners.
 *
 * @param camera - The scene camera to drive.
 * @param domElement - The renderer's DOM element for pointer-lock (may be
 *   null in headless/test environments — pointer-lock is skipped silently).
 */
export function enterFreeFly(camera: THREE.Camera, domElement: HTMLElement | null): void {
  if (_active) return; // idempotent

  // Derive initial yaw/pitch from current camera orientation
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  _yaw = Math.atan2(dir.x, dir.z);         // Note: atan2(x, z) not (z, x) for our convention
  _pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));

  _vel.set(0, 0, 0);
  _keys = {};
  _active = true;
  _domEl = domElement;

  // Register keyboard listeners on window (skipped in headless environments)
  _onKeyDown = (e: KeyboardEvent) => { _handleKey(e.code, true); };
  _onKeyUp = (e: KeyboardEvent) => { _handleKey(e.code, false); };
  if (_hasWindow) {
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup', _onKeyUp);
  }

  // Register mouse-move listener (requires pointer lock to be meaningful)
  _onMouseMove = (e: MouseEvent) => {
    if (!_active) return;
    // Only apply mouse-look if pointer is locked
    if (_hasDocument && document.pointerLockElement !== domElement) return;
    const sensitivity = 0.002;
    _yaw -= e.movementX * sensitivity;
    _pitch -= e.movementY * sensitivity;
    _pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, _pitch));
  };
  if (_hasWindow) {
    window.addEventListener('mousemove', _onMouseMove);
  }

  // Pointer-lock change: losing lock does NOT exit free-fly,
  // it just makes mouse-look inactive (guard in _onMouseMove above).
  _onPointerLockChange = () => { /* no-op: mouse-look guard handles this */ };
  if (_hasDocument) {
    document.addEventListener('pointerlockchange', _onPointerLockChange);
  }

  // Request pointer lock (may be rejected — that's fine)
  if (domElement && typeof domElement.requestPointerLock === 'function') {
    domElement.requestPointerLock().catch(() => { /* pointer-lock denied — continue without mouse-look */ });
  }
}

/**
 * Exit free-fly mode. Releases pointer lock, removes all listeners,
 * clears the active flag.
 */
export function exitFreeFly(): void {
  if (!_active) return;
  _active = false;
  _keys = {};
  _vel.set(0, 0, 0);

  // Remove keyboard listeners
  if (_onKeyDown) { if (_hasWindow) window.removeEventListener('keydown', _onKeyDown); _onKeyDown = null; }
  if (_onKeyUp) { if (_hasWindow) window.removeEventListener('keyup', _onKeyUp); _onKeyUp = null; }
  if (_onMouseMove) { if (_hasWindow) window.removeEventListener('mousemove', _onMouseMove); _onMouseMove = null; }
  if (_onPointerLockChange) { if (_hasDocument) document.removeEventListener('pointerlockchange', _onPointerLockChange); _onPointerLockChange = null; }

  // Exit pointer lock if we hold it
  if (_hasDocument && _domEl && document.pointerLockElement === _domEl) {
    document.exitPointerLock();
  }
  _domEl = null;
}

/** Returns true when free-fly mode is active. */
export function isFreeFly(): boolean {
  return _active;
}

/**
 * Drive the camera for one frame. Call this from the tick loop instead of
 * updateCameraFromOrbit() when isFreeFly() is true.
 *
 * @param dt - Frame delta time in seconds.
 * @param camera - The scene camera to write.
 */
export function tickFreeFly(dt: number, camera: THREE.Camera): void {
  if (!_active) return;

  // Ensure pitch stays clamped (may have been set externally in tests)
  _pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, _pitch));

  // Build forward vector from yaw/pitch.
  // Convention: yaw=0 faces -Z, yaw=π/2 faces +X (right-handed, Y-up).
  //   forward.x =  sin(yaw) * cos(pitch)
  //   forward.y =  sin(pitch)
  //   forward.z = -cos(yaw) * cos(pitch)
  _forward.set(
    Math.sin(_yaw) * Math.cos(_pitch),
    Math.sin(_pitch),
    -Math.cos(_yaw) * Math.cos(_pitch),
  );
  _right.crossVectors(_forward, _up).normalize();

  // Compute desired velocity from keys
  const speed = MOVE_SPEED * (_keys.shift ? BOOST_MULT : 1);
  _desiredVel.set(0, 0, 0);
  if (_keys.w) _desiredVel.addScaledVector(_forward, speed);
  if (_keys.s) _desiredVel.addScaledVector(_forward, -speed);
  if (_keys.a) _desiredVel.addScaledVector(_right, -speed);
  if (_keys.d) _desiredVel.addScaledVector(_right, speed);
  if (_keys.space) _desiredVel.y += speed;
  if (_keys.ctrl)  _desiredVel.y -= speed;
  if (_keys.q)     _desiredVel.y -= speed;
  if (_keys.e)     _desiredVel.y += speed;

  // Exponential smoothing: vel → desiredVel
  const alpha = 1 - Math.exp(-SMOOTH_K * dt);
  _vel.lerp(_desiredVel, alpha);

  // Integrate
  camera.position.addScaledVector(_vel, dt);

  // Clamp to arena box
  camera.position.x = Math.max(-BOUND_XZ, Math.min(BOUND_XZ, camera.position.x));
  camera.position.y = Math.max(BOUND_Y_MIN, Math.min(BOUND_Y_MAX, camera.position.y));
  camera.position.z = Math.max(-BOUND_XZ, Math.min(BOUND_XZ, camera.position.z));

  // Apply look direction
  _target.copy(camera.position).addScaledVector(_forward, 1);
  camera.lookAt(_target);
}

// ── Internal keyboard mapping ────────────────────────────────────────────────

function _handleKey(code: string, down: boolean): void {
  switch (code) {
    case 'KeyW': _keys.w = down; break;
    case 'KeyA': _keys.a = down; break;
    case 'KeyS': _keys.s = down; break;
    case 'KeyD': _keys.d = down; break;
    case 'KeyQ': _keys.q = down; break;
    case 'KeyE': _keys.e = down; break;
    case 'Space': _keys.space = down; break;
    case 'ControlLeft': case 'ControlRight': _keys.ctrl = down; break;
    case 'ShiftLeft': case 'ShiftRight': _keys.shift = down; break;
  }
}

// ── Test helpers (exported for headless unit tests only) ─────────────────────
// These exports exist solely to allow headless unit tests (brett/test/free-fly-camera.test.ts)
// to set internal state without DOM/WebGL. They are NOT part of the production API.
// Do NOT import these outside of test files.
// Removing or renaming them requires updating free-fly-camera.test.ts.

/** @internal */
export function _setYaw(yaw: number): void { _yaw = yaw; }
/** @internal */
export function _setPitch(pitch: number): void { _pitch = pitch; }
/** @internal */
export function _setKeys(keys: KeyState): void { _keys = { ...keys }; }
/** @internal */
export function _resetState(): void {
  // Remove any lingering listeners
  if (_active) exitFreeFly();
  _active = false;
  _yaw = 0;
  _pitch = 0;
  _vel.set(0, 0, 0);
  _keys = {};
  _domEl = null;
}
