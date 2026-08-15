// brett/test/tick-loop-priority.test.ts — T3 / T000465
// Tests for tick-loop Single-Writer priority (POV > Free-Fly > Orbit),
// F-key guard (no figure owned), and Esc priority via stopImmediatePropagation.
// Pure static-analysis tests — no WebGL/DOM required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bootSrc = readFileSync(
  fileURLToPath(new URL('../src/client/board-boot.ts', import.meta.url)),
  'utf8',
);

// ── T3-1: Free-Fly module imported in board-boot ─────────────────────────────

test('board-boot imports free-fly-camera module', () => {
  assert.match(
    bootSrc,
    /import.*free-fly-camera/,
    'board-boot.ts must import free-fly-camera',
  );
});

// ── T3-2: F-key toggle present ───────────────────────────────────────────────

test('board-boot has F-key toggle (KeyF code)', () => {
  assert.match(
    bootSrc,
    /KeyF/,
    'board-boot.ts must respond to KeyF',
  );
});

// ── T3-3: F-key guard — only when local player owns no figure ────────────────

test('F-key guard checks that local player has no possessed figure', () => {
  // The guard must check _serverPossessor against currentUser before toggling
  assert.match(
    bootSrc,
    /_serverPossessor.*currentUser\.userId|currentUser\.userId.*_serverPossessor/,
    'F-key toggle must be guarded by possession check',
  );
});

// ── T3-4: Esc exits Free-Fly with stopImmediatePropagation ──────────────────

test('Esc handler calls stopImmediatePropagation for free-fly exit', () => {
  assert.match(
    bootSrc,
    /stopImmediatePropagation/,
    'board-boot.ts must call stopImmediatePropagation on Esc in free-fly',
  );
});

// ── T3-5: Esc for free-fly is registered with capture:true ───────────────────

test('free-fly Esc handler uses capture:true for priority', () => {
  assert.match(
    bootSrc,
    /capture.*true|capture:\s*true/,
    'Esc handler for free-fly must use capture: true',
  );
});

// ── T3-6: Tick-loop calls tickFreeFly ────────────────────────────────────────

test('tick loop calls tickFreeFly when free-fly is active', () => {
  assert.match(
    bootSrc,
    /tickFreeFly/,
    'tick function must call tickFreeFly',
  );
});

// ── T3-7: Tick-loop calls isFreeFly ──────────────────────────────────────────

test('tick loop calls isFreeFly to check mode', () => {
  assert.match(
    bootSrc,
    /isFreeFly/,
    'tick function must call isFreeFly()',
  );
});

// ── T3-8: Tick-loop priority: POV checked first, then free-fly ───────────────

test('tick loop checks isInPov before isFreeFly (POV > Free-Fly priority)', () => {
  const povIdx = bootSrc.indexOf('isInPov');
  const freeFlyIdx = bootSrc.indexOf('isFreeFly');
  assert.ok(povIdx !== -1, 'tick must reference isInPov()');
  assert.ok(freeFlyIdx !== -1, 'tick must reference isFreeFly()');
  assert.ok(
    povIdx < freeFlyIdx,
    `isInPov (pos ${povIdx}) must appear before isFreeFly (pos ${freeFlyIdx}) — POV has higher priority`,
  );
});

// ── T3-9: DARK-LAUNCH gate present ───────────────────────────────────────────

test('F-key and free-fly wiring is gated behind __brettFeatures sf-t000465', () => {
  assert.match(
    bootSrc,
    /__brettFeatures[\s\S]*sf-t000465|sf-t000465[\s\S]*__brettFeatures/,
    'T3 features must be dark-launched behind __brettFeatures[sf-t000465]',
  );
});

// ── T3-10: free-fly-camera exports are consumed ──────────────────────────────

test('board-boot references freeFly.isFreeFly and freeFly.tickFreeFly', () => {
  assert.match(bootSrc, /freeFly\.isFreeFly/, 'must call freeFly.isFreeFly()');
  assert.match(bootSrc, /freeFly\.tickFreeFly/, 'must call freeFly.tickFreeFly()');
});
