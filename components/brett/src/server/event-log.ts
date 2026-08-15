// brett/src/server/event-log.ts
// Server-side event recording for Timeline/Replay (Slice 5, T000472).
// All state-mutating WS messages are logged here with a monotone sequence
// number per room and flushed in batches to the session_events table.

import type { RecordedEvent } from '../types/events';

// ── Dependency injection ─────────────────────────────────────────
type PoolLike = {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

let pool: PoolLike | null = null;
const FLUSH_INTERVAL_MS = parseInt(process.env.EVENT_LOG_FLUSH_MS || '2000', 10);
const MAX_BATCH_SIZE = 500;

export function initEventLog(deps: { pool: PoolLike }): void {
  pool = deps.pool;
}

// ── In-memory state ──────────────────────────────────────────────

/** Per-room event buffer (unflushed events). */
const eventBuffers = new Map<string, Array<Omit<RecordedEvent, 'id'>>>();

/** Per-room monotone sequence counter. Seeded from DB on first append to survive restarts. */
const seqCounters = new Map<string, number>();

/** Rooms for which seq has been seeded from DB (prevents re-seeding). */
const seqSeeded = new Set<string>();

/**
 * Events buffered while the DB seq seed is in flight.
 * Held without a seq number until the seed resolves; then re-numbered
 * starting from dbMax+1 and moved to eventBuffers. Prevents ON CONFLICT
 * DO NOTHING silent data loss when the server restarts mid-session.
 */
const seedPendingBuffers = new Map<string, Array<Omit<RecordedEvent, 'id' | 'seq'>>>();

/** Pending seed Promises per room — awaited by flushEventBuffer. */
const seedPromises = new Map<string, Promise<void>>();

/** Per-room flush timer handles. */
const flushTimers = new Map<string, NodeJS.Timeout>();

// ── Public API ───────────────────────────────────────────────────

/**
 * Append one event to the in-memory buffer.
 * Schedules an automatic flush after FLUSH_INTERVAL_MS if not already scheduled.
 * No-op when MOCK_DB=true or pool not yet initialized.
 *
 * On the first append for a room after a server restart, seeds the seq counter
 * from the DB MAX(seq) to avoid silent data loss via ON CONFLICT DO NOTHING.
 */
export function appendEvent(
  room: string,
  sessionCode: string | null,
  eventType: string,
  payload: Record<string, any>,
): void {
  if (!pool) return;

  // Seed seq counter from DB on first use after restart.
  // Events arriving during seeding are held in seedPendingBuffers without a seq
  // and re-numbered once the DB max is known — prevents ON CONFLICT DO NOTHING
  // silent data loss when the server restarts mid-session.
  if (!seqSeeded.has(room)) {
    if (!seedPendingBuffers.has(room)) {
      seedPendingBuffers.set(room, []);
      const seedPromise = pool
        .query('SELECT COALESCE(MAX(seq), 0) AS max_seq FROM session_events WHERE room_token = $1', [room])
        .then(({ rows }) => {
          const dbMax = Number(rows[0]?.max_seq ?? 0);
          seqCounters.set(room, dbMax);
          seqSeeded.add(room);
          seedPromises.delete(room);
          const pending = seedPendingBuffers.get(room) ?? [];
          seedPendingBuffers.delete(room);
          if (pending.length === 0) return;
          let seq = dbMax;
          let buf = eventBuffers.get(room);
          if (!buf) { buf = []; eventBuffers.set(room, buf); }
          for (const ev of pending) {
            seq += 1;
            buf.push({ ...ev, seq });
          }
          seqCounters.set(room, seq);
          scheduleFlush(room);
        })
        .catch(err => {
          seqSeeded.add(room);
          seedPendingBuffers.delete(room);
          seedPromises.delete(room);
          console.error('[brett/event-log] seq seed error:', err);
        });
      seedPromises.set(room, seedPromise);
    }
    const pending = seedPendingBuffers.get(room);
    if (pending) {
      pending.push({ roomToken: room, sessionCode, eventType, payload, recordedAt: new Date().toISOString() });
      return;
    }
  }

  const seq = (seqCounters.get(room) ?? 0) + 1;
  seqCounters.set(room, seq);

  let buf = eventBuffers.get(room);
  if (!buf) { buf = []; eventBuffers.set(room, buf); }

  buf.push({
    roomToken: room,
    sessionCode,
    seq,
    eventType,
    payload,
    recordedAt: new Date().toISOString(),
  });

  if (buf.length >= MAX_BATCH_SIZE) {
    flushEventBuffer(room).catch(err => console.error('[brett/event-log] flush error:', err));
    return;
  }

  scheduleFlush(room);
}

function scheduleFlush(room: string): void {
  if (!flushTimers.has(room)) {
    flushTimers.set(room, setTimeout(() => {
      flushTimers.delete(room);
      flushEventBuffer(room).catch(err => console.error('[brett/event-log] flush error:', err));
    }, FLUSH_INTERVAL_MS));
  }
}

/**
 * Immediately flush all buffered events for a room to the DB.
 * Called on session-end and server shutdown.
 */
export async function flushEventBuffer(room: string): Promise<void> {
  if (!pool) return;

  // If the DB seq seed is still in flight, wait for it so pending events are
  // moved to eventBuffers and re-numbered before we attempt the INSERT.
  const seed = seedPromises.get(room);
  if (seed) await seed;

  const timer = flushTimers.get(room);
  if (timer) { clearTimeout(timer); flushTimers.delete(room); }

  const buf = eventBuffers.get(room);
  if (!buf || buf.length === 0) return;

  // Drain the buffer atomically (copy + clear before async DB write)
  const toInsert = buf.splice(0, buf.length);

  if (toInsert.length === 0) return;

  // Build multi-row INSERT
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;
  for (const ev of toInsert) {
    placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    values.push(ev.roomToken, ev.sessionCode, ev.seq, ev.eventType, ev.payload, ev.recordedAt);
  }

  await pool.query(
    `INSERT INTO session_events (room_token, session_code, seq, event_type, payload, recorded_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (room_token, seq) DO NOTHING`,
    values,
  );
}

/**
 * Load all recorded events for a room, ordered by seq.
 * Optionally filter to events with seq > sinceSeq.
 */
export async function loadEvents(
  room: string,
  opts?: { sinceSeq?: number; limit?: number },
): Promise<RecordedEvent[]> {
  if (!pool) return [];

  const limit = opts?.limit ?? 10_000;
  const sinceSeq = opts?.sinceSeq ?? 0;

  const { rows } = await pool.query(
    `SELECT id, room_token AS "roomToken", session_code AS "sessionCode",
            seq, event_type AS "eventType", payload,
            recorded_at AS "recordedAt"
     FROM session_events
     WHERE room_token = $1 AND seq > $2
     ORDER BY seq ASC
     LIMIT $3`,
    [room, sinceSeq, limit],
  );
  return rows as RecordedEvent[];
}

/**
 * Load session metadata list for a room (for session picker).
 */
export async function loadSessionMetas(room: string): Promise<Array<{
  sessionCode: string | null;
  startedAt: string;
  endedAt: string | null;
  eventCount: number;
}>> {
  if (!pool) return [];

  const { rows } = await pool.query(
    `SELECT session_code AS "sessionCode",
            MIN(recorded_at) AS "startedAt",
            MAX(CASE WHEN event_type = 'session_phase_change' AND payload->>'phase' = 'ended'
                     THEN recorded_at END) AS "endedAt",
            COUNT(*)::int AS "eventCount"
     FROM session_events
     WHERE room_token = $1
     GROUP BY session_code
     ORDER BY MIN(recorded_at) DESC
     LIMIT 50`,
    [room],
  );
  return rows;
}

/** Returns current buffer stats (used in tests). */
export function getBufferStats(room: string): { buffered: number; nextSeq: number } {
  const pendingCount = seedPendingBuffers.get(room)?.length ?? 0;
  return {
    buffered: (eventBuffers.get(room)?.length ?? 0) + pendingCount,
    nextSeq: (seqCounters.get(room) ?? 0) + pendingCount + 1,
  };
}

/** Reset all in-memory state (test helper). */
export function resetEventLog(): void {
  for (const t of flushTimers.values()) clearTimeout(t);
  eventBuffers.clear();
  seqCounters.clear();
  seqSeeded.clear();
  flushTimers.clear();
  seedPendingBuffers.clear();
  seedPromises.clear();
}

/** Flush all rooms with buffered events (call during graceful shutdown). */
export async function flushAll(): Promise<void> {
  await Promise.allSettled(
    [...eventBuffers.keys()].map(room => flushEventBuffer(room))
  );
}
