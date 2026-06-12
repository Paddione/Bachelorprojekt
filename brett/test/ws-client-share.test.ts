import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncUrl } from '../src/client/ws-client';

test('FA-BRT-D1a: buildSyncUrl forwards room + playerId', () => {
  const u = buildSyncUrl('?room=r1', 'localhost:3000', 'http:', 'u1');
  assert.equal(u, 'ws://localhost:3000/sync?room=r1&playerId=u1');
});

test('FA-BRT-D1b: buildSyncUrl forwards share_token and omits anon playerId', () => {
  const u = buildSyncUrl('?room=r1&share_token=tok', 'host:3000', 'https:', 'anon');
  assert.equal(u, 'wss://host:3000/sync?room=r1&share_token=tok');
});

test('FA-BRT-D1c: buildSyncUrl defaults room to "default" when absent', () => {
  const u = buildSyncUrl('', 'h', 'http:', 'anon');
  assert.equal(u, 'ws://h/sync?room=default');
});
