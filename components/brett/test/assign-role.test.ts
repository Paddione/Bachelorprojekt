// brett/test/assign-role.test.ts — Phase B / B11
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  handleAssignRole,
} from '../src/server/index';

function makeDeps(room: string, broadcasts: any[]) {
  return {
    listParticipants: (r: string) => buildParticipants(r),
    applyMutation,
    buildStateFromMutations,
    broadcast: (_r: string, m: any) => broadcasts.push(m),
    schedulePersist: () => {},
  };
  function buildParticipants(r: string) {
    return participantStore.get(r) ?? [];
  }
}

const participantStore = new Map<string, any[]>();

test('handleAssignRole: member target → writes roles_set + role_changed broadcast', () => {
  const room = 'assign-role-1';
  participantStore.set(room, [{ userId: 'u2', name: 'Ben', color: '#3fb950' }]);
  const broadcasts: any[] = [];
  const result = handleAssignRole(room, 'u2', 'stellvertreter', makeDeps(room, broadcasts));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).roles.u2, 'stellvertreter');
  const change = broadcasts.find((m: any) => m.type === 'role_changed');
  assert.ok(change);
  assert.strictEqual(change.userId, 'u2');
  assert.strictEqual(change.role, 'stellvertreter');
});

test('handleAssignRole: non-member target → not-in-room, no state change, no broadcast', () => {
  const room = 'assign-role-2';
  participantStore.set(room, [{ userId: 'u2', name: 'Ben', color: '#3fb950' }]);
  const broadcasts: any[] = [];
  const result = handleAssignRole(room, 'ghost', 'leiter', makeDeps(room, broadcasts));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'not-in-room');
  assert.strictEqual(buildStateFromMutations(room)?.roles, undefined, 'no roles written for non-member');
  assert.strictEqual(broadcasts.length, 0);
});

test('handleAssignRole: merges into existing __roles__ without clobbering', () => {
  const room = 'assign-role-3';
  participantStore.set(room, [
    { userId: 'u1', name: 'Anna', color: '#4ea1ff' },
    { userId: 'u2', name: 'Ben', color: '#3fb950' },
  ]);
  applyMutation(room, { type: 'roles_set', roles: { u1: 'leiter' } });
  const broadcasts: any[] = [];
  handleAssignRole(room, 'u2', 'beobachter', makeDeps(room, broadcasts));
  const roles = buildStateFromMutations(room).roles;
  assert.strictEqual(roles.u1, 'leiter', 'existing role preserved');
  assert.strictEqual(roles.u2, 'beobachter');
});

test('handleAssignRole: anon target rejected as not-in-room', () => {
  const room = 'assign-role-4';
  participantStore.set(room, [{ userId: 'anon', name: 'X', color: '#fff' }]);
  const broadcasts: any[] = [];
  const result = handleAssignRole(room, 'anon', 'leiter', makeDeps(room, broadcasts));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'not-in-room');
});
