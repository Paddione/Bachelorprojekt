import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, sanitizeSvg } from './build-learning-assets.mjs';

const ok = {
  id: 'a.active', type: 'icon', register: 'technical', tone: 'active', concept: ['x'],
  formats: { svg: '/learning-assets/icon/a.svg' },
  brandable: { tokens: ['--la-accent'] }, a11y: { alt: 'A' },
  provenance: { source: 'generated:in-house', license: 'CC0-1.0', attribution: null },
};

test('accepts a valid entry', () => {
  const r = validateManifest({ assets: [ok] }, { exists: () => true });
  assert.equal(r.length, 1);
});
test('rejects a missing license', () => {
  const bad = { ...ok, provenance: { source: 'x', license: '', attribution: null } };
  assert.throws(() => validateManifest({ assets: [bad] }, { exists: () => true }), /provenance\.license required/);
});
test('rejects an invalid type', () => {
  const bad = { ...ok, type: 'gif' };
  assert.throws(() => validateManifest({ assets: [bad] }, { exists: () => true }), /invalid type/);
});
test('rejects a missing asset file', () => {
  assert.throws(() => validateManifest({ assets: [ok] }, { exists: () => false }), /file not found/);
});
test('rejects a duplicate id', () => {
  assert.throws(() => validateManifest({ assets: [ok, ok] }, { exists: () => true }), /duplicate id/);
});
test('sanitizeSvg strips <script> and on* handlers', () => {
  const clean = sanitizeSvg('<svg><script>alert(1)</script><circle onclick="x()" cx="1"/></svg>');
  assert.ok(!/script/i.test(clean));
  assert.ok(!/onclick/i.test(clean));
});
