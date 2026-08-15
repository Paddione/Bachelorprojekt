// brett/test/coaching-steps.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, buildStateFromMutations } from '../src/server/index';

test('coaching_steps_set persists steps+index and stays out of figures', () => {
  const room = 'steps-test-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'coaching_steps_set', steps: ['A', 'B'], index: 1 });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.coachingSteps, { steps: ['A', 'B'], index: 1 });
  assert.strictEqual(state.figures.length, 1);
  assert.ok(!state.figures.find((f: any) => f.id === '__coaching_steps__'));
});

test('coaching_steps_set ignores invalid payloads', () => {
  const room = 'steps-test-2';
  applyMutation(room, { type: 'coaching_steps_set', steps: 'nope', index: 0 });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.coachingSteps, undefined);
});
