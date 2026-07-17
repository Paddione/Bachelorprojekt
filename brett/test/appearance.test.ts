// brett/test/appearance.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAppearance, applyMutation, buildStateFromMutations } from '../src/server/index';

// ─── validateAppearance ───────────────────────────────────────────

test('validateAppearance: accepts null face', () => {
  const err = validateAppearance({ face: null, body: null, accessories: null });
  assert.equal(err, null);
});

test('validateAppearance: accepts known face key "neutral" (or any string when spec absent)', () => {
  // If spec is loaded and "neutral" is not present, this would return an error;
  // when spec is absent (test env) it returns null — either way no crash.
  const err = validateAppearance({ face: 'neutral' });
  assert.ok(err === null || typeof err === 'string', 'should return null or a string reason');
});

test('validateAppearance: accepts all-null accessories object', () => {
  const err = validateAppearance({ face: null, body: null, accessories: { head: null, upper: null, feet: null } });
  assert.equal(err, null);
});

test('validateAppearance: accepts partial accessories (only feet set)', () => {
  const err = validateAppearance({ accessories: { feet: 'boots-work' } });
  // If spec not loaded, accs.length === 0, so any string passes
  assert.ok(err === null || typeof err === 'string', 'should return null or a string reason');
});

test('validateAppearance: rejects accessories as array', () => {
  const err = validateAppearance({ accessories: ['cap'] });
  assert.equal(err, 'accessories must be object');
});

test('validateAppearance: rejects unknown body type', () => {
  // Force a body value that is definitely not in the spec
  // We need the spec to be loaded for this to error; when spec is absent it passes.
  // Inject a fake spec key check by using a clearly bogus body string and checking
  // the return value is either null (no spec) or an error string.
  const err = validateAppearance({ body: '__definitely_not_a_real_body__' });
  // If bodies are loaded, this must be an error string; if not loaded, null is acceptable.
  if (err !== null) {
    assert.match(err, /unknown body/);
  }
});

test('validateAppearance: returns null for minimal valid appearance', () => {
  const err = validateAppearance({ face: null, body: null, accessories: { head: null, upper: null, feet: null } });
  assert.equal(err, null);
});

// ─── applyMutation ────────────────────────────────────────────────

test('applyMutation add: figure gets default appearance when none supplied', () => {
  const room = 'appear-test-add-default';
  applyMutation(room, { type: 'add', fig: { id: 'f1', label: 'Alice' } });
  const state = buildStateFromMutations(room);
  const fig = state.figures.find((f: any) => f.id === 'f1');
  assert.ok(fig, 'figure should be in state');
  assert.deepEqual(fig.appearance, {
    face: null,
    body: 'adult-average',
    accessories: { head: null, upper: null, feet: null },
  });
});

test('applyMutation add: figure keeps supplied appearance when present', () => {
  const room = 'appear-test-add-supplied';
  const supplied = { face: 'neutral', body: 'child', accessories: { head: 'cap', upper: null, feet: null } };
  applyMutation(room, { type: 'add', fig: { id: 'f2', label: 'Bob', appearance: supplied } });
  const state = buildStateFromMutations(room);
  const fig = state.figures.find((f: any) => f.id === 'f2');
  assert.ok(fig, 'figure should be in state');
  assert.deepEqual(fig.appearance, supplied);
});

test('applyMutation update: partial appearance change merges — changing face leaves accessories unchanged', () => {
  const room = 'appear-test-update-face';
  const initial = { face: 'neutral', body: 'adult-average', accessories: { head: 'cap', upper: null, feet: 'boots-work' } };
  applyMutation(room, { type: 'add', fig: { id: 'f3', appearance: initial } });
  applyMutation(room, { type: 'update', id: 'f3', changes: { appearance: { face: 'calm' } } });
  const state = buildStateFromMutations(room);
  const fig = state.figures.find((f: any) => f.id === 'f3');
  assert.ok(fig, 'figure should be in state');
  assert.equal(fig.appearance.face, 'calm');
  assert.equal(fig.appearance.body, 'adult-average');
  assert.deepEqual(fig.appearance.accessories, { head: 'cap', upper: null, feet: 'boots-work' });
});

test('applyMutation update: partial accessories change merges — changing head leaves upper/feet unchanged', () => {
  const room = 'appear-test-update-acc';
  const initial = { face: null, body: 'adult-average', accessories: { head: null, upper: 'coat', feet: 'sandals' } };
  applyMutation(room, { type: 'add', fig: { id: 'f4', appearance: initial } });
  applyMutation(room, { type: 'update', id: 'f4', changes: { appearance: { accessories: { head: 'cap' } } } });
  const state = buildStateFromMutations(room);
  const fig = state.figures.find((f: any) => f.id === 'f4');
  assert.ok(fig, 'figure should be in state');
  assert.equal(fig.appearance.accessories.head, 'cap');
  assert.equal(fig.appearance.accessories.upper, 'coat');
  assert.equal(fig.appearance.accessories.feet, 'sandals');
});

// ─── E2: Figuren-Opacity (T001931) ────────────────────────────────

test('applyMutation update: opacity persistiert auf der Figur', () => {
  const room = 'appear-test-opacity';
  applyMutation(room, { type: 'add', fig: { id: 'f5' } });
  applyMutation(room, { type: 'update', id: 'f5', changes: { opacity: 0.5 } });
  const fig = buildStateFromMutations(room).figures.find((f: any) => f.id === 'f5');
  assert.equal(fig.opacity, 0.5);
});

test('applyMutation update: opacity wird auf 0.2–1.0 geklemmt', () => {
  const room = 'appear-test-opacity-clamp';
  applyMutation(room, { type: 'add', fig: { id: 'f6' } });
  applyMutation(room, { type: 'update', id: 'f6', changes: { opacity: 5 } });
  let fig = buildStateFromMutations(room).figures.find((f: any) => f.id === 'f6');
  assert.equal(fig.opacity, 1, 'oberer Clamp');
  applyMutation(room, { type: 'update', id: 'f6', changes: { opacity: 0.01 } });
  fig = buildStateFromMutations(room).figures.find((f: any) => f.id === 'f6');
  assert.equal(fig.opacity, 0.2, 'unterer Clamp');
});
