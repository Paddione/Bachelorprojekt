// brett/test/admin-undo-redo.test.ts — T901934: session_undo/session_redo via handleAdminMessage
import { test } from 'node:test';
import assert from 'node:assert';
import { handleAdminMessage } from '../src/server/ws-admin-commands';
import {
  applyMutation,
  buildStateFromMutations,
} from '../src/server/index';

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function seedFigure(room: string, id: string) {
  applyMutation(room, { type: 'add', figure: { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
}

function makeDeps(collected: any[], opts: {
  undoResult?: { applied: boolean } | null;
  redoResult?: { applied: boolean } | null;
  persistCount: { n: number };
}) {
  return {
    rooms: new Map(),
    applyMutation,
    buildStateFromMutations,
    performUndo: opts.undoResult === null ? undefined : () => opts.undoResult,
    performRedo: opts.redoResult === null ? undefined : () => opts.redoResult,
    getUndoStatus: () => ({ canUndo: false, canRedo: true, undoCount: 0, redoCount: 1 }),
    broadcast: (_room: string, msg: any) => collected.push(msg),
    broadcastRoleAware: (_room: string, msg: any) => collected.push(msg),
    schedulePersist: () => { opts.persistCount.n++; },
  } as any;
}

function makeWs(sent: any[]) {
  return { send: (s: string) => sent.push(JSON.parse(s)) };
}

test('session_undo applied → role-aware snapshot + undo_stack_changed + persist', async () => {
  const room = 'ur-undo-applied';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { undoResult: { applied: true }, persistCount });

  await handleAdminMessage(makeWs([]), { type: 'session_undo' }, room, deps);

  const snap = collected.find((m: any) => m.type === 'snapshot');
  assert.ok(snap, 'expected a snapshot broadcast');
  // E9-Pin: Re-Snapshot muss Zones/Anchors/Lines/Moderation mitsenden,
  // sonst wischt der Client sie.
  assert.ok('anchors' in snap && 'zones' in snap && 'lines' in snap && 'moderation' in snap);
  assert.ok(Array.isArray(snap.figures) && snap.figures.length === 1);
  const stack = collected.find((m: any) => m.type === 'undo_stack_changed');
  assert.ok(stack, 'expected undo_stack_changed');
  assert.strictEqual(stack.canRedo, true);
  assert.strictEqual(persistCount.n, 1);
});

test('session_undo empty → undo-stack-empty error, no persist', async () => {
  const room = 'ur-undo-empty';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const sent: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { undoResult: { applied: false }, persistCount });

  await handleAdminMessage(makeWs(sent), { type: 'session_undo' }, room, deps);

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].reason, 'undo-stack-empty');
  assert.strictEqual(collected.length, 0);
  assert.strictEqual(persistCount.n, 0);
});

test('session_undo without performUndo → silent no-op', async () => {
  const room = 'ur-undo-missing';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const sent: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { undoResult: null, persistCount });

  await handleAdminMessage(makeWs(sent), { type: 'session_undo' }, room, deps);

  assert.strictEqual(sent.length, 0);
  assert.strictEqual(collected.length, 0);
  assert.strictEqual(persistCount.n, 0);
});

test('session_redo applied → role-aware snapshot + undo_stack_changed + persist', async () => {
  const room = 'ur-redo-applied';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { redoResult: { applied: true }, persistCount });

  await handleAdminMessage(makeWs([]), { type: 'session_redo' }, room, deps);

  const snap = collected.find((m: any) => m.type === 'snapshot');
  assert.ok(snap, 'expected a snapshot broadcast');
  assert.ok('anchors' in snap && 'zones' in snap && 'lines' in snap && 'moderation' in snap);
  const stack = collected.find((m: any) => m.type === 'undo_stack_changed');
  assert.ok(stack, 'expected undo_stack_changed');
  assert.strictEqual(persistCount.n, 1);
});

test('session_redo empty → redo-stack-empty error, no persist', async () => {
  const room = 'ur-redo-empty';
  seedFigure(room, 'f1');
  const collected: any[] = [];
  const sent: any[] = [];
  const persistCount = { n: 0 };
  const deps = makeDeps(collected, { redoResult: { applied: false }, persistCount });

  await handleAdminMessage(makeWs(sent), { type: 'session_redo' }, room, deps);

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].reason, 'redo-stack-empty');
  assert.strictEqual(collected.length, 0);
  assert.strictEqual(persistCount.n, 0);
});
