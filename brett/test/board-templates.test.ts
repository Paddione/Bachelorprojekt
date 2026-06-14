import { test } from 'node:test';
import assert from 'node:assert';
import {
  listBoardTemplates,
  getBoardTemplate,
  createBoardTemplate,
  deleteBoardTemplate,
} from '../src/server/board-templates';

function fakePool(rows: any[][]) {
  const calls: { text: string; params?: unknown[] }[] = [];
  let callIdx = 0;
  return {
    pool: {
      async query(text: string, params?: unknown[]) {
        calls.push({ text, params });
        const r = rows[callIdx] ?? [];
        callIdx++;
        return { rows: r };
      },
    } as any,
    calls,
  };
}

test('listBoardTemplates selects without state and orders correctly', async () => {
  const { pool, calls } = fakePool([[
    { id: 'a', brand: 'mentolder', name: 'T1', description: null, category: null, is_system: true, created_by_user: null, created_at: '2024-01-01' },
  ]]);
  const out = await listBoardTemplates(pool, 'mentolder');
  assert.match(calls[0].text, /FROM brett\.board_templates/);
  assert.doesNotMatch(calls[0].text, /\bstate\b/);
  assert.match(calls[0].text, /is_system DESC/);
  assert.match(calls[0].text, /created_at DESC/);
  assert.deepStrictEqual(calls[0].params, ['mentolder']);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].is_system, true);
});

test('getBoardTemplate selects with state', async () => {
  const { pool, calls } = fakePool([[
    { id: 'x', brand: 'mentolder', name: 'T', description: null, category: null, state: { figures: [] }, is_system: false, created_by_user: 'u1', created_at: '2024-01-01' },
  ]]);
  const out = await getBoardTemplate(pool, 'x');
  assert.match(calls[0].text, /\bstate\b/);
  assert.deepStrictEqual(calls[0].params, ['x']);
  assert.ok(out);
  assert.deepStrictEqual(out.state, { figures: [] });
});

test('getBoardTemplate returns null when absent', async () => {
  const { pool } = fakePool([[]]);
  const out = await getBoardTemplate(pool, 'missing');
  assert.strictEqual(out, null);
});

test('createBoardTemplate inserts correctly', async () => {
  const { pool, calls } = fakePool([
    [{ cnt: 0 }],
    [{ id: 'new-id' }],
  ]);
  const result = await createBoardTemplate(pool, {
    brand: 'mentolder', name: 'Test', description: 'desc', category: 'cat', state: { figures: [] }, userId: 'u1',
  });
  assert.strictEqual(result.id, 'new-id');
  assert.match(calls[1].text, /INSERT INTO brett\.board_templates/);
  assert.deepStrictEqual(calls[1].params, ['mentolder', 'Test', 'desc', 'cat', { figures: [] }, 'u1']);
});

test('createBoardTemplate rejects when limit reached', async () => {
  const { pool } = fakePool([[{ cnt: 50 }]]);
  await assert.rejects(
    () => createBoardTemplate(pool, {
      brand: 'mentolder', name: 'Test', state: { figures: [] }, userId: 'u1',
    }),
    /limit-reached/,
  );
});

test('deleteBoardTemplate rejects is_system=true', async () => {
  const { pool } = fakePool([[{ id: 'sys', is_system: true, created_by_user: null }]]);
  const result = await deleteBoardTemplate(pool, 'sys', { userId: 'u1', isAdmin: false });
  assert.strictEqual(result.deleted, false);
  assert.strictEqual(result.reason, 'is-system');
});

test('deleteBoardTemplate rejects wrong userId without isAdmin', async () => {
  const { pool } = fakePool([[{ id: 't1', is_system: false, created_by_user: 'other' }]]);
  const result = await deleteBoardTemplate(pool, 't1', { userId: 'u1', isAdmin: false });
  assert.strictEqual(result.deleted, false);
  assert.strictEqual(result.reason, 'forbidden');
});

test('deleteBoardTemplate succeeds for owner', async () => {
  const { pool, calls } = fakePool([
    [{ id: 't1', is_system: false, created_by_user: 'u1' }],
    [],
  ]);
  const result = await deleteBoardTemplate(pool, 't1', { userId: 'u1', isAdmin: false });
  assert.strictEqual(result.deleted, true);
  assert.match(calls[1].text, /DELETE FROM brett\.board_templates/);
});

test('deleteBoardTemplate succeeds for admin', async () => {
  const { pool, calls } = fakePool([
    [{ id: 't1', is_system: false, created_by_user: 'other' }],
    [],
  ]);
  const result = await deleteBoardTemplate(pool, 't1', { userId: 'admin1', isAdmin: true });
  assert.strictEqual(result.deleted, true);
  assert.match(calls[1].text, /DELETE FROM brett\.board_templates/);
});
