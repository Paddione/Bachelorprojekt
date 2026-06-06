import { Pool } from 'pg';

type StateBuilder = (room: string) => any;

let pool: Pool | MockPoolLike;
let buildStateFromMutations: StateBuilder;
const pending = new Map<string, NodeJS.Timeout>();

interface MockPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
  connect(): Promise<{ query: any; release: () => void }>;
  on(event: string, listener: (...args: any[]) => void): this;
}

class MockPool implements MockPoolLike {
  async query() { return { rows: [] }; }
  async connect() { return { query: this.query, release: () => {} }; }
  async end() { /* no-op */ }
  on() { return this; }
}

export function initDb(deps: { buildStateFromMutations: StateBuilder }): void {
  buildStateFromMutations = deps.buildStateFromMutations;
  if (process.env.MOCK_DB === 'true') {
    pool = new MockPool();
  } else {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
}

export function getPool(): Pool | MockPoolLike {
  return pool;
}

export async function readState(room: string): Promise<any> {
  const { rows } = await pool.query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room]
  );
  return rows[0]?.state ?? { figures: [] };
}

export async function persistState(room: string): Promise<void> {
  const state = buildStateFromMutations(room);
  if (!state) return;
  await pool.query(
    `INSERT INTO brett_rooms (room_token, state, last_modified_at)
         VALUES ($1, $2, now())
     ON CONFLICT (room_token)
     DO UPDATE SET state = EXCLUDED.state, last_modified_at = EXCLUDED.last_modified_at`,
    [room, state]
  );
}

export function schedulePersist(room: string): void {
  if (pending.has(room)) clearTimeout(pending.get(room)!);
  pending.set(room, setTimeout(() => {
    pending.delete(room);
    persistState(room).catch(err => console.error('[brett] persist:', err));
  }, 1000));
}

export async function flushImmediate(room: string): Promise<void> {
  if (pending.has(room)) {
    clearTimeout(pending.get(room)!);
    pending.delete(room);
  }
  await persistState(room);
}

export function getPending(): Map<string, NodeJS.Timeout> {
  return pending;
}
