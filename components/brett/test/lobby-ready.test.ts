// brett/test/lobby-ready.test.ts — Phase B / B12
import { test } from 'node:test';
import assert from 'node:assert';
import {
  handleLobbySetReady,
  wsHandler,
} from '../src/server/index';

test('handleLobbySetReady: ready=true → lobby_ready_changed broadcast keyed on resolvePlayerId', () => {
  const ws = { _session: { userId: 'oidc-u1' }, _room: 'lobby-ready-1' };
  const broadcasts: any[] = [];
  const deps = { broadcast: (_r: string, m: any) => broadcasts.push(m) };
  handleLobbySetReady(ws, { type: 'lobby_set_ready', ready: true }, deps as any);
  assert.strictEqual(broadcasts.length, 1);
  assert.deepStrictEqual(broadcasts[0], { type: 'lobby_ready_changed', userId: 'oidc-u1', ready: true });
});

test('handleLobbySetReady: ready=false → lobby_ready_changed{ready:false}', () => {
  const ws = { _playerId: 'p2', _room: 'lobby-ready-2' };
  const broadcasts: any[] = [];
  const deps = { broadcast: (_r: string, m: any) => broadcasts.push(m) };
  handleLobbySetReady(ws, { type: 'lobby_set_ready', ready: false }, deps as any);
  assert.deepStrictEqual(broadcasts[0], { type: 'lobby_ready_changed', userId: 'p2', ready: false });
});

test('lobby_set_ready is NOT privileged (not in ADMIN_TYPES) and NOT a relay (not in RELAY_TYPES)', () => {
  assert.strictEqual(wsHandler.ADMIN_TYPES.has('lobby_set_ready'), false);
  assert.strictEqual(wsHandler.RELAY_TYPES.has('lobby_set_ready'), false);
});
