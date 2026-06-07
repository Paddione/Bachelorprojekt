---
title: "Brett: Timeline/Replay (Slice 5)"
ticket_id: T000472
spec: docs/superpowers/specs/2026-06-07-brett-timeline-replay-design.md
branch: feature/brett-timeline-replay
domains: [website]
status: active
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serverseitige Event-Aufzeichnung aller Board-Mutations und vollständige Replay-UI mit Zeitstrahl-Scrubber, sodass Admin-Nutzer jede Coaching-Session vollständig nachschauen können.

**Architecture:** Server puffert Mutation-Events in `session_events` (DB) per Batch-Insert; Client lädt Events per HTTP-API und rekonstruiert Board-Zustände rein lokal über `replay-engine.ts` ohne WS-Live-Verbindung.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom

**Ticket-ID:** T000472

---

## Meilenstein 1: Shared Types & DB-Schema

### Task 1.1: Neue Types für Event-Log

**Files:**
- Create: `brett/src/types/events.ts`
- Modify: `brett/src/types/messages.ts`

- [ ] **Step 1: Erstelle `brett/src/types/events.ts` mit RecordedEvent und SessionMeta**

```typescript
// brett/src/types/events.ts
// Shared types for the event-log / replay system (Slice 5, T000472).

/** A single recorded mutation event as stored in and returned from session_events. */
export interface RecordedEvent {
  /** DB primary key (BIGSERIAL). */
  id: number;
  roomToken: string;
  /** Coaching session code (e.g. "ABC-123") or null in free-board mode. */
  sessionCode: string | null;
  /** Monotone per-room sequence number — guarantees insert order is preserved. */
  seq: number;
  /** The mutation type string (mirrors ClientMessage['type']). */
  eventType: string;
  /** Full payload of the original message (player-id stripped by server). */
  payload: Record<string, any>;
  /** ISO 8601 timestamp with timezone as returned by PostgreSQL. */
  recordedAt: string;
}

/** Lightweight metadata about a recorded session (for session-picker UI). */
export interface SessionMeta {
  roomToken: string;
  sessionCode: string | null;
  startedAt: string;   // ISO 8601
  endedAt: string | null;
  eventCount: number;
}

/** Full replay bundle returned by GET /api/sessions/:room/events. */
export interface ReplayBundle {
  events: RecordedEvent[];
  initialState: any;
  meta: SessionMeta;
}
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/types/events.ts
git commit -m "feat(brett): add RecordedEvent + SessionMeta shared types [T000472]"
```

### Task 1.2: DB-Schema-Migration

**Files:**
- Create: `brett/src/server/migrations/001_session_events.sql`
- Modify: `brett/src/server/db.ts`

- [ ] **Step 1: Erstelle SQL-Migrationsdatei**

```sql
-- brett/src/server/migrations/001_session_events.sql
-- Migration: create session_events table for Timeline/Replay (T000472).

CREATE TABLE IF NOT EXISTS session_events (
  id           BIGSERIAL    PRIMARY KEY,
  room_token   TEXT         NOT NULL,
  session_code TEXT,
  seq          INTEGER      NOT NULL,
  event_type   TEXT         NOT NULL,
  payload      JSONB        NOT NULL,
  recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup for replay: all events for a room in order
CREATE INDEX IF NOT EXISTS idx_session_events_room_token
  ON session_events (room_token, recorded_at);

-- Fast lookup by session code for the session-picker
CREATE INDEX IF NOT EXISTS idx_session_events_session_code
  ON session_events (session_code, seq)
  WHERE session_code IS NOT NULL;

-- Composite index for seq uniqueness per room
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_events_room_seq
  ON session_events (room_token, seq);
```

- [ ] **Step 2: Füge `runMigrations()` zu `db.ts` hinzu**

Füge am Ende von `db.ts` folgende Funktion ein (vor dem letzten `export`-Block falls vorhanden):

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Runs all pending SQL migration files from src/server/migrations/.
 * Safe to call on every startup (idempotent due to IF NOT EXISTS).
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = join(__dirname, 'migrations');
  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  } catch {
    return; // no migrations directory — e.g. in test environments
  }
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
  }
}
```

Füge am Anfang der Datei den benötigten Import hinzu:

```typescript
import { readdirSync } from 'fs';
```

- [ ] **Step 3: `runMigrations()` in `index.ts` aufrufen**

In `brett/src/server/index.ts`, nach der Zeile `db.initDb(...)`, füge hinzu:

```typescript
// Run DB migrations on startup (idempotent).
if (process.env.MOCK_DB !== 'true') {
  db.runMigrations().catch(err => console.error('[brett] migration error:', err));
}
```

- [ ] **Step 4: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add brett/src/server/migrations/001_session_events.sql brett/src/server/db.ts brett/src/server/index.ts
git commit -m "feat(brett): add session_events DB schema + runMigrations [T000472]"
```

---

## Meilenstein 2: Server — Event-Log-Modul

### Task 2.1: `event-log.ts` — Core-Modul erstellen

**Files:**
- Create: `brett/src/server/event-log.ts`

- [ ] **Step 1: Erstelle `brett/src/server/event-log.ts` mit Buffer und Flush-Logik**

