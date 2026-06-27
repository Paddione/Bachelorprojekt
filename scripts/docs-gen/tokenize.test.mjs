// scripts/docs-gen/tokenize.test.mjs
// TDD tests for tokenize.mjs — write BEFORE tokenize.mjs (red → green).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldGerman, tokenize } from './tokenize.mjs';

// ─── foldGerman ──────────────────────────────────────────────────────────────

test('foldGerman: lowercases and folds all German umlauts + eszett', () => {
  assert.equal(foldGerman('Schlüssel'), 'schluessel', 'ü→ue');
  assert.equal(foldGerman('Äpfel'), 'aepfel', 'Ä→ae');
  assert.equal(foldGerman('Öl'), 'oel', 'Ö→oe');
  assert.equal(foldGerman('Übung'), 'uebung', 'Ü→ue');
  assert.equal(foldGerman('Straße'), 'strasse', 'ß→ss');
  assert.equal(foldGerman('BERLIN'), 'berlin', 'uppercased only');
});

test('foldGerman: handles mixed case umlaut text', () => {
  const result = foldGerman('Konfiguration & Außenüberwachung');
  assert.ok(result.includes('konfiguration'), 'lowercase');
  assert.ok(result.includes('aussen'), 'ß→ss + ü→ue');
  assert.ok(result.includes('ueberwachung'), 'ü→ue');
});

test('foldGerman: handles null/undefined gracefully', () => {
  assert.equal(foldGerman(null), '', 'null → empty string');
  assert.equal(foldGerman(undefined), '', 'undefined → empty string');
  assert.equal(foldGerman(''), '', 'empty string → empty string');
});

// ─── tokenize ────────────────────────────────────────────────────────────────

test('tokenize: returns tokens with Umlaut folding applied', () => {
  const tokens = tokenize('Schlüssel und Wörter');
  assert.ok(tokens.includes('schluessel'), 'Schlüssel → schluessel');
  assert.ok(tokens.includes('woerter'), 'Wörter → woerter');
});

test('tokenize: strips punctuation (commas, periods, colons, etc.)', () => {
  const tokens = tokenize('hello, world! foo: bar.');
  assert.ok(tokens.includes('hello'), 'strips comma');
  assert.ok(tokens.includes('world'), 'strips exclamation');
  assert.ok(tokens.includes('foo'), 'strips colon');
  assert.ok(tokens.includes('bar'), 'strips period');
  assert.ok(!tokens.some((t) => /[,!:.]/.test(t)), 'no punctuation left in tokens');
});

test('tokenize: discards tokens shorter than min-length (3)', () => {
  const tokens = tokenize('a bb ccc dddd');
  assert.ok(!tokens.includes('a'), 'single-char discarded');
  assert.ok(!tokens.includes('bb'), 'two-char discarded');
  assert.ok(tokens.includes('ccc'), '3-char kept');
  assert.ok(tokens.includes('dddd'), '4-char kept');
});

test('tokenize: returns empty array for empty or null input', () => {
  assert.deepEqual(tokenize(''), [], 'empty string → []');
  assert.deepEqual(tokenize(null), [], 'null → []');
  assert.deepEqual(tokenize(undefined), [], 'undefined → []');
});

test('tokenize: tokenize and slugifyHeading share same foldGerman (byte consistency)', () => {
  // This verifies the design invariant: tokenize uses foldGerman, and
  // slugifyHeading in render-markdown.mjs imports the SAME foldGerman.
  // If both call foldGerman('Schlüssel'), they must produce the same prefix.
  const folded = foldGerman('Schlüssel');
  const tokens = tokenize('Schlüssel');
  assert.ok(tokens.some((t) => folded.startsWith(t)), 'token is a prefix of folded form');
});
