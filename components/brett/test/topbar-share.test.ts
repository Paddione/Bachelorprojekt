import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareButtonVisible } from '../src/client/ui/topbar-share';

test('FA-BRT-E1a: shareButtonVisible true for leiter', () => {
  assert.equal(shareButtonVisible('leiter', false), true);
});
test('FA-BRT-E1b: shareButtonVisible true for admin regardless of role', () => {
  assert.equal(shareButtonVisible('beobachter', true), true);
  assert.equal(shareButtonVisible(undefined, true), true);
});
test('FA-BRT-E1c: shareButtonVisible false for non-leiter non-admin', () => {
  assert.equal(shareButtonVisible('beobachter', false), false);
  assert.equal(shareButtonVisible('stellvertreter', false), false);
  assert.equal(shareButtonVisible(undefined, false), false);
});
