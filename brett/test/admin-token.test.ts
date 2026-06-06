// brett/test/admin-token.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  assignAdminToken,
  handoffAdminToken,
  releaseAdminToken,
  getAdminTokenHolder,
  beginTokenGrace,
  reclaimAdminToken,
  setRoomAdminPresence,
  handleAdminHandoffMessage,
} from '../src/server/index';

test('assignAdminToken: sets holder when none exists', () => {
  const room = 'token-test-1';
  const result = assignAdminToken(room, 'paddione');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'paddione');
});

test('assignAdminToken: returns ok=false when holder already set (no force)', () => {
  const room = 'token-test-2';
  assignAdminToken(room, 'paddione');
  const result = assignAdminToken(room, 'gekko');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'paddione');
});

test('handoffAdminToken: holder paddione → gekko succeeds', () => {
  const room = 'token-test-3';
  assignAdminToken(room, 'paddione');
  const result = handoffAdminToken(room, 'paddione', 'gekko');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'gekko');
});

test('handoffAdminToken: rejects when fromPlayerId != current holder', () => {
  const room = 'token-test-4';
  assignAdminToken(room, 'paddione');
  const result = handoffAdminToken(room, 'gekko', 'paddione');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'not-current-holder');
});

test('releaseAdminToken: clears holder', () => {
  const room = 'token-test-5';
  assignAdminToken(room, 'paddione');
  releaseAdminToken(room);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, undefined);
});

test('beginTokenGrace: starts 30s timer; reclaim within window restores holder', async () => {
  const room = 'token-grace-1';
  assignAdminToken(room, 'paddione');
  beginTokenGrace(room, 'paddione', { timeoutMs: 100 }); // shortened for test
  // Within grace: holder still set
  assert.strictEqual(getAdminTokenHolder(room), 'paddione');
  // Reclaim before timeout
  reclaimAdminToken(room, 'paddione');
  await new Promise(r => setTimeout(r, 150));
  assert.strictEqual(getAdminTokenHolder(room), 'paddione', 'reclaim should keep holder');
});

test('beginTokenGrace: 30s expiry without reclaim → token released', async () => {
  const room = 'token-grace-2';
  assignAdminToken(room, 'paddione');
  beginTokenGrace(room, 'paddione', { timeoutMs: 50 });
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(getAdminTokenHolder(room), null, 'grace expired → released');
});

test('beginTokenGrace expiry: auto-claim to other admin present in room', async () => {
  const room = 'token-grace-3';
  assignAdminToken(room, 'paddione');
  // Simulate gekko present as admin in the room
  setRoomAdminPresence(room, ['paddione', 'gekko']);
  beginTokenGrace(room, 'paddione', { timeoutMs: 50 });
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(getAdminTokenHolder(room), 'gekko', 'gekko auto-claims after grace expiry');
});

test('handleAdminHandoffMessage: paddione hands off → gekko, broadcast fired', () => {
  const room = 'handoff-test-1';
  assignAdminToken(room, 'paddione');
  const broadcasts: any[] = [];
  const result = handleAdminHandoffMessage(room, 'paddione', 'gekko', (msg: any) => broadcasts.push(msg));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(getAdminTokenHolder(room), 'gekko');
  assert.deepStrictEqual(broadcasts, [{
    type: 'admin_token_changed', holderPlayerId: 'gekko', reason: 'handoff'
  }]);
});
