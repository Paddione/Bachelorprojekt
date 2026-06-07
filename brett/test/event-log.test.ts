// brett/test/event-log.test.ts
// Tests for server-side event recording (T000472 — Timeline/Replay).
import { test } from 'node:test';
import assert from 'node:assert';
import {
  initEventLog,
  appendEvent,
  flushEventBuffer,
  loadEvents,
  getBufferStats,
  resetEventLog,
} from '../src/server/event-log';

// ── Minimal MockPool ─────────────────────────────────────────────
interface Row { [k: string]: any }
class MockPool {
  public insertedRows: Row[][] = [];
  public selectedRoom: string | null = null;
  public mockEvents: Row[] = [];

  async query(text: string, params?: unknown[]): Promise<{ rows: Row[] }> {
    if (text.startsWith('INSERT INTO session_events')) {
      // Record the batch for assertion
      const batchSize = (params?.length ?? 0) / 6;
      const batch: Row[] = [];
      for (let i = 0; i < batchSize; i++) {
        const base = i * 6;
        batch.push({
          roomToken: params![base],
          sessionCode: params![base + 1],
          seq: params![base + 2],
          eventType: params![base + 3],
          payload: params![base + 4],
          recordedAt: params![base + 5],
        });
      }
      this.insertedRows.push(batch);
      return { rows: [] };
    }
    if (text.includes('FROM session_events')) {
      this.selectedRoom = params?.[0] as string;
      return { rows: this.mockEvents };
    }
    return { rows: [] };
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function setup(): MockPool {
  const pool = new MockPool();
  initEventLog({ pool });
  resetEventLog();
  return pool;
}

// ── Tests ────────────────────────────────────────────────────────
test('event-log: appendEvent buffers without DB write', async () => {
  const pool = setup();
  appendEvent('room-1', 'ABC-123', 'move', { id: 'fig1', x: 1, z: 2, facingY: 0 });
  appendEvent('room-1', 'ABC-123', 'move', { id: 'fig1', x: 2, z: 3, facingY: 0 });
  const stats = getBufferStats('room-1');
  assert.strictEqual(stats.buffered, 2, 'buffer should hold 2 events');
  assert.strictEqual(pool.insertedRows.length, 0, 'no DB write yet');
  resetEventLog();
});

test('event-log: flushEventBuffer writes to DB and clears buffer', async () => {
  const pool = setup();
  appendEvent('room-1', 'ABC-123', 'add', { id: 'fig2', x: 0, z: 0, facingY: 0 });
  appendEvent('room-1', 'ABC-123', 'move', { id: 'fig2', x: 1, z: 0, facingY: 0 });
  await flushEventBuffer('room-1');
  assert.strictEqual(pool.insertedRows.length, 1, 'one batch insert');
  assert.strictEqual(pool.insertedRows[0].length, 2, 'batch contains 2 rows');
  assert.strictEqual(getBufferStats('room-1').buffered, 0, 'buffer cleared after flush');
  resetEventLog();
});

test('event-log: seq counter is monotone per room', () => {
  setup();
  appendEvent('room-2', null, 'move', { id: 'a' });
  appendEvent('room-2', null, 'move', { id: 'b' });
  appendEvent('room-2', null, 'delete', { id: 'a' });
  const stats = getBufferStats('room-2');
  assert.strictEqual(stats.nextSeq, 4, 'next seq should be 4');
  resetEventLog();
});

test('event-log: seq counters are independent per room', () => {
  setup();
  appendEvent('room-A', null, 'move', { id: 'f1' });
  appendEvent('room-A', null, 'move', { id: 'f1' });
  appendEvent('room-B', 'XYZ-789', 'add', { id: 'f2', x: 0, z: 0, facingY: 0 });
  assert.strictEqual(getBufferStats('room-A').nextSeq, 3);
  assert.strictEqual(getBufferStats('room-B').nextSeq, 2);
  resetEventLog();
});

test('event-log: loadEvents delegates to pool and returns rows', async () => {
  const pool = setup();
  pool.mockEvents = [
    { id: 1, roomToken: 'r1', sessionCode: 'AA-100', seq: 1, eventType: 'add', payload: { id: 'f1' }, recordedAt: '2026-06-07T10:00:00Z' },
    { id: 2, roomToken: 'r1', sessionCode: 'AA-100', seq: 2, eventType: 'move', payload: { id: 'f1', x: 1, z: 0 }, recordedAt: '2026-06-07T10:00:01Z' },
  ];
  const events = await loadEvents('r1');
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].eventType, 'add');
  assert.strictEqual(events[1].seq, 2);
  resetEventLog();
});

test('event-log: flushEventBuffer on empty buffer is a no-op', async () => {
  const pool = setup();
  await flushEventBuffer('nonexistent-room');
  assert.strictEqual(pool.insertedRows.length, 0, 'no insert on empty buffer');
  resetEventLog();
});

test('event-log: double flush does not re-insert', async () => {
  const pool = setup();
  appendEvent('room-3', null, 'stiffness', { value: 0.8 });
  await flushEventBuffer('room-3');
  await flushEventBuffer('room-3'); // second flush — buffer already cleared
  assert.strictEqual(pool.insertedRows.length, 1, 'only one insert');
  resetEventLog();
});
