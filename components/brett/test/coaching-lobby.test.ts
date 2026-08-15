import { test } from 'node:test';
import assert from 'node:assert';
import { buildCoachingStepsPayload } from '../src/client/lobby-coaching';
import {
  applyMutation,
  buildStateFromMutations,
  transitionPhase,
} from '../src/server/index';

// D10 — Coaching-Ablauf. The lobby builds steps (pure client logic); they become
// the active coaching steps and survive the lobby→active round-start transition.

test('buildCoachingStepsPayload trims + drops blank lines', () => {
  assert.deepStrictEqual(
    buildCoachingStepsPayload('Schritt A\nSchritt B\n\n  '),
    { steps: ['Schritt A', 'Schritt B'], index: 0 },
  );
});

test('buildCoachingStepsPayload returns null for empty/whitespace input', () => {
  assert.strictEqual(buildCoachingStepsPayload(''), null);
  assert.strictEqual(buildCoachingStepsPayload('   \n  \n'), null);
});

test('coaching steps survive the lobby→active round-start', () => {
  const room = 'coaching-lobby-d10';
  applyMutation(room, { type: 'coaching_steps_set', steps: ['A', 'B'], index: 0 });
  applyMutation(room, { type: 'session_phase_set', phase: 'lobby' });
  const res = transitionPhase(room, 'active');
  assert.strictEqual(res.ok, true);
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.coachingSteps, { steps: ['A', 'B'], index: 0 });
  assert.strictEqual(state.sessionPhase, 'active');
});
