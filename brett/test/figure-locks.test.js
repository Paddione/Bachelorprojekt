// brett/test/figure-locks.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks } = require('../server.js');

test('lock is granted once then denied until released', () => {
  const room = 'lock-test-1';
  assert.strictEqual(acquireFigureLock(room, 'f1', { userId: 'u1', name: 'A', color: '#fff' }), true);
  assert.strictEqual(acquireFigureLock(room, 'f1', { userId: 'u2', name: 'B', color: '#000' }), false);
  assert.strictEqual(releaseFigureLock(room, 'f1', 'u2'), false); // wrong owner
  assert.strictEqual(releaseFigureLock(room, 'f1', 'u1'), true);
  assert.strictEqual(acquireFigureLock(room, 'f1', { userId: 'u2', name: 'B', color: '#000' }), true);
});

test('releaseLocksForUser frees everything that user held', () => {
  const room = 'lock-test-2';
  acquireFigureLock(room, 'f1', { userId: 'u1', name: 'A', color: '#fff' });
  acquireFigureLock(room, 'f2', { userId: 'u1', name: 'A', color: '#fff' });
  releaseLocksForUser(room, 'u1');
  assert.strictEqual(listFigureLocks(room).length, 0);
});
