// brett/test/admin-round-moderation.test.ts — T901934: round lifecycle + dim/freeze via handleAdminMessage
import { test } from 'node:test';
import assert from 'node:assert';
import { handleAdminMessage } from '../src/server/ws-admin-commands';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
} from '../src/server/index';

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function seedFigure(room: string, id: string) {
  applyMutation(room, { type: 'add', figure: { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  // Die Handler validieren gegen figureMaps — sicherstellen, dass die Figur
  // dort verzeichnet ist, egal welchen Pfad applyMutation intern nimmt.
  let m = figureMaps.get(room);
  if (!m) { m = new Map(); figureMaps.set(room, m); }
  if (!m.has(id)) m.set(id, { id });
}

function makeDeps(collected: any[], opts: {
  persistCount: { n: number };
  roundStartResult?: { ok: boolean; noop?: boolean } | null;
  flushCalls?: string[];
}) {
  const deps: any = {
    rooms: new Map(),
    figureMaps,
    applyMutation,
    buildStateFromMutations,
    handleAdminRoundStop: (room: string, emit: (m: any) => void) => emit({ type: 'round_stopped', room }),
    handleAdminRoundPause: (room: string, emit: (m: any) => void) => emit({ type: 'round_paused', room }),
    handleAdminRoundStart: (_room: string, emit: (m: any) => void) => {
      emit({ type: 'round_started' });
      return opts.roundStartResult === undefined ? { ok: true, noop: false } : opts.roundStartResult;
    },
    broadcast: (_room: string, msg: any) => collected.push(msg),
    schedulePersist: () => { opts.persistCount.n++; },
  };
  if (opts.flushCalls) {
    const calls = opts.flushCalls;
    deps.flushEventLog = async (room: string) => { calls.push(room); };
  }
  return deps;
}

function makeWs(sent: any[]) {
  return { send: (s: string) => sent.push(JSON.parse(s)) };
}

test('admin_round_stop → broadcast + persist + event-log flush', async () => {
  const room = 'rm-stop-1';
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const flushCalls: string[] = [];
  const deps = makeDeps(collected, { persistCount, flushCalls });

  await handleAdminMessage(makeWs([]), { type: 'admin_round_stop' }, room, deps);

  assert.ok(collected.some((m: any) => m.type === 'round_stopped'));
  assert.strictEqual(persistCount.n, 1);
  // flushEventLog läuft als fire-and-forget-Promise — einen Tick warten.
  await new Promise((r) => setTimeout(r, 10));
  assert.deepStrictEqual(flushCalls, [room]);
});

test('admin_round_stop without flushEventLog → no crash', async () => {
  const room = 'rm-stop-2';
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { persistCount });

  await handleAdminMessage(makeWs([]), { type: 'admin_round_stop' }, room, deps);

  assert.ok(collected.some((m: any) => m.type === 'round_stopped'));
  assert.strictEqual(persistCount.n, 1);
});

test('admin_round_pause → broadcast + persist', async () => {
  const room = 'rm-pause-1';
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { persistCount });

  await handleAdminMessage(makeWs([]), { type: 'admin_round_pause' }, room, deps);

  assert.ok(collected.some((m: any) => m.type === 'round_paused'));
  assert.strictEqual(persistCount.n, 1);
});

test('admin_round_start persists only on ok + non-noop', async () => {
  for (const [name, result, expected] of [
    ['ok', { ok: true, noop: false }, 1],
    ['noop', { ok: true, noop: true }, 0],
    ['failed', { ok: false }, 0],
    ['null', null, 0],
  ] as const) {
    const room = `rm-start-${name}`;
    const collected: any[] = [];
    const persistCount = { n: 0 };
    const deps = makeDeps(collected, { persistCount, roundStartResult: result });

    await handleAdminMessage(makeWs([]), { type: 'admin_round_start' }, room, deps);

    assert.strictEqual(persistCount.n, expected, `persist count for ${name}`);
  }
});

test('admin_dim_set valid figure → moderation_state + persist', async () => {
  const room = 'rm-dim-1';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { persistCount });

  await handleAdminMessage(makeWs([]), { type: 'admin_dim_set', figureId: 'f1' }, room, deps);

  const state = collected.find((m: any) => m.type === 'moderation_state');
  assert.ok(state, 'expected moderation_state broadcast');
  assert.strictEqual(state.dim, 'f1');
  assert.strictEqual(state.spotlight, null);
  assert.strictEqual(state.freeze, false);
  assert.strictEqual(persistCount.n, 1);
});

test('admin_dim_set unknown figure → not-found, no persist', async () => {
  const room = 'rm-dim-2';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const sent: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { persistCount });

  await handleAdminMessage(makeWs(sent), { type: 'admin_dim_set', figureId: 'ghost' }, room, deps);

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].reason, 'not-found');
  assert.strictEqual(collected.length, 0);
  assert.strictEqual(persistCount.n, 0);
});

test('admin_dim_set null clears dim', async () => {
  const room = 'rm-dim-3';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { persistCount });

  await handleAdminMessage(makeWs([]), { type: 'admin_dim_set', figureId: 'f1' }, room, deps);
  await handleAdminMessage(makeWs([]), { type: 'admin_dim_set', figureId: null }, room, deps);

  const states = collected.filter((m: any) => m.type === 'moderation_state');
  assert.strictEqual(states.length, 2);
  assert.strictEqual(states[1].dim, null);
});

test('admin_freeze_set true → moderation_state freeze + persist', async () => {
  const room = 'rm-freeze-1';
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { persistCount });

  await handleAdminMessage(makeWs([]), { type: 'admin_freeze_set', frozen: true }, room, deps);

  const state = collected.find((m: any) => m.type === 'moderation_state');
  assert.ok(state, 'expected moderation_state broadcast');
  assert.strictEqual(state.freeze, true);
  assert.strictEqual(persistCount.n, 1);
});