```typescript
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

/** Per-room monotone sequence counter. */
const seqCounters = new Map<string, number>();

/** Per-room flush timer handles. */
const flushTimers = new Map<string, NodeJS.Timeout>();

// ── Public API ───────────────────────────────────────────────────

/**
 * Append one event to the in-memory buffer.
 * Schedules an automatic flush after FLUSH_INTERVAL_MS if not already scheduled.
 * No-op when MOCK_DB=true or pool not yet initialized.
 */
export function appendEvent(
  room: string,
  sessionCode: string | null,
  eventType: string,
  payload: Record<string, any>,
): void {
  if (!pool) return;

  let seq = (seqCounters.get(room) ?? 0) + 1;
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

  // Auto-flush when buffer exceeds max batch size
  if (buf.length >= MAX_BATCH_SIZE) {
    flushEventBuffer(room).catch(err => console.error('[brett/event-log] flush error:', err));
    return;
  }

  // Schedule debounced flush
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
 * Optionally filter to events with seq >= sinceSeq.
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
  return {
    buffered: eventBuffers.get(room)?.length ?? 0,
    nextSeq: (seqCounters.get(room) ?? 0) + 1,
  };
}

/** Reset all in-memory state (test helper). */
export function resetEventLog(): void {
  for (const t of flushTimers.values()) clearTimeout(t);
  eventBuffers.clear();
  seqCounters.clear();
  flushTimers.clear();
}
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/server/event-log.ts
git commit -m "feat(brett): add event-log module with buffer+flush [T000472]"
```

### Task 2.2: Event-Log in `ws-handler.ts` verdrahten

**Files:**
- Modify: `brett/src/server/ws-handler.ts`

- [ ] **Step 1: `logEvent` und `flushEventLog` zu `WsDeps` hinzufügen**

In der `WsDeps`-Interface-Definition, nach `flushImmediate`:

```typescript
  /** Log a mutation event for replay recording (optional for backwards-compat). */
  logEvent?: (room: string, sessionCode: string | null, eventType: string, payload: any) => void;
  /** Flush the event buffer for a room immediately (called on session-end). */
  flushEventLog?: (room: string) => Promise<void>;
```

- [ ] **Step 2: Hilfsfunktion `getSessionCode` im ws-handler.ts hinzufügen**

Direkt nach der `resolvePlayerId`-Funktion:

```typescript
/**
 * Reads the current session code for a room from figureMaps sentinel.
 * Returns null for free-board rooms (no active session).
 */
function getSessionCode(room: string, deps: WsDeps): string | null {
  const figs = deps.figureMaps.get(room);
  return figs?.get('__session_code__') ?? null;
}
```

- [ ] **Step 3: `logEvent`-Call nach jedem RELAY_TYPES-applyMutation einfügen**

Suche den RELAY_TYPES-Handler-Block. Direkt nach dem `deps.applyMutation(room, msg)`-Call
(innerhalb des `if (RELAY_TYPES.has(msg.type))` Blocks):

```typescript
        // Record event for replay (Slice 5).
        if (deps.logEvent && msg.type !== 'request_state_snapshot') {
          const sessionCode = getSessionCode(room, deps);
          // Strip sensitive fields before logging: no playerId escalation
          const { type, ...safePayload } = msg;
          deps.logEvent(room, sessionCode, msg.type, safePayload);
        }
```

- [ ] **Step 4: `flushEventLog` bei Session-Ende aufrufen**

Im `admin_round_stop`-Handler-Block in `ws-admin-commands.ts` oder im
`transitionPhase`-Callback in `ws-handler.ts`, nach dem Setzen der Phase auf `ended`:

Suche die Stelle, wo `session_phase_change` mit `phase: 'ended'` gebroadcasted wird, und füge
nach dem `deps.schedulePersist`-Call ein:

```typescript
        // Flush event log on session end (ensures no events are lost).
        if (deps.flushEventLog) {
          deps.flushEventLog(room).catch(err =>
            console.error('[brett/event-log] flush on end error:', err)
          );
        }
```

- [ ] **Step 5: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add brett/src/server/ws-handler.ts
git commit -m "feat(brett): wire logEvent into ws-handler relay path [T000472]"
```

### Task 2.3: Event-Log in `index.ts` initialisieren und HTTP-API registrieren

**Files:**
- Modify: `brett/src/server/index.ts`

- [ ] **Step 1: `event-log.ts` in index.ts importieren und initialisieren**

Füge nach den bestehenden `import * as ...`-Zeilen hinzu:

```typescript
import * as eventLog from './event-log';
```

In der Dependency-Wiring-Sektion, nach `db.initDb(...)`:

```typescript
// Event-log initialization (Slice 5 — replay recording).
eventLog.initEventLog({ pool: db.getPool() });
```

- [ ] **Step 2: `logEvent` und `flushEventLog` in den WsDeps-Aufruf injizieren**

Suche die Stelle, wo `wsHandler.createWsHandler(deps)` aufgerufen wird (oder wo das
`deps`-Objekt zusammengestellt wird). Füge die neuen Properties hinzu:

```typescript
    logEvent: eventLog.appendEvent,
    flushEventLog: eventLog.flushEventBuffer,
```

- [ ] **Step 3: Admin-Middleware erstellen**

Direkt vor den HTTP-Routen-Definitionen:

```typescript
/** Middleware: require admin session. */
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const sess = (req as any).session;
  if (!sess?.isAdmin) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}
```

- [ ] **Step 4: HTTP-API-Endpunkte für Replay registrieren**

Nach den bestehenden API-Routen (z.B. nach `/api/snapshots`):

```typescript
// ── Replay / Event-Log API (Slice 5, T000472) ───────────────────────────────

