import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhaseState, DEFAULT_STEPS } from '../public/assets/coaching/phases.mjs';

test('defaults to the constellation template at index 0', () => {
  const p = createPhaseState();
  assert.deepEqual(p.steps(), DEFAULT_STEPS);
  assert.equal(p.index(), 0);
  assert.equal(p.label(), 'Aufstellen');
});

test('advance/back clamp at the ends', () => {
  const p = createPhaseState();
  assert.equal(p.advance(), 1);
  assert.equal(p.label(), 'Wahrnehmen');
  p.setIndex(p.steps().length - 1);
  assert.equal(p.advance(), p.steps().length - 1); // clamped
  p.setIndex(0);
  assert.equal(p.back(), 0); // clamped
});

test('setSteps replaces the list and clamps index into range', () => {
  const p = createPhaseState({ steps: ['A', 'B', 'C'], index: 2 });
  p.setSteps(['X']);
  assert.deepEqual(p.steps(), ['X']);
  assert.equal(p.index(), 0);
  assert.equal(p.label(), 'X');
});

test('setSteps ignores empty / non-string lists', () => {
  const p = createPhaseState();
  assert.equal(p.setSteps([]), false);
  assert.equal(p.setSteps(['ok', 5]), false);
  assert.deepEqual(p.steps(), DEFAULT_STEPS);
});
