import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, PRESENCE_PALETTE } from '../public/assets/coaching/presence.mjs';

test('join assigns a stable colour and lists participants', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  pr.join({ userId: 'u2', name: 'Anna' });
  const list = pr.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].color, PRESENCE_PALETTE[0]);
  assert.equal(list[1].color, PRESENCE_PALETTE[1]);
});

test('re-join is idempotent (same userId keeps one entry + colour)', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  const c1 = pr.get('u1').color;
  pr.join({ userId: 'u1', name: 'Coach Renamed' });
  assert.equal(pr.list().length, 1);
  assert.equal(pr.get('u1').color, c1);
  assert.equal(pr.get('u1').name, 'Coach Renamed');
});

test('leave removes the participant and clears their holds', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  pr.setHold('fig-1', 'u1');
  pr.leave('u1');
  assert.equal(pr.list().length, 0);
  assert.equal(pr.holderOf('fig-1'), null);
});

test('setHold / clearHold track who holds which figure', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  pr.setHold('fig-1', 'u1');
  assert.equal(pr.holderOf('fig-1'), 'u1');
  pr.clearHold('fig-1');
  assert.equal(pr.holderOf('fig-1'), null);
});
