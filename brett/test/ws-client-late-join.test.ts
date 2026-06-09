// brett/test/ws-client-late-join.test.ts
// Offline-safe: tests the pure late-join decision helper, no WS, no DOM.
// Follows the snapshot-routing.test.ts pattern: stub globals, dynamic import.
import { test } from 'node:test';
import assert from 'node:assert';

(globalThis as any).location = { search: '', protocol: 'http:', host: 'x' };
(globalThis as any).window = {};
(globalThis as any).document = { getElementById: () => null };
(globalThis as any).WebSocket = { OPEN: 1, CONNECTING: 0, CLOSING: 2, CLOSED: 3 };

async function loadWs() {
  const state = await import('../src/client/state');
  state.setScene({ scene: { remove() {} } as any, renderer: {} as any, camera: {} as any, floor: {} as any });
  return import('../src/client/ws-client');
}

test('decideLateJoin: fires with name when phase is active', async () => {
  const ws = await loadWs();
  assert.deepStrictEqual(ws.decideLateJoin('active', { name: 'Carla' } as any), { notify: true, name: 'Carla' });
});

test('decideLateJoin: fires when phase is warmup or paused', async () => {
  const ws = await loadWs();
  assert.strictEqual(ws.decideLateJoin('warmup', { name: 'X' } as any).notify, true);
  assert.strictEqual(ws.decideLateJoin('paused', { name: 'Y' } as any).notify, true);
});

test('decideLateJoin: does NOT fire in lobby phase', async () => {
  const ws = await loadWs();
  assert.deepStrictEqual(ws.decideLateJoin('lobby', { name: 'Z' } as any), { notify: false, name: 'Z' });
});

test('decideLateJoin: does NOT fire when phase is null', async () => {
  const ws = await loadWs();
  assert.strictEqual(ws.decideLateJoin(null, { name: 'Z' } as any).notify, false);
});

test('decideLateJoin: does NOT fire when phase is ended', async () => {
  const ws = await loadWs();
  assert.strictEqual(ws.decideLateJoin('ended', { name: 'Z' } as any).notify, false);
});

test('decideLateJoin: falls back to "Unbekannt" when participant has no name', async () => {
  const ws = await loadWs();
  const r = ws.decideLateJoin('active', undefined as any);
  assert.deepStrictEqual(r, { notify: true, name: 'Unbekannt' });
});
