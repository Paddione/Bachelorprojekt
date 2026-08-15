// brett/test/primitives.test.ts — Phase A / A3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  panelClass, buttonClass, fieldClass, drawerClass, rosterItemClass, badgeClass,
  primitivesCss,
  Panel, Button, Field, Drawer, RosterItem, Badge,
} from '../src/client/ui/primitives';

test('buttonClass maps variant options to BEM-ish strings', () => {
  assert.equal(buttonClass({ variant: 'primary' }), 'brett-btn brett-btn--primary');
  assert.equal(buttonClass({}), 'brett-btn');
  assert.equal(buttonClass({ variant: 'ghost' }), 'brett-btn brett-btn--ghost');
});

test('badge/panel class helpers produce expected modifiers', () => {
  assert.ok(badgeClass({ tone: 'leiter' }).includes('brett-badge--leiter'));
  assert.ok(panelClass({ pad: true }).includes('brett-panel'));
});

test('primitivesCss styles every primitive via brett tokens (no raw hex)', () => {
  const css = primitivesCss();
  assert.equal(typeof css, 'string');
  for (const sel of [
    '.brett-panel{', '.brett-btn{', '.brett-field{',
    '.brett-drawer{', '.brett-roster-item{', '.brett-badge{',
  ]) {
    assert.ok(css.includes(sel), `primitivesCss() missing "${sel}"`);
  }
  assert.ok(css.includes('var(--brett-'), 'must consume A1 tokens via var(--brett-*)');
  // brand color/typo/radius must be token-driven, never raw mentolder hex
  assert.ok(!/#0b111c|#101826|#eef1f3/.test(css), 'no hardcoded brand hex allowed');
});

test('DOM factories are exported as functions', () => {
  for (const fn of [Panel, Button, Field, Drawer, RosterItem, Badge]) {
    assert.equal(typeof fn, 'function');
  }
});

test('class helpers are deterministic', () => {
  assert.equal(fieldClass({}), 'brett-field');
  assert.equal(drawerClass({}), 'brett-drawer');
  assert.equal(rosterItemClass({}), 'brett-roster-item');
  assert.equal(rosterItemClass({ active: true }), 'brett-roster-item brett-roster-item--active');
});
