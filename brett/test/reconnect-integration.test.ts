// brett/test/reconnect-integration.test.ts — SEC-1 / REG-3 / CP-1 regression
//
// The late-join reconnect guard (409 on a true reconnect during an active round)
// was DEAD in production: roomPreviousPlayers was only ever written from a
// `player_join` relay branch that was unreachable (player_join ∉ RELAY_TYPES, no
// client ever sent it). The old reconnect-guard.test.ts faked the state by
// calling trackPlayerInRoom() by hand, so it never exercised the live path.
//
// This test drives the REAL message path: a `join` over the actual `wss`
// (attachWsServer) during an `active` session must register the player, so a
// SUBSEQUENT connect with the same ?playerId= is rejected (409) by
// shouldRejectReconnect — proving the guard fires end-to-end.

import { test } from 'node:test';
import assert from 'node:assert';
import { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import {
  server,
  applyMutation,
  registerSessionCode,
  shouldRejectReconnect,
  wasPreviouslyInRoom,
} from '../src/server/index';

function listen(): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => resolve((server.address() as AddressInfo).port));
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

test('SEC-1/REG-3: a live join during an active session arms the 409 reconnect guard', async () => {
  const room = 'reconnect-int-room';
  const playerId = 'paddione-int';

  // Seed an ACTIVE session so the join handler tracks presence + the guard is armed.
  registerSessionCode('RCI-001', room);
  applyMutation(room, { type: 'session_code_set', code: 'RCI-001' });
  applyMutation(room, { type: 'session_phase_set', phase: 'active' });

  const port = await listen();

  // Pre-condition: the player was never in this room → first connect is admitted.
  assert.strictEqual(wasPreviouslyInRoom(room, playerId), false, 'not yet tracked');
  assert.strictEqual(shouldRejectReconnect(room, playerId).reject, false, 'first connect admitted');

  // First (legitimate late-join) connection — the REAL handshake + join frame.
  const url = `ws://127.0.0.1:${port}/sync?room=${room}&playerId=${playerId}`;
  const ws1 = new WebSocket(url);
  await waitOpen(ws1);
  // Wait for the snapshot reply, which is sent at the END of the join handler —
  // i.e. AFTER trackPlayerInRoom has run on the live path.
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no snapshot within 3s')), 3000);
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'snapshot') { clearTimeout(t); resolve(); }
    });
    ws1.send(JSON.stringify({ type: 'join', room, playerId }));
  });

  // The live join populated roomPreviousPlayers → a true reconnect is now rejected.
  assert.strictEqual(wasPreviouslyInRoom(room, playerId), true, 'live join tracked the player');
  const decision = shouldRejectReconnect(room, playerId);
  assert.strictEqual(decision.reject, true, 'true reconnect during active round rejected');
  assert.strictEqual(decision.code, 409, '409 Conflict');

  // A genuine NEW late-joiner is still admitted (the guard is reconnect-specific).
  assert.strictEqual(shouldRejectReconnect(room, 'newcomer-int').reject, false, 'real late-joiner admitted');

  ws1.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
