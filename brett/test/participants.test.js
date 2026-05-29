// brett/test/participants.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { addParticipant, removeParticipant, listParticipants } = require('../server.js');

test('addParticipant is idempotent per userId and assigns a colour', () => {
  const room = 'part-test-1';
  addParticipant(room, { userId: 'u1', name: 'Coach' });
  addParticipant(room, { userId: 'u1', name: 'Coach' });
  addParticipant(room, { userId: 'u2', name: 'Anna' });
  const list = listParticipants(room);
  assert.strictEqual(list.length, 2);
  assert.ok(list[0].color);
  assert.notStrictEqual(list[0].color, list[1].color);
});

test('removeParticipant drops the entry', () => {
  const room = 'part-test-2';
  addParticipant(room, { userId: 'u1', name: 'Coach' });
  removeParticipant(room, 'u1');
  assert.strictEqual(listParticipants(room).length, 0);
});
