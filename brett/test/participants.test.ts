// brett/test/participants.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { addParticipant, removeParticipant, listParticipants, clearParticipants } from '../src/server/index';

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

test('clearParticipants empties the room roster', () => {
  const room = 'clear-participants-room';
  addParticipant(room, { userId: 'a', name: 'A' });
  addParticipant(room, { userId: 'b', name: 'B' });
  assert.strictEqual(listParticipants(room).length, 2);
  clearParticipants(room);
  assert.strictEqual(listParticipants(room).length, 0);
});
