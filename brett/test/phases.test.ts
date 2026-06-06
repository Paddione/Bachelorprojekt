// Direct-import unit tests for the extracted phases module (TS refactor coverage, A3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initPhases,
  transitionPhase,
  buildStateFromMutations,
  VALID_PHASES,
  TERMINAL_PHASES,
} from '../src/server/phases';

function setup() {
  const figureMaps = new Map<string, Map<string, any>>();
  const mutations: any[] = [];
  initPhases({ figureMaps, applyMutation: (room, msg) => mutations.push({ room, msg }) });
  return { figureMaps, mutations };
}

test('VALID_PHASES / TERMINAL_PHASES membership', () => {
  for (const p of ['warmup', 'active', 'paused', 'ended']) {
    assert.ok(VALID_PHASES.has(p as any));
  }
  assert.ok(TERMINAL_PHASES.has('ended' as any));
  assert.equal(TERMINAL_PHASES.has('active' as any), false);
});

test('transitionPhase: rejects an invalid phase', () => {
  setup();
  assert.deepEqual(transitionPhase('r', 'bogus' as any), { ok: false, reason: 'invalid-phase' });
});

test('transitionPhase: blocks transitions out of a terminal phase', () => {
  const { figureMaps, mutations } = setup();
  const room = new Map<string, any>();
  room.set('__session_phase__', { phase: 'ended' });
  figureMaps.set('r', room);

  const res = transitionPhase('r', 'active');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'terminal-phase');
  assert.equal(mutations.length, 0); // no mutation emitted
});

test('transitionPhase: applies a valid transition and emits the mutation', () => {
  const { figureMaps, mutations } = setup();
  figureMaps.set('r', new Map());

  const res = transitionPhase('r', 'active');
  assert.equal(res.ok, true);
  assert.equal(res.to, 'active');
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].msg, { type: 'session_phase_set', phase: 'active' });
});

test('buildStateFromMutations: null for an unknown room', () => {
  setup();
  assert.equal(buildStateFromMutations('nope'), null);
});

test('buildStateFromMutations: separates figures from special session keys', () => {
  const { figureMaps } = setup();
  const room = new Map<string, any>();
  room.set('fig1', { id: 'fig1', x: 1 });
  room.set('__session_phase__', { id: '__session_phase__', phase: 'active' });
  room.set('__session_code__', { id: '__session_code__', code: 'ABC123' });
  figureMaps.set('r', room);

  const state = buildStateFromMutations('r');
  assert.deepEqual(state.figures, [{ id: 'fig1', x: 1 }]);
  assert.equal(state.sessionPhase, 'active');
  assert.equal(state.sessionCode, 'ABC123');
});
