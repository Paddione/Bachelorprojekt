import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCard } from './validate.mjs';

const good = [
  '<!-- @dsCard group="Colors" name="Surfaces" -->',
  '<!-- tokens:start --><style>:root{}</style><!-- tokens:end -->',
  '<!-- card:start --><style>.x{}</style><!-- card:end -->',
].join('\n');

test('a well-formed card has no problems', () => {
  assert.deepEqual(validateCard(good), []);
});

test('missing @dsCard first line is flagged', () => {
  const bad = '<html>\n' + good;
  assert.ok(validateCard(bad).some((p) => /first line/.test(p)));
});

test('empty group or name is flagged', () => {
  const bad = good.replace('group="Colors"', 'group=""');
  assert.ok(validateCard(bad).some((p) => /group/.test(p)));
});

test('un-injected token region (build not run) is flagged', () => {
  const bad = good.replace('<style>:root{}</style>', '');
  assert.ok(validateCard(bad).some((p) => /tokens/.test(p)));
});
