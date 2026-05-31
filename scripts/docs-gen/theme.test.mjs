// scripts/docs-gen/theme.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editorialCss,
  clientJs,
  SUBST_JS,
  COPY_JS,
  DIAGRAM_JS,
  SEARCH_JS,
} from './theme.mjs';

test('editorialCss: returns a non-empty string', () => {
  const css = editorialCss();
  assert.equal(typeof css, 'string');
  assert.ok(css.length > 0, 'css must not be empty');
});

test('editorialCss: contains the contract class hooks', () => {
  const css = editorialCss();
  assert.ok(css.includes('.provenance-badge'), 'must style .provenance-badge');
  assert.ok(css.includes('.xref'), 'must style .xref cross-link pills');
  assert.ok(css.includes('.section-card'), 'must style .section-card grid items');
});

test('editorialCss: styles repo vs plugin provenance variants', () => {
  const css = editorialCss();
  assert.ok(css.includes('.provenance-badge.repo'), 'repo variant');
  assert.ok(css.includes('.provenance-badge.plugin'), 'plugin variant');
});

test('editorialCss: is a light editorial theme with Inter + Merriweather', () => {
  const css = editorialCss();
  assert.ok(css.includes('Inter'), 'uses Inter sans stack');
  assert.ok(css.includes('Merriweather'), 'uses Merriweather serif stack');
  assert.ok(css.includes('.diagram-svg-wrapper'), 'styles diagram wrapper');
  assert.ok(css.includes('.diagram-fallback'), 'styles diagram fallback');
  assert.ok(css.includes('.toc-box'), 'styles toc box');
  assert.ok(css.includes('#search-overlay'), 'styles search overlay');
});

test('clientJs: returns a string that parses as valid JavaScript', () => {
  const js = clientJs();
  assert.equal(typeof js, 'string');
  assert.ok(js.length > 0, 'js must not be empty');
  assert.doesNotThrow(() => new Function(js), 'clientJs must be syntactically valid JS');
});

test('clientJs: wires search.json and a copy-button handler', () => {
  const js = clientJs();
  assert.ok(js.includes('search.json'), 'fetches ./search.json');
  assert.ok(js.includes('.copy-btn'), 'attaches a copy-button handler');
  assert.ok(js.includes('clipboard'), 'copies to clipboard');
});

test('clientJs: composes the exported named pieces', () => {
  const js = clientJs();
  for (const piece of [SUBST_JS, COPY_JS, DIAGRAM_JS, SEARCH_JS]) {
    assert.equal(typeof piece, 'string');
    assert.ok(piece.length > 0, 'each piece must be a non-empty string');
    assert.ok(js.includes(piece), 'clientJs must include each named piece verbatim');
  }
});
