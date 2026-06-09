// brett/test/lobby-admin-session-create.test.ts — T000544
import { test } from 'node:test';
import assert from 'node:assert';
import { handleAdminMessage } from '../src/server/ws-admin-commands';
import {
  addParticipant,
  listParticipants,
  clearParticipants,
  handleAdminSessionCreate,
  buildStateFromMutations,
  applyMutation,
} from '../src/server/index';

function makeDeps(collected: any[]) {
  return {
    rooms: new Map(),
    addParticipant,
    listParticipants,
    clearParticipants,
    handleAdminSessionCreate,
    buildStateFromMutations,
    applyMutation,
    schedulePersist: () => {},
    broadcast: (_room: string, msg: any) => collected.push(msg),
  } as any;
}

test('admin_session_create registers the creator as a leiter participant', async () => {
  const room = 'admin-create-creator';
  const collected: any[] = [];
  const ws = { _playerId: 'leader-1', _session: { name: 'Coach' }, send: () => {} };

  await handleAdminMessage(ws, { type: 'admin_session_create' }, room, makeDeps(collected));

  const parts = listParticipants(room);
  assert.strictEqual(parts.some((p: any) => p.userId === 'leader-1'), true);

  const join = collected.find((m) => m.type === 'presence_join');
  assert.ok(join, 'expected a presence_join broadcast');
  assert.strictEqual(join.participant.userId, 'leader-1');
  assert.strictEqual(join.participant.role, 'leiter');
  assert.strictEqual(join.participant.ready, false);
});

test('admin_session_create clears stale participants before adding the creator', async () => {
  const room = 'admin-create-stale';
  const collected: any[] = [];
  addParticipant(room, { userId: 'ghost', name: 'Ghost' });
  const ws = { _playerId: 'leader-2', _session: { name: 'Coach2' }, send: () => {} };

  await handleAdminMessage(ws, { type: 'admin_session_create' }, room, makeDeps(collected));

  const parts = listParticipants(room);
  assert.strictEqual(parts.some((p: any) => p.userId === 'ghost'), false);
  assert.strictEqual(parts.some((p: any) => p.userId === 'leader-2'), true);
});
