import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/server/db';
import {
  createZuschauerToken,
  resolveZuschauerToken,
  disableZuschauerToken,
  listZuschauerTokens,
  resolveShareToken,
} from '../src/server/share-tokens';

function scriptPool(script: { rows?: any[]; rowCount?: number } = {}) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const pool = {
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return { rows: script.rows ?? [], rowCount: script.rowCount ?? (script.rows?.length ?? 0) };
    },
    async end() {},
    async connect() { return { query: this.query, release() {} }; },
    on() { return this; },
  };
  process.env.MOCK_DB = 'true';
  initDb({ buildStateFromMutations: () => ({ figures: [] }) });
  return { pool, calls };
}

test('T000706-A1: createZuschauerToken inserts with token_type = zuschauer', async () => {
  const { pool, calls } = scriptPool();
  const token = await createZuschauerToken('room-123', 'user-1', pool as any);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(token.length >= 20);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /INSERT INTO brett_share_tokens/);
  assert.match(calls[0].text, /'zuschauer'/);
  assert.deepEqual(calls[0].params, [token, 'room-123', 'user-1']);
});

test('T000706-A2: resolveZuschauerToken returns roomToken for valid token', async () => {
  const { pool } = scriptPool({ rows: [{ room_token: 'room-xyz' }] });
  assert.equal(await resolveZuschauerToken('tok', pool as any), 'room-xyz');
});

test('T000706-A3: resolveZuschauerToken returns null when no active row', async () => {
  const { pool } = scriptPool({ rows: [] });
  assert.equal(await resolveZuschauerToken('tok', pool as any), null);
});

test('T000706-A4: resolveShareToken does NOT find zuschauer tokens', async () => {
  const { pool, calls } = scriptPool({ rows: [] });
  await resolveShareToken('tok', pool as any);
  assert.match(calls[0].text, /token_type = 'share'/);
});

test('T000706-A5: disableZuschauerToken works correctly', async () => {
  const { pool, calls } = scriptPool({ rowCount: 1 });
  assert.equal(await disableZuschauerToken('tok', 'room-1', pool as any), true);
  assert.match(calls[0].text, /token_type = 'zuschauer'/);
  assert.deepEqual(calls[0].params, ['tok', 'room-1']);
});

test('T000706-A6: disableZuschauerToken returns false when nothing matched', async () => {
  const { pool } = scriptPool({ rowCount: 0 });
  assert.equal(await disableZuschauerToken('tok', 'room-1', pool as any), false);
});

test('T000706-A7: listZuschauerTokens filters by token_type', async () => {
  const rows = [{ token: 't1', created_at: new Date(), created_by: 'u1' }];
  const { pool, calls } = scriptPool({ rows });
  const result = await listZuschauerTokens('room-1', pool as any);
  assert.deepEqual(result, rows);
  assert.match(calls[0].text, /token_type = 'zuschauer'/);
});
