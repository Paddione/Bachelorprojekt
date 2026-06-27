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

test('editorialCss: is a dark brand theme with Geist + Instrument Serif', () => {
  const css = editorialCss();
  assert.ok(css.includes('Geist'), 'uses Geist sans stack');
  assert.ok(css.includes('Instrument Serif'), 'uses Instrument Serif heading stack');
  assert.ok(css.includes('#0b111c'), 'dark page background token present');
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

test('clientJs: wires search-index.json and a copy-button handler', () => {
  const js = clientJs();
  // Phase 2.2: search client was switched from search.json to search-index.json
  // (ranked inverted-index). search-client.mjs is the sole owner of this URL.
  assert.ok(js.includes('search-index.json'), 'fetches ./search-index.json');
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

// ── Task 4: graph interactivity (graphJs) + graph CSS ──────────────────────────
import { graphJs, graphCss } from './theme.mjs';

// ── Task 1: hub + skill-filter CSS and category filter JS ─────────────────────

test('graphJs: returns a syntactically valid script that wires neighbor highlighting', () => {
  const js = graphJs();
  assert.equal(typeof js, 'string', 'graphJs returns a string');
  assert.ok(js.length > 0, 'graphJs is non-empty');
  // Parses as a function body (no syntax errors) — does not execute it.
  assert.doesNotThrow(() => new Function(js), 'graphJs must parse as valid JS');
  // Reads the per-node neighbor list emitted by graph-svg.
  assert.ok(js.includes('data-neighbors'), 'graphJs references data-neighbors');
  // Hover-highlight toggles the dim/hl classes defined in graphCss.
  assert.ok(js.includes("'dim'") || js.includes('"dim"'), 'graphJs toggles the dim class');
  assert.ok(js.includes("'hl'") || js.includes('"hl"'), 'graphJs toggles the hl class');
  // Pointer + wheel interactivity (pan/zoom + hover) is present.
  assert.ok(js.includes('pointerover'), 'graphJs listens for pointerover');
  assert.ok(js.includes('wheel'), 'graphJs implements wheel-zoom');
});

test('clientJs: composes graphJs into the page client script', () => {
  const js = clientJs();
  assert.ok(js.includes('data-neighbors'), 'clientJs contains the graph code (data-neighbors)');
  // Still parses as a whole after composition.
  assert.doesNotThrow(() => new Function(js), 'composed clientJs must parse as valid JS');
  // Existing pieces survive composition (search overlay + copy buttons).
  assert.ok(js.includes('search-overlay'), 'clientJs keeps the search overlay code');
  assert.ok(js.includes('copy-btn'), 'clientJs keeps the copy-button code');
});

test('graphCss: exposes the dim/hl/region rules and is included in editorialCss', () => {
  const css = graphCss();
  assert.equal(typeof css, 'string', 'graphCss returns a string');
  assert.ok(css.includes('.dim'), 'graphCss defines a .dim rule');
  assert.ok(css.includes('.hl'), 'graphCss defines a .hl rule');
  assert.ok(css.includes('.graph-region'), 'graphCss defines region styling');
  assert.ok(css.includes('overflow:hidden'), 'graph container clips pan/zoom overflow');
  // editorialCss must surface the graph CSS so the single stylesheet covers the landing.
  assert.ok(editorialCss().includes('.dim'), 'editorialCss includes graphCss rules');
});

test('graphCss + pills reference theme variables, not raw light-theme hex', () => {
  const css = editorialCss();
  // the old light accent must be gone everywhere
  assert.ok(!css.includes('#2f6db5'), 'no leftover light-theme accent hex');
  assert.ok(css.includes('var(--accent)'), 'graph highlight uses --accent');
});

test('editorialCss: contains hub and skill-filter class hooks', () => {
  const css = editorialCss();
  assert.ok(css.includes('.hub-tiles'), '.hub-tiles grid');
  assert.ok(css.includes('.hub-tile'), '.hub-tile card');
  assert.ok(css.includes('.skill-star'), '.skill-star repo highlight');
  assert.ok(css.includes('.cat-filter-row'), '.cat-filter-row button strip');
  assert.ok(css.includes('.cat-filter-btn'), '.cat-filter-btn button');
  assert.ok(css.includes('.agent-group-header'), '.agent-group-header');
  assert.ok(css.includes('.doc-group-header'), '.doc-group-header');
});

test('clientJs: includes the category filter script', () => {
  const js = clientJs();
  assert.ok(js.includes('cat-filter-btn'), 'category filter JS included');
  assert.ok(js.includes('data-category'), 'references data-category attribute');
});
