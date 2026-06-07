// brett/test/timeline.test.ts
// Tests for the timeline UI component (T000472).
// These tests cover the pure controller-interaction logic the timeline relies on,
// without requiring a real DOM (offline-safe: no network, no DB, no jsdom).
import { test } from 'node:test';
import assert from 'node:assert';

import { type ReplayController, type ReplayBoardState } from '../src/client/replay-engine';

// ── Mock controller ───────────────────────────────────────────────
function mockController(totalDurationMs = 10_000): ReplayController & { seekCalls: number[] } {
  let currentPositionMs = 0;
  let isPlaying = false;
  const seekCalls: number[] = [];

  return {
    get events() { return []; },
    get totalDurationMs() { return totalDurationMs; },
    get currentPositionMs() { return currentPositionMs; },
    set currentPositionMs(v: number) { currentPositionMs = v; },
    get isPlaying() { return isPlaying; },
    set isPlaying(v: boolean) { isPlaying = v; },
    seekCalls,
    seek(pos: number): ReplayBoardState {
      seekCalls.push(pos);
      currentPositionMs = Math.max(0, Math.min(pos, totalDurationMs));
      return { figures: {}, stiffness: 0.65, phase: 'lobby', sessionCode: null, coachingSteps: null, optik: null };
    },
    play(_onFrame) {
      isPlaying = true;
    },
    pause() {
      isPlaying = false;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────
test('timeline: mockController seek clamps to [0, totalDurationMs]', () => {
  const ctrl = mockController(10_000);
  ctrl.seek(-1000);
  assert.strictEqual(ctrl.currentPositionMs, 0, 'negative seek clamps to 0');
  ctrl.seek(20_000);
  assert.strictEqual(ctrl.currentPositionMs, 10_000, 'over-seek clamps to totalDurationMs');
});

test('timeline: mockController isPlaying state', () => {
  const ctrl = mockController();
  assert.strictEqual(ctrl.isPlaying, false);
  ctrl.play(() => {});
  assert.strictEqual(ctrl.isPlaying, true);
  ctrl.pause();
  assert.strictEqual(ctrl.isPlaying, false);
});

test('timeline: seek at 50% returns half-duration position', () => {
  const ctrl = mockController(20_000);
  ctrl.seek(10_000);
  assert.strictEqual(ctrl.currentPositionMs, 10_000);
  assert.strictEqual(ctrl.seekCalls.length, 1);
  assert.strictEqual(ctrl.seekCalls[0], 10_000);
});

test('timeline: zero-duration controller does not divide by zero', () => {
  const ctrl = mockController(0);
  assert.strictEqual(ctrl.totalDurationMs, 0);
  ctrl.seek(0);
  assert.strictEqual(ctrl.currentPositionMs, 0);
});
