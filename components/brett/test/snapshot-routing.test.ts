// brett/test/snapshot-routing.test.ts — FE-2 regression
//
// The join `snapshot` is the FIRST (and often ONLY) state a client receives on
// connect. Before this fix the ws-client `snapshot` case mutated only the
// Three.js scene and never routed the authoritative phase/sessionCode/roster
// through the lobby reducer + view-machine — so a `?room=`/`/api/join` joiner
// into a `lobby`-phase session was dropped onto empty board chrome.
//
// This test drives the REAL client router (`onWsMessage`) — not the reducer in
// isolation — and asserts the join snapshot routes the phase to the
// view-machine and seeds the roster. ws-client touches `location`/`document`/
// `WebSocket` at module load, so those are stubbed before the dynamic import;
// node:test runs each file in its own process, so the global stubs do not leak.

import { test } from 'node:test';
import assert from 'node:assert';

(globalThis as any).location = { search: '', protocol: 'http:', host: 'x' };
(globalThis as any).window = {};
(globalThis as any).document = { getElementById: () => null };
(globalThis as any).WebSocket = { OPEN: 1, CONNECTING: 0, CLOSING: 2, CLOSED: 3 };

async function loadRouter() {
  const state = await import('../src/client/state');
  // Minimal scene stub so the snapshot case's scene rebuild does not throw.
  state.setScene({ scene: { remove() {} } as any, renderer: {} as any, camera: {} as any, floor: {} as any });
  return import('../src/client/ws-client');
}

test('FE-2: onWsMessage(snapshot{phase:lobby}) drives onPhaseChange(lobby)', async () => {
  const ws = await loadRouter();
  const phases: (string | null)[] = [];
  ws.setPhaseChangeHandler((p) => phases.push(p));
  ws.onWsMessage({
    data: JSON.stringify({ type: 'snapshot', figures: [], phase: 'lobby', sessionCode: 'KRB-9A2' }),
  } as any);
  assert.deepStrictEqual(phases, ['lobby'], 'join snapshot routes the authoritative phase to the view-machine');
  assert.strictEqual(ws.getLobbyState().phase, 'lobby');
  assert.strictEqual(ws.getLobbyState().sessionCode, 'KRB-9A2');
});

test('FE-2/REG-6: snapshot participants seed the lobby roster with roles', async () => {
  const ws = await loadRouter();
  const changes: number[] = [];
  ws.setLobbyChangeHandler((s) => changes.push(Object.keys(s.roster).length));
  ws.onWsMessage({
    data: JSON.stringify({
      type: 'snapshot',
      figures: [],
      phase: 'lobby',
      sessionCode: 'AAA-BBB',
      participants: [
        { userId: 'u1', name: 'Anna', color: '#4ea1ff', role: 'leiter' },
        { userId: 'u2', name: 'Ben', color: '#3fb950' },
      ],
    }),
  } as any);
  const lobby = ws.getLobbyState();
  assert.strictEqual(lobby.roster.u1.role, 'leiter', 'persisted role merged into roster on join');
  assert.strictEqual(lobby.roster.u2.name, 'Ben');
  assert.ok(changes.length >= 1, 'onLobbyChange fired so the lobby UI re-renders');
});

test('FE-2: a snapshot with no phase change does not spuriously route', async () => {
  const ws = await loadRouter();
  // First snapshot establishes lobby.
  ws.onWsMessage({ data: JSON.stringify({ type: 'snapshot', figures: [], phase: 'lobby' }) } as any);
  const phases: (string | null)[] = [];
  ws.setPhaseChangeHandler((p) => phases.push(p));
  // Second snapshot with the SAME phase must not fire onPhaseChange again.
  ws.onWsMessage({ data: JSON.stringify({ type: 'snapshot', figures: [], phase: 'lobby' }) } as any);
  assert.deepStrictEqual(phases, [], 'no phase change → no view-machine churn');
});
