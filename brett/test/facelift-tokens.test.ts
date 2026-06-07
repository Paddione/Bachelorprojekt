// brett/test/facelift-tokens.test.ts — Phase E / E2 + E4 + E5
//
// Region-scoped guard: after stripping every `var(…)` expression from a CSS
// region, no standalone hex literal (#xxx or #xxxxxx) should remain.
// Hex is only permitted as the FALLBACK argument of `var(--token, #hex)`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HTML_PATH = resolve(import.meta.dirname, '../public/index.html');

function loadHtml(): string {
  return readFileSync(HTML_PATH, 'utf8');
}

/**
 * Extracts the CSS text between `startMarker` and `endMarker` (exclusive).
 * Both markers are literal substrings searched in the raw HTML.
 */
function sliceRegion(html: string, startMarker: string, endMarker: string): string {
  const start = html.indexOf(startMarker);
  const end   = html.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `start marker not found: ${JSON.stringify(startMarker)}`);
  assert.ok(end   >= 0, `end marker not found after start: ${JSON.stringify(endMarker)}`);
  return html.slice(start + startMarker.length, end);
}

/**
 * Strips every `var(…)` expression (including nested parens) from CSS text,
 * then asserts that no standalone hex literal remains.
 */
function assertNoStandaloneHex(region: string, regionName: string): void {
  // Remove var(…) expressions (handles nested parens up to depth 3)
  let stripped = region.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '');
  // Also strip url(…) to avoid false positives in data URIs
  stripped = stripped.replace(/url\([^)]*\)/g, '');
  // Standalone hex: # followed by 3–8 hex digits not preceded by % (URL encoding)
  const hexMatch = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(
    hexMatch,
    null,
    `[${regionName}] standalone hex found after var()-strip: ${hexMatch?.[0]}\n` +
    `Offending context: …${stripped.slice(Math.max(0, stripped.indexOf(hexMatch?.[0] ?? '') - 40), stripped.indexOf(hexMatch?.[0] ?? '') + 60)}…`,
  );
}

// ── E2 guard: Appearance Drawer ─────────────────────────────────────────────

test('E2: appearance-drawer region uses only var(--token, #fallback) — no standalone hex', () => {
  const html = loadHtml();
  const region = sliceRegion(html, '/* ── Appearance Drawer', '/* ── Hauptmenü');
  assertNoStandaloneHex(region, 'Appearance Drawer');
});

test('E2: appearance-drawer region references expected tokens', () => {
  const html = loadHtml();
  const region = sliceRegion(html, '/* ── Appearance Drawer', '/* ── Hauptmenü');
  assert.ok(region.includes('var(--slate-1'),   'must reference --slate-1');
  assert.ok(region.includes('var(--brass'),     'must reference --brass');
  assert.ok(region.includes('var(--parchment'), 'must reference --parchment');
  assert.ok(region.includes('var(--radius-'),   'must reference --radius-*');
});

// ── E4 guard: Topbar chrome ─────────────────────────────────────────────────

test('E4: topbar-chrome region uses only var(--token, #fallback) — no standalone hex', () => {
  const html = loadHtml();
  const region = sliceRegion(html, '/* ── Topbar chrome (Phase E)', '/* ── Character-Editor Panel');
  assertNoStandaloneHex(region, 'Topbar chrome');
});

test('E4: topbar-chrome region references expected tokens', () => {
  const html = loadHtml();
  const region = sliceRegion(html, '/* ── Topbar chrome (Phase E)', '/* ── Character-Editor Panel');
  assert.ok(region.includes('var(--brass'),     'must reference --brass');
  assert.ok(region.includes('var(--parchment'), 'must reference --parchment');
  assert.ok(region.includes('var(--slate'),     'must reference --slate');
});

// ── E5 guard: Remaining panels ───────────────────────────────────────────────

test('E5: remaining-panels region uses only var(--token, #fallback) — no standalone hex', () => {
  const html = loadHtml();
  const region = sliceRegion(html, '/* ── Remaining panels (Phase E)', '/* ── Hauptmenü');
  assertNoStandaloneHex(region, 'Remaining panels');
});

test('E5: remaining-panels region references expected tokens', () => {
  const html = loadHtml();
  const region = sliceRegion(html, '/* ── Remaining panels (Phase E)', '/* ── Hauptmenü');
  assert.ok(region.includes('var(--slate'),     'must reference --slate');
  assert.ok(region.includes('var(--brass'),     'must reference --brass');
  assert.ok(region.includes('var(--parchment'), 'must reference --parchment');
});

// ── E5 guard: persons.ts has no structural hex in buildPersonsPanel ──────────

test('E5: persons.ts buildPersonsPanel has no standalone structural hex in cssText', () => {
  const src = readFileSync(
    resolve(import.meta.dirname, '../src/client/ui/persons.ts'),
    'utf8',
  );
  // Find buildPersonsPanel function body (between its opening brace and the next
  // exported function or end of file).
  const fnStart = src.indexOf('export function buildPersonsPanel');
  assert.ok(fnStart >= 0, 'buildPersonsPanel not found in persons.ts');
  // Slice up to initPersons (the next export after buildPersonsPanel)
  const fnEnd = src.indexOf('\nexport', fnStart + 1);
  const fnBody = fnEnd >= 0 ? src.slice(fnStart, fnEnd) : src.slice(fnStart);
  // The only allowed hex is the data-driven ${p.color} interpolation — not a literal.
  // Strip template literal ${…} expressions
  const stripped = fnBody.replace(/\$\{[^}]+\}/g, 'DATA');
  const hexMatch = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(
    hexMatch,
    null,
    `buildPersonsPanel contains a structural hex literal: ${hexMatch?.[0]}`,
  );
});
