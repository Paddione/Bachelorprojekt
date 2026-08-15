// brett/test/replay-engine.test.ts
// Tests for the client-side replay engine (T000472).
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyEventToState,
  seekToTimestamp,
  createReplayController,
  type ReplayBoardState,
} from '../src/client/replay-engine';
import type { RecordedEvent } from '../src/types/events';

// ── Test helpers ─────────────────────────────────────────────────
function emptyState(): ReplayBoardState {
  return { figures: {}, stiffness: 0.65, phase: 'lobby', sessionCode: null, coachingSteps: null, optik: null };
}

function ev(seq: number, eventType: string, payload: any, offsetSec = 0): RecordedEvent {
  const base = new Date('2026-06-07T10:00:00Z').getTime();
  return {
    id: seq,
    roomToken: 'r1',
    sessionCode: 'AA-100',
    seq,
    eventType,
    payload,
    recordedAt: new Date(base + offsetSec * 1000).toISOString(),
  };
}

// ── applyEventToState ────────────────────────────────────────────
test('replay-engine: applyEventToState — add creates figure', () => {
  const state = applyEventToState(emptyState(), ev(1, 'add', { id: 'f1', x: 1, z: 2, facingY: 0 }));
  assert.ok(state.figures['f1'], 'figure f1 should exist');
  assert.strictEqual(state.figures['f1'].x, 1);
});

test('replay-engine: applyEventToState — move updates position', () => {
  let state = applyEventToState(emptyState(), ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }));
  state = applyEventToState(state, ev(2, 'move', { id: 'f1', x: 3, z: 4, facingY: 1.57 }));
  assert.strictEqual(state.figures['f1'].x, 3);
  assert.strictEqual(state.figures['f1'].z, 4);
});

test('replay-engine: applyEventToState — delete removes figure', () => {
  let state = applyEventToState(emptyState(), ev(1, 'add', { id: 'f2', x: 0, z: 0, facingY: 0 }));
  state = applyEventToState(state, ev(2, 'delete', { id: 'f2' }));
  assert.ok(!state.figures['f2'], 'figure f2 should be deleted');
});

test('replay-engine: applyEventToState — stiffness updates state', () => {
  const state = applyEventToState(emptyState(), ev(1, 'stiffness', { value: 0.9 }));
  assert.strictEqual(state.stiffness, 0.9);
});

test('replay-engine: applyEventToState — session_phase_change updates phase', () => {
  const state = applyEventToState(emptyState(), ev(1, 'session_phase_change', { phase: 'active' }));
  assert.strictEqual(state.phase, 'active');
});

test('replay-engine: applyEventToState — unknown event type is a no-op', () => {
  const initial = emptyState();
  const state = applyEventToState(initial, ev(1, 'unknown_future_type', { foo: 'bar' }));
  assert.deepStrictEqual(state.figures, initial.figures);
  assert.strictEqual(state.phase, initial.phase);
});

// ── seekToTimestamp ──────────────────────────────────────────────
test('replay-engine: seekToTimestamp at t=0 applies the event at the timeline origin', () => {
  // The timeline origin (t=0) is anchored to the first recorded event's
  // timestamp, so seeking to 0 applies that first event. (Consistent with the
  // createReplayController seek(0) contract below.)
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 5),
  ];
  const state = seekToTimestamp(events, emptyState(), 0);
  assert.ok(state.figures['f1'], 'first event (at the origin) is applied at t=0');
});

test('replay-engine: seekToTimestamp before a later event excludes it', () => {
  // With two events, seeking between them must exclude the later one.
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'add', { id: 'f2', x: 1, z: 1, facingY: 0 }, 5),
  ];
  const state = seekToTimestamp(events, emptyState(), 2000);
  assert.ok(state.figures['f1'], 'f1 (at origin) present at t=2s');
  assert.ok(!state.figures['f2'], 'f2 (at t=5s) absent at t=2s');
});

test('replay-engine: seekToTimestamp at t=max returns final state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'move', { id: 'f1', x: 5, z: 5, facingY: 0 }, 2),
    ev(3, 'delete', { id: 'f1' }, 4),
  ];
  const state = seekToTimestamp(events, emptyState(), 10_000);
  assert.ok(!state.figures['f1'], 'f1 deleted at end');
});

test('replay-engine: seekToTimestamp mid-session captures intermediate state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'move', { id: 'f1', x: 5, z: 5, facingY: 0 }, 2),
    ev(3, 'delete', { id: 'f1' }, 4),
  ];
  // At t=3s (between move at 2s and delete at 4s), f1 should be at (5,5)
  const state = seekToTimestamp(events, emptyState(), 3000);
  assert.ok(state.figures['f1'], 'f1 should exist at t=3s');
  assert.strictEqual(state.figures['f1'].x, 5);
});

test('replay-engine: seekToTimestamp with empty events returns initial state', () => {
  const initial = emptyState();
  const state = seekToTimestamp([], initial, 5000);
  assert.deepStrictEqual(state.figures, initial.figures);
});

// ── createReplayController ────────────────────────────────────────
test('replay-engine: createReplayController — totalDurationMs computed correctly', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'move', { id: 'f1', x: 1, z: 1, facingY: 0 }, 10),
  ];
  const ctrl = createReplayController(events, { figures: [] });
  assert.strictEqual(ctrl.totalDurationMs, 10_000, 'duration should be 10 seconds');
});

test('replay-engine: createReplayController — seek returns state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
  ];
  const ctrl = createReplayController(events, { figures: [] });
  const state = ctrl.seek(0);
  assert.ok(state.figures['f1'], 'seek(0) should include the add event');
});
