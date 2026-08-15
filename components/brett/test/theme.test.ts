// brett/test/theme.test.ts — Phase A / A1
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, themeCss } from '../src/client/ui/theme';

test('tokens mirror the mentolder brand SSOT (website/src/styles/global.css)', () => {
  assert.equal(tokens.color.ink900, '#0b111c');
  assert.equal(tokens.color.surface, '#101826');
  assert.equal(tokens.color.fg, '#eef1f3');
  assert.equal(tokens.color.mute, '#8c96a3');
  assert.equal(tokens.color.brass, 'oklch(0.80 0.09 75)');
  assert.equal(tokens.color.line, 'rgba(255, 255, 255, 0.07)');
  assert.ok(tokens.font.sans.includes('Geist'));
  assert.equal(tokens.radius, '22px');
});

test('themeCss() emits every --brett-* var Phase A consumes', () => {
  const css = themeCss();
  assert.equal(typeof css, 'string');
  for (const needle of [
    '--brett-ink-900:#0b111c',
    '--brett-surface:',
    '--brett-surface-hover:',
    '--brett-fg:',
    '--brett-fg-soft:',
    '--brett-mute:',
    '--brett-brass:',
    '--brett-brass-dim:',
    '--brett-line:',
    '--brett-line-2:',
    '--brett-radius:22px',
    '--brett-font-sans:',
  ]) {
    assert.ok(css.includes(needle), `themeCss() missing "${needle}"`);
  }
});

test('module imports under node without touching the DOM', () => {
  // If theme.ts read `document` at top level this import would already have thrown.
  assert.equal(typeof themeCss, 'function');
});
