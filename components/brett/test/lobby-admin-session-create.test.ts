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

// REG: when _playerId is unset (no active session at join time), resolvePlayerId falls
// back to _session.userId so the creator uses their OIDC UUID, not their display name.
test('admin_session_create uses _session.userId when _playerId is unset', async () => {
  const room = 'admin-create-oidc-fallback';
  const collected: any[] = [];
  const ws = { _playerId: undefined, _session: { name: 'Coach OIDC', userId: 'oidc-uuid-42' }, send: () => {} };

  await handleAdminMessage(ws, { type: 'admin_session_create' }, room, makeDeps(collected));

  const parts = listParticipants(room);
  assert.strictEqual(parts.some((p: any) => p.userId === 'oidc-uuid-42'), true,
    'creator must be keyed by OIDC userId, not by display name');
  assert.strictEqual(parts.some((p: any) => p.userId === 'Coach OIDC'), false,
    'display name must not be used as userId');

  const join = collected.find((m: any) => m.type === 'presence_join');
  assert.ok(join, 'expected a presence_join broadcast');
  assert.strictEqual(join.participant.userId, 'oidc-uuid-42');
  assert.strictEqual(join.participant.role, 'leiter');
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
