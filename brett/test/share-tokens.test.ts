import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/server/db';
import {
  createShareToken,
  resolveShareToken,
  disableShareToken,
  listShareTokens,
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

test('FA-BRT-A2a: createShareToken returns a URL-safe token and inserts it', async () => {
  const { pool, calls } = scriptPool();
  const token = await createShareToken('room-123', 'user-1', pool as any);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(token.length >= 20);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /INSERT INTO brett_share_tokens/);
  assert.deepEqual(calls[0].params, [token, 'room-123', 'user-1']);
});

test('FA-BRT-A2b: resolveShareToken returns roomToken for a valid token', async () => {
  const { pool } = scriptPool({ rows: [{ room_token: 'room-xyz' }] });
  assert.equal(await resolveShareToken('tok', pool as any), 'room-xyz');
});

test('FA-BRT-A2c: resolveShareToken returns null when no active row', async () => {
  const { pool } = scriptPool({ rows: [] });
  assert.equal(await resolveShareToken('tok', pool as any), null);
});

test('FA-BRT-A2d: disableShareToken returns true when a row was updated', async () => {
  const { pool, calls } = scriptPool({ rowCount: 1 });
  assert.equal(await disableShareToken('tok', 'room-1', pool as any), true);
  assert.match(calls[0].text, /UPDATE brett_share_tokens SET disabled_at = now\(\)/);
  assert.deepEqual(calls[0].params, ['tok', 'room-1']);
});

test('FA-BRT-A2e: disableShareToken returns false when nothing matched', async () => {
  const { pool } = scriptPool({ rowCount: 0 });
  assert.equal(await disableShareToken('tok', 'room-1', pool as any), false);
});

test('FA-BRT-A2f: listShareTokens returns active rows', async () => {
  const rows = [{ token: 't1', created_at: new Date(), created_by: 'u1' }];
  const { pool } = scriptPool({ rows });
  assert.deepEqual(await listShareTokens('room-1', pool as any), rows);
});
