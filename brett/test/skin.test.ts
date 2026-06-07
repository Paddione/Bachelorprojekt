// brett/test/skin.test.ts — Phase E / E1 + E3
// Pure unit tests for skin.ts helpers. No DOM / Three.js / canvas required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveToken, lockBadgeStyle, placeholderSvg } from '../src/client/ui/skin.js';

// ── E1: resolveToken ────────────────────────────────────────────────────────

test('resolveToken without getVar returns fallback', () => {
  assert.equal(resolveToken('--brass', '#c8a96e'), '#c8a96e');
});

test('resolveToken with getVar returning the token value returns trimmed value', () => {
  const result = resolveToken('--brass', '#c8a96e', (n) => n === '--brass' ? ' #abcdef ' : '');
  assert.equal(result, '#abcdef');
});

test('resolveToken with getVar returning empty string returns fallback', () => {
  const result = resolveToken('--brass', '#c8a96e', () => '');
  assert.equal(result, '#c8a96e');
});

// ── E1: lockBadgeStyle ──────────────────────────────────────────────────────

test('lockBadgeStyle() defaults — bg=brass fallback, text=slate-0 fallback', () => {
  const s = lockBadgeStyle();
  assert.equal(s.bg, '#c8a96e');       // brass fallback (NOT legacy #4ea1ff)
  assert.equal(s.text, '#0e1014');     // slate-0 fallback (NOT legacy #161b22)
  assert.ok(s.font.includes('bold 24px'), `font must start with 'bold 24px', got: ${s.font}`);
  // font-sans fallback must contain a sans family
  assert.ok(
    s.font.includes('system-ui') || s.font.includes('sans'),
    `font must reference a sans family: ${s.font}`,
  );
});

test('lockBadgeStyle with explicit color passes it through unchanged', () => {
  assert.equal(lockBadgeStyle('#e06b6b').bg, '#e06b6b');
});

test('lockBadgeStyle with getVar resolver overrides brass default', () => {
  const s = lockBadgeStyle(undefined, (n) => n === '--brass' ? '#112233' : '');
  assert.equal(s.bg, '#112233');
});

// ── E3: placeholderSvg ──────────────────────────────────────────────────────

test("placeholderSvg('Keine', 'empty') returns a data URI with token fallback colors", () => {
  const uri = placeholderSvg('Keine', 'empty');
  assert.ok(uri.startsWith('data:image/svg+xml,'), 'must be a data URI');
  const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
  // Background: slate-1 fallback
  assert.ok(decoded.includes('#161922'), `decoded SVG must use slate-1 bg: ${decoded}`);
  // Text fill: parchment-3 fallback (#7c8071) — NOT legacy #666
  assert.ok(decoded.includes('#7c8071'), `decoded SVG must use parchment-3 text: ${decoded}`);
  assert.ok(!decoded.includes('#222'), `must not contain legacy #222: ${decoded}`);
  assert.ok(!decoded.includes('#666'), `must not contain legacy #666: ${decoded}`);
});

test("placeholderSvg('adult-average', 'body') embeds label text and token colors", () => {
  const uri = placeholderSvg('adult-average', 'body');
  const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
  // Background: slate-1 fallback (#161922, NOT #1a1f2a)
  assert.ok(decoded.includes('#161922'), `must use slate-1 bg: ${decoded}`);
  // Text fill: brass fallback
  assert.ok(decoded.includes('#c8a96e'), `must use brass text: ${decoded}`);
  // Label embedded
  assert.ok(decoded.includes('adult-average'), `must embed label text: ${decoded}`);
  assert.ok(!decoded.includes('#1a1f2a'), `must not contain legacy #1a1f2a: ${decoded}`);
});

test('placeholderSvg with getVar overrides fills via resolveToken', () => {
  const getVar = (n: string): string => {
    if (n === '--slate-1') return '#aabbcc';
    if (n === '--brass') return '#ddee00';
    return '';
  };
  const uri = placeholderSvg('test-body', 'body', getVar);
  const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
  assert.ok(decoded.includes('#aabbcc'), `bg must come from getVar: ${decoded}`);
  assert.ok(decoded.includes('#ddee00'), `text must come from getVar: ${decoded}`);
});

test('module imports under node without touching the DOM', () => {
  // If we got here, the module loaded without DOM/Three errors.
  assert.ok(true);
});
