import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectRegion, svgGrid } from './build.mjs';

test('injectRegion fills a start/end region', () => {
  const html = 'A<!-- tokens:start --><!-- tokens:end -->B';
  const out = injectRegion(html, 'tokens', '<style>X</style>');
  assert.equal(out, 'A<!-- tokens:start --><style>X</style><!-- tokens:end -->B');
});

test('injectRegion is idempotent (re-run replaces, not appends)', () => {
  const html = 'A<!-- tokens:start --><!-- tokens:end -->B';
  const once = injectRegion(html, 'tokens', 'P1');
  const twice = injectRegion(once, 'tokens', 'P2');
  assert.equal(twice, 'A<!-- tokens:start -->P2<!-- tokens:end -->B');
  assert.equal((twice.match(/tokens:start/g) || []).length, 1);
});

test('injectRegion throws if region markers are missing', () => {
  assert.throws(() => injectRegion('no markers', 'tokens', 'P'), /tokens:start/);
});

test('svgGrid inlines each svg as a labelled cell', () => {
  const grid = svgGrid(new URL('./assets/props', import.meta.url).pathname);
  assert.match(grid, /<svg/);
  assert.match(grid, /icon-cell/);
});
