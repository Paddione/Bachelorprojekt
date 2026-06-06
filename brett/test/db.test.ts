// Direct-import unit tests for the extracted db module (TS refactor coverage, A3).
// Runs under MOCK_DB=true (set by the package test script), so initDb wires a MockPool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initDb,
  getPool,
  readState,
  schedulePersist,
  flushImmediate,
  getPending,
} from '../src/server/db';

function setupMockDb(builder: (room: string) => any = () => ({ figures: [] })) {
  process.env.MOCK_DB = 'true';
  initDb({ buildStateFromMutations: builder });
}

test('initDb under MOCK_DB yields a no-op MockPool', async () => {
  setupMockDb();
  const res = await getPool().query('SELECT 1');
  assert.deepEqual(res, { rows: [] });
});

test('readState returns the default empty board when no row exists', async () => {
  setupMockDb();
  assert.deepEqual(await readState('room-x'), { figures: [] });
});

test('schedulePersist registers a pending flush; flushImmediate clears it', async () => {
  setupMockDb(() => ({ figures: [{ id: 'a' }] }));
  schedulePersist('room-y');
  assert.equal(getPending().has('room-y'), true);
  await flushImmediate('room-y');
  assert.equal(getPending().has('room-y'), false);
});
