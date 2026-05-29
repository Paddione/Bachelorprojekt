import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocks } from '../public/assets/coaching/locks.mjs';

test('acquire grants only when unheld', () => {
  const l = createLocks();
  assert.equal(l.acquire('fig-1', { userId: 'u1', name: 'A', color: '#fff' }), true);
  assert.equal(l.acquire('fig-1', { userId: 'u2', name: 'B', color: '#000' }), false);
  assert.equal(l.owner('fig-1').userId, 'u1');
});

test('release only by the owner', () => {
  const l = createLocks();
  l.acquire('fig-1', { userId: 'u1', name: 'A', color: '#fff' });
  assert.equal(l.release('fig-1', 'u2'), false);
  assert.equal(l.release('fig-1', 'u1'), true);
  assert.equal(l.owner('fig-1'), null);
});

test('releaseAllFor drops every lock held by a user', () => {
  const l = createLocks();
  l.acquire('fig-1', { userId: 'u1', name: 'A', color: '#fff' });
  l.acquire('fig-2', { userId: 'u1', name: 'A', color: '#fff' });
  l.acquire('fig-3', { userId: 'u2', name: 'B', color: '#000' });
  l.releaseAllFor('u1');
  assert.equal(l.owner('fig-1'), null);
  assert.equal(l.owner('fig-2'), null);
  assert.equal(l.owner('fig-3').userId, 'u2');
});

test('replaceAll rehydrates from a snapshot list', () => {
  const l = createLocks();
  l.replaceAll([{ figureId: 'fig-9', userId: 'u5', name: 'Z', color: '#abc' }]);
  assert.equal(l.owner('fig-9').userId, 'u5');
});
