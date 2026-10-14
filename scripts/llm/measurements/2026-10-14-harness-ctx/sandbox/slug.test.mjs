// Verifikation des Harness-Vergleichs: gruen = Aufgabe geloest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slug.mjs';

test('kleinschreibung und bindestriche', () => {
  assert.equal(slugify('Hallo Welt'), 'hallo-welt');
});
test('umlaute und eszett', () => {
  assert.equal(slugify('Größe über Maß'), 'groesse-ueber-mass');
  assert.equal(slugify('ÄÖÜ'), 'aeoeue');
});
test('sonderzeichen zusammenfassen, raender trimmen', () => {
  assert.equal(slugify('  --Foo!!  Bar__baz--  '), 'foo-bar-baz');
});
test('leer bleibt leer', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});