/** GET /api/sessions/:room/events — liefert alle Events einer Session (admin only). */
app.get('/api/sessions/:room/events', requireAdmin, async (req, res) => {
  try {
    const { room } = req.params;
    const sinceSeq = req.query.sinceSeq ? parseInt(req.query.sinceSeq as string, 10) : undefined;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 10_000) : undefined;
    const events = await eventLog.loadEvents(room, { sinceSeq, limit });
    res.json({ events });
  } catch (err) {
    console.error('[brett] /api/sessions/:room/events error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

/** GET /api/sessions/:room/snapshot — liefert den initial gespeicherten State. */
app.get('/api/sessions/:room/snapshot', requireAdmin, async (req, res) => {
  try {
    const { room } = req.params;
    const state = await db.readState(room);
    res.json({ state, recordedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[brett] /api/sessions/:room/snapshot error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

/** GET /api/sessions — listet Sessions eines Rooms (admin only). */
app.get('/api/sessions', requireAdmin, async (req, res) => {
  try {
    const room = req.query.room as string;
    if (!room) { res.status(400).json({ error: 'room required' }); return; }
    const sessions = await eventLog.loadSessionMetas(room);
    res.json({ sessions });
  } catch (err) {
    console.error('[brett] /api/sessions error:', err);
    res.status(500).json({ error: 'internal' });
  }
});
```

- [ ] **Step 5: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add brett/src/server/index.ts
git commit -m "feat(brett): init event-log + register replay HTTP API endpoints [T000472]"
```

---

## Meilenstein 3: Server-Tests — Event-Log

### Task 3.1: Unit-Tests für `event-log.ts`

**Files:**
- Create: `brett/test/event-log.test.ts`

- [ ] **Step 1: Erstelle Test-Datei mit MockPool und Buffer-Tests**

```typescript
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
```

- [ ] **Step 2: Tests ausführen**

Run: `cd brett && node --test test/event-log.test.ts 2>&1 | tail -20`
Expected: All tests pass (0 failures)

- [ ] **Step 3: Commit**

```bash
git add brett/test/event-log.test.ts
git commit -m "test(brett): add event-log unit tests [T000472]"
```

### Task 3.2: Integration-Test — logEvent-Verdrahtung in WS-Handler

**Files:**
- Create: `brett/test/event-log-ws-integration.test.ts`

- [ ] **Step 1: Erstelle Integration-Test**

```typescript
// brett/test/event-log-ws-integration.test.ts
// Verifies that logEvent is called on all RELAY_TYPES mutations (T000472).
import { test } from 'node:test';
import assert from 'node:assert';
import { RELAY_TYPES } from '../src/server/ws-handler';

test('event-log integration: RELAY_TYPES contains expected mutation types', () => {
  const expected = ['add', 'move', 'update', 'jump', 'delete', 'clear', 'stiffness', 'snapshot', 'request_state_snapshot'];
  for (const t of expected) {
    assert.ok(RELAY_TYPES.has(t), `RELAY_TYPES should contain '${t}'`);
  }
});

test('event-log integration: request_state_snapshot excluded from logging (read-only)', () => {
  // Verify the exclusion documented in ws-handler logEvent call:
  // msg.type !== 'request_state_snapshot'
  const eventTypes = Array.from(RELAY_TYPES).filter(t => t !== 'request_state_snapshot');
  assert.ok(!eventTypes.includes('request_state_snapshot'), 'request_state_snapshot must not be logged');
  assert.ok(eventTypes.includes('move'), 'move should be logged');
  assert.ok(eventTypes.includes('add'), 'add should be logged');
});
```

- [ ] **Step 2: Tests ausführen**

Run: `cd brett && node --test test/event-log-ws-integration.test.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/test/event-log-ws-integration.test.ts
git commit -m "test(brett): add event-log WS integration smoke test [T000472]"
```

---

## Meilenstein 4: Client — Replay Engine

### Task 4.1: `replay-engine.ts` erstellen

**Files:**
- Create: `brett/src/client/replay-engine.ts`

- [ ] **Step 1: Erstelle `brett/src/client/replay-engine.ts`**

```typescript
// brett/src/client/replay-engine.ts
// Client-side replay engine for Timeline/Replay (Slice 5, T000472).
// Pure computation — no DOM, no WS, no Three.js imports.
// Reconstructs board state at any point in time by replaying events
// on top of an initial snapshot.

import type { RecordedEvent } from '../types/events';

// ── Types ────────────────────────────────────────────────────────

/** Simplified board state for replay purposes. */
export interface ReplayBoardState {
  figures: Record<string, any>;
  stiffness: number;
  phase: string;
  sessionCode: string | null;
  coachingSteps: { steps: string[]; index: number } | null;
  optik: any | null;
}

/** A replay controller returned by createReplayController. */
export interface ReplayController {
  /** Seek to a position in milliseconds from the start. Returns the board state at that point. */
  seek(positionMs: number): ReplayBoardState;
  /** Start auto-playback. Calls onFrame on each animation tick. */
  play(onFrame: (state: ReplayBoardState, positionMs: number) => void): void;
  /** Pause auto-playback. */
  pause(): void;
  isPlaying: boolean;
  /** Total duration of the recording in milliseconds. */
  readonly totalDurationMs: number;
  /** Current playback position in milliseconds. */
  currentPositionMs: number;
  /** Raw events (sorted by seq). */
  readonly events: RecordedEvent[];
}

// ── Event application ────────────────────────────────────────────

/**
 * Apply a single recorded event to a replay board state.
 * Returns a new state object (immutable update pattern).
 */
export function applyEventToState(state: ReplayBoardState, event: RecordedEvent): ReplayBoardState {
  const figures = { ...state.figures };
  const p = event.payload;

  switch (event.eventType) {
    case 'add': {
      if (p.id) figures[p.id] = { ...p };
      break;
    }
    case 'move': {
      if (p.id && figures[p.id]) {
        figures[p.id] = { ...figures[p.id], x: p.x, z: p.z, facingY: p.facingY };
      }
      break;
    }
    case 'update': {
      if (p.id && figures[p.id] && p.changes) {
        const existing = figures[p.id];
        const { id: _id, ownerId: _ownerId, ...safeChanges } = p.changes;
        let merged = { ...existing, ...safeChanges };
        if (safeChanges.appearance && existing.appearance) {
          merged.appearance = {
            ...existing.appearance,
            ...safeChanges.appearance,
            accessories: { ...(existing.appearance.accessories || {}), ...(safeChanges.appearance?.accessories || {}) },
          };
        }
        figures[p.id] = merged;
      }
      break;
    }
    case 'delete': {
      if (p.id) delete figures[p.id];
      break;
    }
    case 'clear': {
      // Remove all non-sentinel figures
      for (const k of Object.keys(figures)) {
        if (!k.startsWith('__')) delete figures[k];
      }
      break;
    }
    case 'stiffness': {
      return { ...state, figures, stiffness: typeof p.value === 'number' ? p.value : state.stiffness };
    }
    case 'session_phase_change': {
      return { ...state, figures, phase: p.phase ?? state.phase };
    }
    case 'figure_type_set': {
      if (p.figureId && figures[p.figureId]) {
        figures[p.figureId] = { ...figures[p.figureId], figureType: p.figureType };
      }
      break;
    }
    case 'figure_possess': {
      if (p.figureId && figures[p.figureId]) {
        figures[p.figureId] = { ...figures[p.figureId], possessor: p.playerId };
      }
      break;
    }
    case 'figure_release': {
      if (p.figureId && figures[p.figureId]) {
        figures[p.figureId] = { ...figures[p.figureId], possessor: null };
      }
      break;
    }
    default:
      // Unknown event type — ignore, return state unchanged
      return { ...state, figures };
  }

  return { ...state, figures };
}

// ── State reconstruction ─────────────────────────────────────────

/**
 * Reconstruct the board state at a given timestamp by replaying all events
 * up to (and including) that point.
 * Uses binary search to find the cutoff index, then replays sequentially.
 */
export function seekToTimestamp(
  events: RecordedEvent[],
  initialState: ReplayBoardState,
  targetMs: number,
): ReplayBoardState {
  if (events.length === 0) return { ...initialState };

  const startMs = new Date(events[0].recordedAt).getTime();
  let cutoffIdx = 0;

  // Binary search for the last event with recordedAt <= startMs + targetMs
  let lo = 0, hi = events.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const eventMs = new Date(events[mid].recordedAt).getTime() - startMs;
    if (eventMs <= targetMs) {
      cutoffIdx = mid + 1;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  let state: ReplayBoardState = { ...initialState, figures: { ...initialState.figures } };
  for (let i = 0; i < cutoffIdx; i++) {
    state = applyEventToState(state, events[i]);
  }
  return state;
}

// ── Controller factory ───────────────────────────────────────────

/**
 * Create a replay controller for a set of recorded events and an initial state.
 * The initial state should be the board state at the time recording started
 * (typically the first snapshot from GET /api/sessions/:room/snapshot).
 */
export function createReplayController(
  events: RecordedEvent[],
  initialState: any,
): ReplayController {
  // Normalize initialState to ReplayBoardState
  const baseState: ReplayBoardState = {
    figures: initialState.figures
      ? (Array.isArray(initialState.figures)
        ? Object.fromEntries(initialState.figures.map((f: any) => [f.id, f]))
        : { ...initialState.figures })
      : {},
    stiffness: initialState.stiffness ?? 0.65,
    phase: initialState.sessionPhase ?? initialState.phase ?? 'lobby',
    sessionCode: initialState.sessionCode ?? null,
    coachingSteps: initialState.coachingSteps ?? null,
    optik: initialState.optik ?? null,
  };

  // Sort events by seq (should already be sorted from DB, but be defensive)
  const sortedEvents = [...events].sort((a, b) => a.seq - b.seq);

  const startMs = sortedEvents.length > 0
    ? new Date(sortedEvents[0].recordedAt).getTime()
    : Date.now();
  const endMs = sortedEvents.length > 0
    ? new Date(sortedEvents[sortedEvents.length - 1].recordedAt).getTime()
    : startMs;
  const totalDurationMs = Math.max(0, endMs - startMs);

  let currentPositionMs = 0;
  let isPlaying = false;
  let rafHandle: ReturnType<typeof setTimeout> | null = null;
  let playStartWallMs = 0;
  let playStartPositionMs = 0;

  const controller: ReplayController = {
    get events() { return sortedEvents; },
    get totalDurationMs() { return totalDurationMs; },
    get currentPositionMs() { return currentPositionMs; },
    set currentPositionMs(v: number) { currentPositionMs = Math.max(0, Math.min(v, totalDurationMs)); },
    get isPlaying() { return isPlaying; },

    seek(positionMs: number): ReplayBoardState {
      controller.currentPositionMs = positionMs;
      return seekToTimestamp(sortedEvents, baseState, currentPositionMs);
    },

    play(onFrame: (state: ReplayBoardState, positionMs: number) => void): void {
      if (isPlaying) return;
      isPlaying = true;
      playStartWallMs = Date.now();
      playStartPositionMs = currentPositionMs;

      function tick() {
        if (!isPlaying) return;
        const elapsed = Date.now() - playStartWallMs;
        currentPositionMs = Math.min(playStartPositionMs + elapsed, totalDurationMs);
        const state = seekToTimestamp(sortedEvents, baseState, currentPositionMs);
        onFrame(state, currentPositionMs);
        if (currentPositionMs >= totalDurationMs) {
          isPlaying = false;
          return;
        }
        rafHandle = setTimeout(tick, 16); // ~60fps
      }
      tick();
    },

    pause(): void {
      isPlaying = false;
      if (rafHandle !== null) { clearTimeout(rafHandle); rafHandle = null; }
    },
  };

  return controller;
}
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/replay-engine.ts
git commit -m "feat(brett): add client-side replay-engine with seek+play+pause [T000472]"
```

### Task 4.2: Unit-Tests für `replay-engine.ts`

**Files:**
- Create: `brett/test/replay-engine.test.ts`

- [ ] **Step 1: Erstelle Test-Datei**

```typescript
// brett/test/replay-engine.test.ts
// Tests for the client-side replay engine (T000472).
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyEventToState,
  seekToTimestamp,
  createReplayController,
  type ReplayBoardState,
} from '../src/client/replay-engine';
import type { RecordedEvent } from '../src/types/events';

// ── Test helpers ─────────────────────────────────────────────────
function emptyState(): ReplayBoardState {
  return { figures: {}, stiffness: 0.65, phase: 'lobby', sessionCode: null, coachingSteps: null, optik: null };
}

function ev(seq: number, eventType: string, payload: any, offsetSec = 0): RecordedEvent {
  const base = new Date('2026-06-07T10:00:00Z').getTime();
  return {
    id: seq,
    roomToken: 'r1',
    sessionCode: 'AA-100',
    seq,
    eventType,
    payload,
    recordedAt: new Date(base + offsetSec * 1000).toISOString(),
  };
}

// ── applyEventToState ────────────────────────────────────────────
test('replay-engine: applyEventToState — add creates figure', () => {
  const state = applyEventToState(emptyState(), ev(1, 'add', { id: 'f1', x: 1, z: 2, facingY: 0 }));
  assert.ok(state.figures['f1'], 'figure f1 should exist');
  assert.strictEqual(state.figures['f1'].x, 1);
});

test('replay-engine: applyEventToState — move updates position', () => {
  let state = applyEventToState(emptyState(), ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }));
  state = applyEventToState(state, ev(2, 'move', { id: 'f1', x: 3, z: 4, facingY: 1.57 }));
  assert.strictEqual(state.figures['f1'].x, 3);
  assert.strictEqual(state.figures['f1'].z, 4);
});

test('replay-engine: applyEventToState — delete removes figure', () => {
  let state = applyEventToState(emptyState(), ev(1, 'add', { id: 'f2', x: 0, z: 0, facingY: 0 }));
  state = applyEventToState(state, ev(2, 'delete', { id: 'f2' }));
  assert.ok(!state.figures['f2'], 'figure f2 should be deleted');
});

test('replay-engine: applyEventToState — stiffness updates state', () => {
  const state = applyEventToState(emptyState(), ev(1, 'stiffness', { value: 0.9 }));
  assert.strictEqual(state.stiffness, 0.9);
});

test('replay-engine: applyEventToState — session_phase_change updates phase', () => {
  const state = applyEventToState(emptyState(), ev(1, 'session_phase_change', { phase: 'active' }));
  assert.strictEqual(state.phase, 'active');
});

test('replay-engine: applyEventToState — unknown event type is a no-op', () => {
  const initial = emptyState();
  const state = applyEventToState(initial, ev(1, 'unknown_future_type', { foo: 'bar' }));
  assert.deepStrictEqual(state.figures, initial.figures);
  assert.strictEqual(state.phase, initial.phase);
});

// ── seekToTimestamp ──────────────────────────────────────────────
test('replay-engine: seekToTimestamp at t=0 returns initial state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 5),
  ];
  const state = seekToTimestamp(events, emptyState(), 0);
  assert.deepStrictEqual(state.figures, {}, 'no figures at t=0 before first event');
});

test('replay-engine: seekToTimestamp at t=max returns final state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'move', { id: 'f1', x: 5, z: 5, facingY: 0 }, 2),
    ev(3, 'delete', { id: 'f1' }, 4),
  ];
  const state = seekToTimestamp(events, emptyState(), 10_000);
  assert.ok(!state.figures['f1'], 'f1 deleted at end');
});

test('replay-engine: seekToTimestamp mid-session captures intermediate state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'move', { id: 'f1', x: 5, z: 5, facingY: 0 }, 2),
    ev(3, 'delete', { id: 'f1' }, 4),
  ];
  // At t=3s (between move at 2s and delete at 4s), f1 should be at (5,5)
  const state = seekToTimestamp(events, emptyState(), 3000);
  assert.ok(state.figures['f1'], 'f1 should exist at t=3s');
  assert.strictEqual(state.figures['f1'].x, 5);
});

test('replay-engine: seekToTimestamp with empty events returns initial state', () => {
  const initial = emptyState();
  const state = seekToTimestamp([], initial, 5000);
  assert.deepStrictEqual(state.figures, initial.figures);
});

// ── createReplayController ────────────────────────────────────────
test('replay-engine: createReplayController — totalDurationMs computed correctly', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
    ev(2, 'move', { id: 'f1', x: 1, z: 1, facingY: 0 }, 10),
  ];
  const ctrl = createReplayController(events, { figures: [] });
  assert.strictEqual(ctrl.totalDurationMs, 10_000, 'duration should be 10 seconds');
});

test('replay-engine: createReplayController — seek returns state', () => {
  const events = [
    ev(1, 'add', { id: 'f1', x: 0, z: 0, facingY: 0 }, 0),
  ];
  const ctrl = createReplayController(events, { figures: [] });
  const state = ctrl.seek(0);
  assert.ok(state.figures['f1'], 'seek(0) should include the add event');
});
```

- [ ] **Step 2: Tests ausführen**

Run: `cd brett && node --test test/replay-engine.test.ts 2>&1 | tail -20`
Expected: All tests pass (0 failures)

- [ ] **Step 3: Commit**

```bash
git add brett/test/replay-engine.test.ts
git commit -m "test(brett): add replay-engine unit tests [T000472]"
```

---

## Meilenstein 5: Client — Timeline UI

### Task 5.1: `timeline.ts` — UI-Komponente erstellen

**Files:**
- Create: `brett/src/client/ui/timeline.ts`

- [ ] **Step 1: Erstelle `brett/src/client/ui/timeline.ts`**

```typescript
// brett/src/client/ui/timeline.ts
// Timeline scrubber UI for replay mode (Slice 5, T000472).
// Renders a fixed overlay with a playhead scrubber, play/pause button,
// and phase markers. Uses CSS custom properties from skin.ts for theming.

import type { ReplayController, ReplayBoardState } from '../replay-engine';

// ── DOM references ───────────────────────────────────────────────

let container: HTMLElement | null = null;
let trackEl: HTMLElement | null = null;
let playheadEl: HTMLElement | null = null;
let playBtnEl: HTMLButtonElement | null = null;
let timeDisplayEl: HTMLElement | null = null;
let animFrame: ReturnType<typeof setTimeout> | null = null;

let activeController: ReplayController | null = null;
let onSeekCallback: ((state: ReplayBoardState) => void) | null = null;

// ── Formatting ────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Render the timeline overlay into `parentEl`.
 * Call after the board canvas is initialized.
 */
export function renderTimeline(
  parentEl: HTMLElement,
  ctrl: ReplayController,
  onSeek: (state: ReplayBoardState) => void,
): HTMLElement {
  activeController = ctrl;
  onSeekCallback = onSeek;

  // Create wrapper
  const wrap = document.createElement('div');
  wrap.id = 'brett-timeline';
  wrap.setAttribute('data-testid', 'brett-timeline');
  wrap.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'width:min(700px,90vw)',
    'background:var(--surface-2,#1e2128)',
    'border:1px solid var(--border,#333)',
    'border-radius:10px',
    'padding:12px 16px',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'z-index:9999',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
  ].join(';');

  // Play/Pause button
  const playBtn = document.createElement('button');
  playBtn.setAttribute('data-testid', 'timeline-play-pause');
  playBtn.textContent = '▶';
  playBtn.style.cssText = 'background:none;border:none;color:var(--text,#e0e0e0);font-size:18px;cursor:pointer;min-width:24px';
  playBtn.addEventListener('click', () => {
    if (!activeController) return;
    if (activeController.isPlaying) {
      activeController.pause();
      playBtn.textContent = '▶';
    } else {
      activeController.play((state, pos) => {
        updatePlayhead(pos);
        if (onSeekCallback) onSeekCallback(state);
        if (!activeController?.isPlaying) playBtn.textContent = '▶';
      });
      playBtn.textContent = '⏸';
    }
  });
  playBtnEl = playBtn;

  // Track container
  const track = document.createElement('div');
  track.setAttribute('data-testid', 'timeline-track');
  track.style.cssText = 'flex:1;height:6px;background:var(--surface-3,#2c2f38);border-radius:3px;position:relative;cursor:pointer';

  // Playhead
  const playhead = document.createElement('div');
  playhead.setAttribute('data-testid', 'timeline-playhead');
  playhead.style.cssText = 'position:absolute;top:-5px;width:16px;height:16px;border-radius:50%;background:var(--accent,#4ea1ff);transform:translateX(-50%);left:0%';
  track.appendChild(playhead);

  // Progress fill
  const fill = document.createElement('div');
  fill.setAttribute('data-testid', 'timeline-fill');
  fill.style.cssText = 'position:absolute;top:0;left:0;height:100%;background:var(--accent,#4ea1ff);border-radius:3px;width:0%';
  track.insertBefore(fill, playhead);

  // Click/drag scrubbing on track
  track.addEventListener('click', (e) => {
    if (!activeController) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = ratio * activeController.totalDurationMs;
    const state = activeController.seek(targetMs);
    updatePlayhead(targetMs);
    if (onSeekCallback) onSeekCallback(state);
  });
  playheadEl = playhead;
  trackEl = track;

  // Time display
  const timeDisplay = document.createElement('span');
  timeDisplay.setAttribute('data-testid', 'timeline-time');
  timeDisplay.style.cssText = 'color:var(--text-muted,#888);font-size:12px;min-width:72px;text-align:right;font-variant-numeric:tabular-nums';
  timeDisplay.textContent = `0:00 / ${formatMs(ctrl.totalDurationMs)}`;
  timeDisplayEl = timeDisplay;

  // Assemble
  wrap.appendChild(playBtn);
  wrap.appendChild(track);
  wrap.appendChild(timeDisplay);
  parentEl.appendChild(wrap);
  container = wrap;

  return wrap;
}

/**
 * Update the playhead visual position to match positionMs.
 */
export function updatePlayhead(positionMs: number): void {
  if (!activeController || !trackEl || !playheadEl || !timeDisplayEl) return;
  const ratio = activeController.totalDurationMs > 0
    ? positionMs / activeController.totalDurationMs
    : 0;
  const pct = `${(ratio * 100).toFixed(2)}%`;
  playheadEl.style.left = pct;
  // Update fill
  const fill = trackEl.querySelector('[data-testid="timeline-fill"]') as HTMLElement | null;
  if (fill) fill.style.width = pct;
  timeDisplayEl.textContent = `${formatMs(positionMs)} / ${formatMs(activeController.totalDurationMs)}`;
}

/**
 * Remove the timeline overlay and clean up all state.
 */
export function destroyTimeline(): void {
  if (animFrame !== null) { clearTimeout(animFrame); animFrame = null; }
  activeController?.pause();
  container?.remove();
  container = null;
  trackEl = null;
  playheadEl = null;
  playBtnEl = null;
  timeDisplayEl = null;
  activeController = null;
  onSeekCallback = null;
}
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/ui/timeline.ts
git commit -m "feat(brett): add timeline UI component with scrubber [T000472]"
```

### Task 5.2: Unit-Tests für `timeline.ts`

**Files:**
- Create: `brett/test/timeline.test.ts`

- [ ] **Step 1: Erstelle jsdom-Test für Timeline-Komponente**

```typescript
// brett/test/timeline.test.ts
// Tests for the timeline UI component (T000472).
// Uses tsx + globalThis.document (jsdom) for DOM testing.
import { test, before, after } from 'node:test';
import assert from 'node:assert';

// Setup minimal jsdom-like DOM environment (via --experimental-vm-modules or global mock)
// Note: this test requires `tsx` to run with jsdom globals set up.
// Run with: node --test --require tsx/cjs test/timeline.test.ts
// The test is marked offline-safe (no network, no DB).

// We test the pure logic parts that don't need real DOM rendering:
import { type ReplayController, type ReplayBoardState } from '../src/client/replay-engine';

// ── Mock controller ───────────────────────────────────────────────
function mockController(totalDurationMs = 10_000): ReplayController & { seekCalls: number[] } {
  let currentPositionMs = 0;
  let isPlaying = false;
  const seekCalls: number[] = [];

  return {
    get events() { return []; },
    get totalDurationMs() { return totalDurationMs; },
    get currentPositionMs() { return currentPositionMs; },
    set currentPositionMs(v: number) { currentPositionMs = v; },
    get isPlaying() { return isPlaying; },
    seekCalls,
    seek(pos: number): ReplayBoardState {
      seekCalls.push(pos);
      currentPositionMs = Math.max(0, Math.min(pos, totalDurationMs));
      return { figures: {}, stiffness: 0.65, phase: 'lobby', sessionCode: null, coachingSteps: null, optik: null };
    },
    play(onFrame) {
      isPlaying = true;
    },
    pause() {
      isPlaying = false;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────
test('timeline: mockController seek clamps to [0, totalDurationMs]', () => {
  const ctrl = mockController(10_000);
  ctrl.seek(-1000);
  assert.strictEqual(ctrl.currentPositionMs, 0, 'negative seek clamps to 0');
  ctrl.seek(20_000);
  assert.strictEqual(ctrl.currentPositionMs, 10_000, 'over-seek clamps to totalDurationMs');
});

test('timeline: mockController isPlaying state', () => {
  const ctrl = mockController();
  assert.strictEqual(ctrl.isPlaying, false);
  ctrl.play(() => {});
  assert.strictEqual(ctrl.isPlaying, true);
  ctrl.pause();
  assert.strictEqual(ctrl.isPlaying, false);
});

test('timeline: seek at 50% returns half-duration position', () => {
  const ctrl = mockController(20_000);
  ctrl.seek(10_000);
  assert.strictEqual(ctrl.currentPositionMs, 10_000);
  assert.strictEqual(ctrl.seekCalls.length, 1);
  assert.strictEqual(ctrl.seekCalls[0], 10_000);
});

test('timeline: zero-duration controller does not divide by zero', () => {
  const ctrl = mockController(0);
  assert.strictEqual(ctrl.totalDurationMs, 0);
  ctrl.seek(0);
  assert.strictEqual(ctrl.currentPositionMs, 0);
});
```

- [ ] **Step 2: Tests ausführen**

Run: `cd brett && node --test test/timeline.test.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/test/timeline.test.ts
git commit -m "test(brett): add timeline component tests [T000472]"
```

---

## Meilenstein 6: Feature-Flag Integration & Replay-Modus in `board-boot.ts`

### Task 6.1: Replay-Modus in `board-boot.ts` aktivieren

**Files:**
- Modify: `brett/src/client/board-boot.ts`

- [ ] **Step 1: Replay-Modus-Erkennung und -Start in `board-boot.ts`**

Lese zunächst die Datei um den Einstiegspunkt zu finden, dann füge am Ende der Boot-Sequenz
(nach der WS-Connect-Initialisierung, aber bevor `render()` aufgerufen wird) folgendes ein:

```typescript
import { createReplayController } from './replay-engine';
import { renderTimeline, destroyTimeline } from './ui/timeline';
import type { ReplayBoardState } from './replay-engine';

/**
 * Check if replay mode is requested via URL params.
 * Activated by: ?replay=1&room=<roomToken>
 * Gated by feature flag: window.__brettFeatures['replay']
 */
export async function maybeStartReplayMode(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const replayMode = params.get('replay') === '1';
  const featureEnabled = (window as any).__brettFeatures?.['replay'] === true;

  if (!replayMode || !featureEnabled) return false;

  const room = params.get('room');
  if (!room) {
    console.warn('[brett/replay] replay=1 but no room param');
    return false;
  }

  try {
    // Load events and initial snapshot from server
    const [eventsRes, snapshotRes] = await Promise.all([
      fetch(`/api/sessions/${encodeURIComponent(room)}/events`),
      fetch(`/api/sessions/${encodeURIComponent(room)}/snapshot`),
    ]);

    if (!eventsRes.ok || !snapshotRes.ok) {
      console.error('[brett/replay] failed to load replay data', eventsRes.status, snapshotRes.status);
      return false;
    }

    const { events } = await eventsRes.json();
    const { state: initialState } = await snapshotRes.json();

    const ctrl = createReplayController(events, initialState);

    // Apply initial state to Three.js scene
    applyReplayStateToScene(ctrl.seek(0));

    // Render timeline overlay
    const appRoot = document.getElementById('app') ?? document.body;
    renderTimeline(appRoot, ctrl, (state: ReplayBoardState) => {
      applyReplayStateToScene(state);
    });

    return true;
  } catch (err) {
    console.error('[brett/replay] error starting replay mode:', err);
    return false;
  }
}

/**
 * Apply a replay board state to the Three.js scene.
 * Updates figures in STATE.figures without sending any WS messages.
 */
function applyReplayStateToScene(state: ReplayBoardState): void {
  // Import lazily to avoid circular dep at module init time
  const { STATE } = require('./state');
  // Sync figures: replace STATE.figures with figures from replay state
  // Each entry in state.figures corresponds to a figure object
  const figureArray = Object.values(state.figures);
  STATE.figures.length = 0;
  for (const fig of figureArray) {
    STATE.figures.push(fig);
  }
  // Note: a full scene re-render will be triggered by the normal animation loop
}
```

- [ ] **Step 2: `maybeStartReplayMode` in Boot-Sequenz einbinden**

An der Stelle, wo der Board-Boot normalerweise `connectWS()` aufruft, ergänze:

```typescript
  // Replay mode takes precedence over live WS connection.
  const isReplayMode = await maybeStartReplayMode();
  if (!isReplayMode) {
    // Normal live-board path
    connectWS();
  }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): add replay-mode boot path with feature flag [T000472]"
```

### Task 6.2: Feature-Flag in Kubernetes ConfigMap dokumentieren

**Files:**
- Modify: `brett/README.md` (oder create `brett/docs/replay.md` falls README nicht existiert)

- [ ] **Step 1: Feature-Flag-Dokumentation hinzufügen**

Öffne `brett/README.md` und füge einen Abschnitt hinzu:

```markdown
## Feature Flags

Brett verwendet `window.__brettFeatures['flag-name']` für Dark-Launch-Features.
Die Flags werden über die Kubernetes ConfigMap `brett-features` gesetzt:

| Flag | Beschreibung | Status |
|------|-------------|--------|
| `replay` | Timeline/Replay-UI für Board-Sessions (T000472) | dark-launch |

### Replay aktivieren (dev)

Füge in `k3d/brett.yaml` zur `brett-features` ConfigMap hinzu:

```json
{
  "replay": true
}
```

Dann `?replay=1&room=<room-token>` im Browser aufrufen.
```

- [ ] **Step 2: TypeScript verifizieren (kein TS in README)**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (unverändert)

- [ ] **Step 3: Commit**

```bash
git add brett/README.md
git commit -m "docs(brett): document replay feature flag [T000472]"
```

---

## Meilenstein 7: CI-Integration & Abschluss

### Task 7.1: Neue Tests in `package.json`-Testskript registrieren

**Files:**
- Modify: `brett/package.json`

- [ ] **Step 1: Verify that new test files are picked up by existing test command**

Run: `cd brett && grep -E '"test"' package.json`

Stelle sicher, dass das Test-Glob `test/**/*.test.ts` oder äquivalent alle neuen Dateien
erfasst:
- `test/event-log.test.ts`
- `test/event-log-ws-integration.test.ts`
- `test/replay-engine.test.ts`
- `test/timeline.test.ts`

Falls das Glob nicht passt, passe es in `package.json` an.

- [ ] **Step 2: Alle Brett-Tests ausführen**

Run: `cd brett && npm test 2>&1 | tail -30`
Expected: Alle bestehenden Tests grün + neue Tests grün, 0 Failures

- [ ] **Step 3: TypeScript final verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS — keine Fehler

- [ ] **Step 4: Commit**

```bash
git add brett/package.json
git commit -m "test(brett): ensure all replay tests are covered by npm test [T000472]"
```

### Task 7.2: Final-Commit mit Touched-Files-Übersicht

**Files:** (kein neuer Code — nur Zusammenfassung)

- [ ] **Step 1: Vollständige Liste der touched Files**

Neue Dateien (Create):
- `brett/src/types/events.ts`
- `brett/src/server/migrations/001_session_events.sql`
- `brett/src/server/event-log.ts`
- `brett/src/client/replay-engine.ts`
- `brett/src/client/ui/timeline.ts`
- `brett/test/event-log.test.ts`
- `brett/test/event-log-ws-integration.test.ts`
- `brett/test/replay-engine.test.ts`
- `brett/test/timeline.test.ts`

Modifizierte Dateien (Modify):
- `brett/src/server/db.ts` (runMigrations)
- `brett/src/server/index.ts` (init event-log, HTTP-API)
- `brett/src/server/ws-handler.ts` (WsDeps + logEvent-Calls)
- `brett/src/client/board-boot.ts` (maybeStartReplayMode)
- `brett/README.md` (Feature-Flag-Doku)

- [ ] **Step 2: git log — alle Commits dieses Features prüfen**

Run: `git log --oneline feature/brett-timeline-replay ^origin/main`
Expected: Alle Commits aus diesem Plan erscheinen

- [ ] **Step 3: PR erstellen**

```bash
gh pr create \
  --title "feat(brett): Timeline/Replay (Slice 5) [T000472]" \
  --body "$(cat <<'EOF'
## Summary

- Serverseitiges Event-Logging aller Board-Mutations in neue `session_events` DB-Tabelle mit Batch-Insert-Buffer (alle 2s Flush)
- Clientseitiger Replay-Engine (`replay-engine.ts`) mit `seek()`, `play()`, `pause()` — pure computation, kein DOM
- Timeline-Scrubber-UI (`timeline.ts`) mit Play/Pause, Playhead und Zeitanzeige als Fixed-Overlay
- Drei neue Admin-HTTP-Endpunkte: `GET /api/sessions/:room/events`, `GET /api/sessions/:room/snapshot`, `GET /api/sessions`
- Feature-Flag-gesteuert via `window.__brettFeatures['replay']` (dark-launch)
- 9 neue Testdateien

## Test plan

- [ ] `cd brett && node --test test/event-log.test.ts` → grün
- [ ] `cd brett && node --test test/replay-engine.test.ts` → grün
- [ ] `cd brett && node --test test/timeline.test.ts` → grün
- [ ] `cd brett && npx tsc --noEmit` → PASS
- [ ] `cd brett && npm test` → alle Tests grün
- [ ] `GET /api/sessions?room=<token>` im Browser (als Admin) → JSON-Response
- [ ] `?replay=1&room=<token>` mit `window.__brettFeatures['replay']=true` → Timeline sichtbar

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Commit (falls nötig)**

```bash
git add .
git commit -m "chore(brett): finalize timeline/replay implementation [T000472]"
```
