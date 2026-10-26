// scripts/lib/dense-embedding.test.mjs — reiner Profilvertrag.
// Verhalten statt Stringkopie: Prompts, Grenzen, Token-Split mit Fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDenseVectors,
  formatDenseInput,
  profileContentHash,
  splitDenseText,
  DENSE_DIMENSIONS,
  DENSE_MAX_TOKENS,
  DENSE_MODEL,
  DENSE_PROFILE,
} from './dense-embedding.mjs';

test('profile constants pin model, dimensions, context', () => {
  assert.equal(DENSE_MODEL, 'embeddinggemma-300m');
  assert.equal(DENSE_DIMENSIONS, 768);
  assert.equal(DENSE_PROFILE, 'embeddinggemma-300m:768:Q8_0:v1');
  assert.equal(DENSE_MAX_TOKENS, 2048);
});

test('query prompt is exact and keeps text unchanged', () => {
  assert.equal(formatDenseInput('Hallo Welt', 'query'), 'task: search result | query: Hallo Welt');
  assert.equal(formatDenseInput('', 'query'), 'task: search result | query: ');
});

test('index prompt defaults title to none, keeps text unchanged', () => {
  assert.equal(formatDenseInput('Text', 'index'), 'title: none | text: Text');
  assert.equal(formatDenseInput('Text', 'index', 'Titel'), 'title: Titel | text: Text');
  assert.equal(formatDenseInput('Text', 'index', ''), 'title: none | text: Text');
});

test('query and document prompts differ', () => {
  assert.notEqual(formatDenseInput('x', 'query'), formatDenseInput('x', 'index'));
});

test('invalid purpose throws, never double-prefixes', () => {
  assert.throws(() => formatDenseInput('x', 'bogus'), /purpose/);
  assert.equal(formatDenseInput('task: search result | query: x', 'query'), 'task: search result | query: task: search result | query: x');
});

test('assertDenseVectors accepts exact finite non-null 768 vectors', () => {
  assertDenseVectors([new Array(768).fill(0.5), new Array(768).fill(-0.25)], 2);
  assertDenseVectors([], 0);
});

for (const [label, vecs, n] of [
  ['1024 dims', [new Array(1024).fill(0.1)], 1],
  ['767 dims', [new Array(767).fill(0.1)], 1],
  ['NaN', [new Array(768).fill(Number.NaN)], 1],
  ['Infinity', [new Array(768).fill(Number.POSITIVE_INFINITY)], 1],
  ['null vector', [new Array(768).fill(0)], 1],
  ['non-numeric', [new Array(768).fill('0.1')], 1],
  ['count mismatch', [new Array(768).fill(0.1)], 2],
  ['empty vs 1', [], 1],
]) {
  test(`assertDenseVectors rejects ${label}`, () => {
    assert.throws(() => assertDenseVectors(vecs, n));
  });
}

// Tokenizer-Fixture: reale Kosten = Zeichen des fertig formatierten Texts
// plus 3 Spezialtokens.
const tokenize = async (s) => [...s].length + 3;

test('split keeps short text whole and lossless', async () => {
  const parts = await splitDenseText('a😀b  c\n\nzeile', { tokenize, purpose: 'index' });
  assert.deepEqual(parts, ['a😀b  c\n\nzeile']);
});

test('split separates oversized source into budget-fitting parts', async () => {
  const text = `${'ä'.repeat(1500)}\n${'x'.repeat(1500)}`;
  const parts = await splitDenseText(text, { tokenize, purpose: 'index', maxTokens: 1600 });
  assert.ok(parts.length >= 2);
  assert.equal(parts.join(''), text);
  for (const p of parts) {
    assert.ok((await tokenize(formatDenseInput(p, 'index'))) <= 1600);
  }
});

test('split never separates surrogate pairs and handles empty input', async () => {
  // Prompt kostet 23 Tokens; bei 25 passen zwei Emojis in den ersten Teil.
  const parts = await splitDenseText('😀😀😀', { tokenize, purpose: 'index', maxTokens: 25 });
  assert.deepEqual(parts, ['😀😀', '😀']);
  for (const p of parts) assert.doesNotMatch(p, /�/);
  assert.deepEqual(await splitDenseText('', { tokenize }), []);
});

test('split rejects over-limit budgets and propagates tokenizer errors', async () => {
  await assert.rejects(splitDenseText('x', { tokenize, maxTokens: 0 }), /maxTokens/);
  await assert.rejects(splitDenseText('x', { tokenize, maxTokens: 4096 }), /maxTokens/);
  await assert.rejects(
    splitDenseText('x', { tokenize: async () => { throw new Error('tok-fail'); } }),
    /tok-fail/,
  );
});

test('profileContentHash binds profile and content', () => {
  const a = profileContentHash('x');
  assert.equal(a, profileContentHash('x'));
  assert.equal(a.length, 64);
  assert.notEqual(a, profileContentHash('y'));
});
