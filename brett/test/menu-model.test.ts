// brett/test/menu-model.test.ts — Phase A / A4
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuModel, isValidJoinCode } from '../src/client/ui/menu';

test('authenticated user sees "Neue Session"; identity line reflects the name', () => {
  const m = menuModel({ userId: 'u1', name: 'Anna', isAdmin: false });
  const ids = m.items.map((i) => i.id);
  assert.ok(ids.includes('new-session'));
  assert.ok(ids.includes('join'));
  assert.ok(ids.includes('saved'));
  assert.ok(ids.includes('settings'));
  assert.equal(m.identityLine, 'angemeldet als: Anna');
});

test('anon user omits "Neue Session" but keeps join/saved/settings', () => {
  const m = menuModel({ userId: 'anon', name: 'Teilnehmer', isAdmin: false });
  const ids = m.items.map((i) => i.id);
  assert.ok(!ids.includes('new-session'), '"Neue Session" requires authentication');
  assert.ok(ids.includes('join'));
  assert.ok(ids.includes('saved'));
  assert.ok(ids.includes('settings'));
});

test('isValidJoinCode accepts the 6-char session-code shape only', () => {
  assert.equal(isValidJoinCode('KRB-9A2'), true);
  assert.equal(isValidJoinCode('ABC-DEF'), true);
  assert.equal(isValidJoinCode(''), false);
  assert.equal(isValidJoinCode('xx'), false);
  assert.equal(isValidJoinCode('ABCDEF'), false); // missing dash
});

test('FE-4: saved + settings are disabled placeholders; join + new-session are active', () => {
  const m = menuModel({ userId: 'u1', name: 'Anna', isAdmin: false });
  const byId = Object.fromEntries(m.items.map((i) => [i.id, i]));
  assert.equal(byId['saved'].disabled, true, 'Gespeicherte Aufstellungen is disabled');
  assert.equal(byId['settings'].disabled, true, 'Einstellungen is disabled');
  assert.ok(!byId['join'].disabled, 'join stays active');
  assert.ok(!byId['new-session'].disabled, 'new-session stays active');
});

test('module imports under node without touching the DOM', () => {
  assert.equal(typeof menuModel, 'function');
  assert.equal(typeof isValidJoinCode, 'function');
});
